import { Clock, Effect } from 'effect'
import * as z from 'zod'

import { fmt } from '../../../format/index.js'
import { formatSql } from '../../../sql/index.js'
import { CLIENT_ROW_LIMIT } from '../constants/index.js'
import * as ClientDomain from '../domain/index.js'
import { InvalidInputError } from '../errors/index.js'
import * as StudioService from '../services/index.js'

/**
 * Whether the project's Prisma Client loads; the first request loads it.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as ClientUseCase
 *   participant S as StudioService
 *   participant P as ClientService
 *   participant T as TypescriptService
 *   H->>U: readClientStatus()
 *   U->>S: studio() state, client, typescript
 *   S-->>U: snapshot files, client, type checker
 *   U->>P: client.status(files)
 *   Note over P: loads the client the first time, a failure reads as not available
 *   P-->>U: available, source, error
 *   U->>T: typescript.status(files)
 *   Note over T: loads the checker the first time, a failure reads as typesError
 *   T-->>U: typescript, typesError
 *   U-->>H: both, as one status
 * ```
 *
 * @returns available, where it was loaded from, and why it is not available
 */
export function readClientStatus() {
  return Effect.gen(function* () {
    const state = StudioService.studio().state
    const client = StudioService.studio().client
    const typescript = StudioService.studio().typescript
    const loaded = yield* client.status(state.snapshot().files)
    const types = yield* typescript.status(state.snapshot().files)
    const status = { ...loaded, ...types }
    return status
  })
}

const AnalyzeClientQueryInput = z
  .object({
    query: z.string().trim().min(1).brand<'ClientQuery'>().meta({
      description: 'The call, as TypeScript would write it.',
      example: 'prisma.user.findMany()',
    }),
  })
  .readonly()
  .meta({
    description: 'Input for reading a Prisma Client query',
    example: { query: 'prisma.user.findMany()' },
  })

/**
 * Reads the query against the models of the last schema that parsed, without running it.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as ClientUseCase
 *   participant S as StudioService
 *   participant C as ClientDomain
 *   H->>U: analyzeClientQuery({ query })
 *   U->>S: studio().state
 *   S-->>U: snapshot models
 *   Note over U: Clock.currentTimeMillis, for now() in the text
 *   U->>C: makeClientQuery({ text, models, now })
 *   C-->>U: calls, transaction, diagnostics
 *   U->>C: makeClientTouched({ calls, models })
 *   U-->>H: calls, transaction, touched, diagnostics
 * ```
 *
 * @param input - the query text
 * @returns the calls, whether they are a transaction, and what keeps the query from being run
 */
export function analyzeClientQuery(input: z.infer<typeof AnalyzeClientQueryInput>) {
  return Effect.gen(function* () {
    const state = StudioService.studio().state
    const models = state.snapshot().schema?.models ?? []
    const now = yield* Clock.currentTimeMillis
    const query = ClientDomain.makeClientQuery({
      text: input.query,
      models: models.map((model) => model.name),
      now,
    })
    const analysis = {
      calls: query.calls.map(({ model, operation, write, range }) => ({
        model,
        operation,
        write,
        range,
      })),
      transaction: query.transaction,
      touched: ClientDomain.makeClientTouched({ calls: query.calls, models }),
      diagnostics: query.diagnostics,
    }
    return analysis
  })
}

const RunClientQueryInput = z
  .object({
    query: z.string().trim().min(1).brand<'ClientQuery'>().meta({
      description: 'The call, as TypeScript would write it.',
      example: 'prisma.user.findMany({ take: 10 })',
    }),
  })
  .readonly()
  .meta({
    description: 'Input for running a Prisma Client query',
    example: { query: 'prisma.user.findMany({ take: 10 })' },
  })

