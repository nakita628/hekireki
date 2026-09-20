import { Effect } from 'effect'
import * as z from 'zod'

import { fmt } from '../../../format/index.js'
import { formatSql } from '../../../sql/index.js'
import { CLIENT_ROW_LIMIT } from '../constants/index.js'
import * as ClientDomain from '../domain/index.js'
import { ContractViolationError, InvalidInputError } from '../errors/index.js'
import {
  ClientAnalysisSchema,
  ClientCompletionDetailSchema,
  ClientCompletionsSchema,
  ClientFormattedSchema,
  ClientHoverSchema,
  ClientPreviewSchema,
  ClientResultSchema,
  ClientSignatureHelpSchema,
  ClientStatusSchema,
  ClientTypeDiagnosticsSchema,
} from '../routes/index.js'
import * as RuntimeService from '../services/index.js'

/**
 * Whether the project's Prisma Client loads; the first request loads it.
 *
 * @returns available, where it was loaded from, and why it is not available
 */
export function readClientStatus() {
  return Effect.gen(function* () {
    const state = yield* RuntimeService.StudioStateTag
    const client = yield* RuntimeService.ClientTag
    const status = yield* client.status(state.snapshot().files)
    const result = ClientStatusSchema.safeParse(status)
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
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
 * @param input - the query text
 * @returns the calls, whether they are a transaction, and what keeps the query from being run
 */
export function analyzeClientQuery(input: z.infer<typeof AnalyzeClientQueryInput>) {
  return Effect.gen(function* () {
    const state = yield* RuntimeService.StudioStateTag
    const models = state.snapshot().schema?.models ?? []
    const query = ClientDomain.makeClientQuery({
      text: input.query,
      models: models.map((model) => model.name),
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
    const result = ClientAnalysisSchema.safeParse(analysis)
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
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
 *   participant U as runClientQuery
 *   participant St as StudioState
 *   participant C as Client (Prisma Client)
 *   participant Db as Database
 *   U->>St: models, schema files
 *   U->>Db: dialect, for laying the statements out
 *   Note over U: read the text into calls (domain)
 *   U->>C: run(calls)
 *   C-->>U: value, query events / ClientUnavailableError / ClientQueryError
 *   Note over U: value as JSON, first CLIENT_ROW_LIMIT rows → validate against ClientResult
 * ```
 *
 * @param input - the query text
 * @returns the result as JSON, its row count, the statements and the wall time
 */
export function runClientQuery(input: z.infer<typeof RunClientQueryInput>) {
  return Effect.gen(function* () {
    const state = yield* RuntimeService.StudioStateTag
    const client = yield* RuntimeService.ClientTag
    const db = yield* RuntimeService.DatabaseTag
    const snapshot = state.snapshot()
    const models = (snapshot.schema?.models ?? []).map((model) => model.name)
    const query = ClientDomain.makeClientQuery({ text: input.query, models })
    const [problem] = query.diagnostics
    if (problem !== undefined) {
      return yield* new InvalidInputError({ field: 'query', message: problem.message })
    }
    const ran = yield* client.run(snapshot.files, query)
    const clientResult = {
      ...ClientDomain.makeClientResult({ value: ran.value, limit: CLIENT_ROW_LIMIT }),
      queries: ran.queries.map((event) => ({
        sql: event.sql,
        formatted: formatSql(event.sql, db.status.dialect),
        params: ClientDomain.makeSqlParams({ text: event.params }),
        durationMs: Math.round(event.durationMs * 10) / 10,
      })),
      durationMs: Math.round(ran.durationMs * 10) / 10,
    }
    const result = ClientResultSchema.safeParse(clientResult)
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
  })
}

/**
 * Runs a call that only reads, to show the SQL it sends while it is being typed. A write is
 * refused: its SQL shows when it is run, once the write has been confirmed.
 *
 * @param input - the query text
 * @returns the statements the client sent and the wall time
 */
export function previewClientQuery(input: z.infer<typeof RunClientQueryInput>) {
  return Effect.gen(function* () {
    const state = yield* RuntimeService.StudioStateTag
    const models = (state.snapshot().schema?.models ?? []).map((model) => model.name)
    const write = ClientDomain.makeClientQuery({ text: input.query, models }).calls.find(
      (call) => call.write,
    )
    if (write !== undefined) {
      return yield* new InvalidInputError({
        field: 'query',
        message: `${write.model}.${write.operation} writes: its SQL shows when it is run`,
      })
    }
    const ran = yield* runClientQuery(input)
    const result = ClientPreviewSchema.safeParse({
      queries: ran.queries,
      durationMs: ran.durationMs,
    })
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
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
 * @param input - the text and the cursor offset
 * @returns the items
 */
export function completeClientQuery(input: z.infer<typeof QueryPositionInput>) {
  return Effect.gen(function* () {
    const state = yield* RuntimeService.StudioStateTag
    const client = yield* RuntimeService.ClientTag
    const items = yield* client.typescript.complete(
      state.snapshot().files,
      input.query,
      input.offset,
    )
    const result = ClientCompletionsSchema.safeParse({ items })
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
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
 * @param input - the text, the cursor offset and the item
 * @returns the signature and the doc comment
 */
export function detailClientCompletion(input: z.infer<typeof CompletionDetailInput>) {
  return Effect.gen(function* () {
    const state = yield* RuntimeService.StudioStateTag
    const client = yield* RuntimeService.ClientTag
    const detail = yield* client.typescript.detail(
      state.snapshot().files,
      input.query,
      input.offset,
      input.name,
    )
    const result = ClientCompletionDetailSchema.safeParse(detail)
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
  })
}

/**
 * What TypeScript says about the symbol at the position.
 *
 * @param input - the text and the pointer offset
 * @returns the type and documentation, and the symbol's range
 */
export function hoverClientQuery(input: z.infer<typeof QueryPositionInput>) {
  return Effect.gen(function* () {
    const state = yield* RuntimeService.StudioStateTag
    const client = yield* RuntimeService.ClientTag
    const hover = yield* client.typescript.hover(state.snapshot().files, input.query, input.offset)
    const result = ClientHoverSchema.safeParse(hover)
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
  })
}

/**
 * The signatures of the call the cursor is inside.
 *
 * @param input - the text and the cursor offset
 * @returns the overloads and which one and which parameter is active
 */
export function signatureClientQuery(input: z.infer<typeof QueryPositionInput>) {
  return Effect.gen(function* () {
    const state = yield* RuntimeService.StudioStateTag
    const client = yield* RuntimeService.ClientTag
    const help = yield* client.typescript.signature(
      state.snapshot().files,
      input.query,
      input.offset,
    )
    const result = ClientSignatureHelpSchema.safeParse(help)
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
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
 * @param input - the text
 * @returns the problems, in order of position
 */
export function checkClientQuery(input: z.infer<typeof CheckClientQueryInput>) {
  return Effect.gen(function* () {
    const state = yield* RuntimeService.StudioStateTag
    const client = yield* RuntimeService.ClientTag
    const diagnostics = yield* client.typescript.check(state.snapshot().files, input.query)
    const result = ClientTypeDiagnosticsSchema.safeParse({ diagnostics })
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
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
 * @param input - the text
 * @returns the whole text, formatted
 */
export function formatClientQuery(input: z.infer<typeof FormatClientQueryInput>) {
  return Effect.gen(function* () {
    const text = yield* fmt(input.query)
    const result = ClientFormattedSchema.safeParse({ text: text.trimEnd() })
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
  })
}