/**
 * Runs the query through the project's Prisma Client and returns what it resolved to, with the
 * statements the client sent for it.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as ClientUseCase
 *   participant S as StudioService
 *   participant C as ClientDomain
 *   participant P as ClientService
 *   participant X as sql (formatSql)
 *   H->>U: runClientQuery({ query })
 *   U->>S: studio() state, client, db
 *   S-->>U: snapshot, client, db.status.dialect
 *   U->>C: makeClientQuery({ text, models, now })
 *   alt the text has a diagnostic
 *     U-->>H: InvalidInputError
 *   end
 *   U->>P: client.run(files, query)
 *   alt ClientUnavailableError or ClientQueryError
 *     U-->>H: the failure
 *   else ran
 *     P-->>U: value, query events, durationMs
 *     loop each statement the client sent
 *       U->>X: formatSql(sql, dialect)
 *     end
 *     U->>C: makeClientResult({ value, limit }), makeSqlParams({ text })
 *     U-->>H: result as JSON, rowCount, queries, durationMs
 *   end
 * ```
 *
 * @param input - the query text
 * @returns the result as JSON, its row count, the statements and the wall time
 */
export function runClientQuery(input: z.infer<typeof RunClientQueryInput>) {
  return Effect.gen(function* () {
    const state = StudioService.studio().state
    const client = StudioService.studio().client
    const db = StudioService.studio().db
    const snapshot = state.snapshot()
    const models = (snapshot.schema?.models ?? []).map((model) => model.name)
    const now = yield* Clock.currentTimeMillis
    const query = ClientDomain.makeClientQuery({ text: input.query, models, now })
    const [problem] = query.diagnostics
    if (problem !== undefined) {
      return yield* new InvalidInputError({ field: 'query', message: problem.message })
    }
    const ran = yield* client.run(snapshot.files, query)
    const formatted = yield* Effect.forEach(ran.queries, (event) =>
      formatSql(event.sql, db.status.dialect),
    )
    const clientResult = {
      ...ClientDomain.makeClientResult({ value: ran.value, limit: CLIENT_ROW_LIMIT }),
      queries: ran.queries.map((event, index) => ({
        sql: event.sql,
        formatted: formatted[index] ?? event.sql,
        params: ClientDomain.makeSqlParams({ text: event.params }),
        durationMs: Math.round(event.durationMs * 10) / 10,
      })),
      durationMs: Math.round(ran.durationMs * 10) / 10,
    }
    return clientResult
  })
}

/**
 * Runs a call that only reads, to show the SQL it sends while it is being typed. A write is
 * refused: its SQL shows when it is run, once the write has been confirmed.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as ClientUseCase
 *   participant S as StudioService
 *   participant C as ClientDomain
 *   participant P as ClientService
 *   H->>U: previewClientQuery({ query })
 *   U->>S: studio().state
 *   S-->>U: snapshot models
 *   U->>C: makeClientQuery({ text, models, now })
 *   alt a call writes
 *     U-->>H: InvalidInputError
 *   end
 *   Note over U: runClientQuery(input), with its failures
 *   U->>P: client.run(files, query)
 *   P-->>U: value, query events, durationMs
 *   U-->>H: queries, durationMs
 * ```
 *
 * @param input - the query text
 * @returns the statements the client sent and the wall time
 */
export function previewClientQuery(input: z.infer<typeof RunClientQueryInput>) {
  return Effect.gen(function* () {
    const state = StudioService.studio().state
    const models = (state.snapshot().schema?.models ?? []).map((model) => model.name)
    const now = yield* Clock.currentTimeMillis
    const write = ClientDomain.makeClientQuery({ text: input.query, models, now }).calls.find(
      (call) => call.write,
    )
    if (write !== undefined) {
      return yield* new InvalidInputError({
        field: 'query',
        message: `${write.model}.${write.operation} writes: its SQL shows when it is run`,
      })
    }
    const ran = yield* runClientQuery(input)
    return {
      queries: ran.queries,
      durationMs: ran.durationMs,
    }
  })
}

const QueryPositionInput = z
  .object({
    query: z.string().trim().min(1).brand<'ClientQuery'>().meta({
      description: 'The query text as typed so far.',
      example: 'prisma.user.findMany({ wh',
    }),
    offset: z
      .number()
      .int()
      .min(0)
      .brand<'QueryOffset'>()
      .meta({ description: 'Where the cursor is, in UTF-16 code units.', example: 25 }),
  })
  .readonly()
  .meta({
    description: 'A position in a query',
    example: { query: 'prisma.user.findMany({ wh', offset: 25 },
  })

/**
 * The completions TypeScript offers at the position, checked against the client's types.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as ClientUseCase
 *   participant S as StudioService
 *   participant T as TypescriptService
 *   H->>U: completeClientQuery({ query, offset })
 *   U->>S: studio() state, typescript
 *   S-->>U: snapshot files, type checker
 *   U->>T: typescript.complete(files, query, offset)
 *   Note over T: loads the checker over the project's client the first time
 *   alt ClientUnavailableError
 *     U-->>H: the failure
 *   else items
 *     T-->>U: items
 *     U-->>H: items
 *   end
 * ```
 *
 * @param input - the text and the cursor offset
 * @returns the items
 */
export function completeClientQuery(input: z.infer<typeof QueryPositionInput>) {
  return Effect.gen(function* () {
    const state = StudioService.studio().state
    const typescript = StudioService.studio().typescript
    const items = yield* typescript.complete(state.snapshot().files, input.query, input.offset)
    return { items }
  })
}

const CompletionDetailInput = z
  .object({
    query: z.string().trim().min(1).brand<'ClientQuery'>().meta({
      description: 'The query text as typed so far.',
      example: 'prisma.user.findMany({ wh',
    }),
    offset: z
      .number()
      .int()
      .min(0)
      .brand<'QueryOffset'>()
      .meta({ description: 'Where the cursor is, in UTF-16 code units.', example: 25 }),
    name: z.string().meta({ description: 'The label of the item.', example: 'where' }),
  })
  .readonly()
  .meta({
    description: 'One completion to say more about',
    example: { query: 'prisma.user.findMany({ wh', offset: 25, name: 'where' },
  })

/**
 * The type and documentation of one completion item.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as ClientUseCase
 *   participant S as StudioService
 *   participant T as TypescriptService
 *   H->>U: detailClientCompletion({ query, offset, name })
 *   U->>S: studio() state, typescript
 *   S-->>U: snapshot files, type checker
 *   U->>T: typescript.detail(files, query, offset, name)
 *   Note over T: loads the checker over the project's client the first time
 *   alt ClientUnavailableError
 *     U-->>H: the failure
 *   else signature, documentation
 *     T-->>U: signature, documentation
 *     U-->>H: signature, documentation
 *   end
 * ```
 *
 * @param input - the text, the cursor offset and the item
 * @returns the signature and the doc comment
 */
export function detailClientCompletion(input: z.infer<typeof CompletionDetailInput>) {
  return Effect.gen(function* () {
    const state = StudioService.studio().state
    const typescript = StudioService.studio().typescript
    const detail = yield* typescript.detail(
      state.snapshot().files,
      input.query,
      input.offset,
      input.name,
    )
    return detail
  })
}

/**
 * What TypeScript says about the symbol at the position.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as ClientUseCase
 *   participant S as StudioService
 *   participant T as TypescriptService
 *   H->>U: hoverClientQuery({ query, offset })
 *   U->>S: studio() state, typescript
 *   S-->>U: snapshot files, type checker
 *   U->>T: typescript.hover(files, query, offset)
 *   Note over T: loads the checker over the project's client the first time
 *   alt ClientUnavailableError
 *     U-->>H: the failure
 *   else type, documentation, range
 *     T-->>U: type, documentation, range
 *     U-->>H: type, documentation, range
 *   end
 * ```
 *
 * @param input - the text and the pointer offset
 * @returns the type and documentation, and the symbol's range
 */
export function hoverClientQuery(input: z.infer<typeof QueryPositionInput>) {
  return Effect.gen(function* () {
    const state = StudioService.studio().state
    const typescript = StudioService.studio().typescript
    const hover = yield* typescript.hover(state.snapshot().files, input.query, input.offset)
    return hover
  })
}

/**
 * The signatures of the call the cursor is inside.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as ClientUseCase
 *   participant S as StudioService
 *   participant T as TypescriptService
 *   H->>U: signatureClientQuery({ query, offset })
 *   U->>S: studio() state, typescript
 *   S-->>U: snapshot files, type checker
 *   U->>T: typescript.signature(files, query, offset)
 *   Note over T: loads the checker over the project's client the first time
 *   alt ClientUnavailableError
 *     U-->>H: the failure
 *   else overloads, active signature and parameter
 *     T-->>U: overloads, active signature and parameter
 *     U-->>H: overloads, active signature and parameter
 *   end
 * ```
 *
 * @param input - the text and the cursor offset
 * @returns the overloads and which one and which parameter is active
 */
export function signatureClientQuery(input: z.infer<typeof QueryPositionInput>) {
  return Effect.gen(function* () {
    const state = StudioService.studio().state
    const typescript = StudioService.studio().typescript
    const help = yield* typescript.signature(state.snapshot().files, input.query, input.offset)
    return help
  })
}

const CheckClientQueryInput = z
  .object({
    query: z.string().trim().min(1).brand<'ClientQuery'>().meta({
      description: 'The query text.',
      example: 'prisma.user.findMany({ nope: 1 })',
    }),
  })
  .readonly()
  .meta({
    description: 'Input for checking a query against the types',
    example: { query: 'prisma.user.findMany()' },
  })

/**
 * What TypeScript finds wrong with the query, checked against the client's types.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as ClientUseCase
 *   participant S as StudioService
 *   participant T as TypescriptService
 *   H->>U: checkClientQuery({ query })
 *   U->>S: studio() state, typescript
 *   S-->>U: snapshot files, type checker
 *   U->>T: typescript.check(files, query)
 *   Note over T: loads the checker over the project's client the first time
 *   alt ClientUnavailableError
 *     U-->>H: the failure
 *   else diagnostics
 *     T-->>U: diagnostics
 *     U-->>H: diagnostics
 *   end
 * ```
 *
 * @param input - the text
 * @returns the problems, in order of position
 */
export function checkClientQuery(input: z.infer<typeof CheckClientQueryInput>) {
  return Effect.gen(function* () {
    const state = StudioService.studio().state
    const typescript = StudioService.studio().typescript
    const diagnostics = yield* typescript.check(state.snapshot().files, input.query)
    return { diagnostics }
  })
}

const FormatClientQueryInput = z
  .object({
    query: z.string().trim().min(1).brand<'ClientQuery'>().meta({
      description: 'The query text.',
      example: 'prisma.user.findMany({take:10})',
    }),
  })
  .readonly()
  .meta({
    description: 'Input for formatting a query',
    example: { query: 'prisma.user.findMany({take:10})' },
  })

/**
 * The query laid out as the repository's TypeScript formatter writes it.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as ClientUseCase
 *   participant F as format (fmt)
 *   H->>U: formatClientQuery({ query })
 *   U->>F: fmt(query)
 *   alt FormatError
 *     U-->>H: the failure
 *   else text
 *     F-->>U: formatted text
 *     U-->>H: text, trailing newline trimmed
 *   end
 * ```
 *
 * @param input - the text
 * @returns the whole text, formatted
 */
export function formatClientQuery(input: z.infer<typeof FormatClientQueryInput>) {
  return Effect.gen(function* () {
    const text = yield* fmt(input.query)
    return { text: text.trimEnd() }
  })
}
