import { Effect, Option } from 'effect'
import * as z from 'zod'

import { analyze, splitStatements } from '../../../sql/index.js'
import { SQL_ROW_LIMIT } from '../constants/index.js'
import * as DatabaseErrorDomain from '../domain/index.js'
import * as DefaultsDomain from '../domain/index.js'
import * as ModelDomain from '../domain/index.js'
import * as PlanDomain from '../domain/index.js'
import * as SchemaDomain from '../domain/index.js'
import * as SqlDomain from '../domain/index.js'
import * as ValuesDomain from '../domain/index.js'
import { DatabaseError, InvalidInputError, UnknownModelError } from '../errors/index.js'
import * as StudioService from '../services/index.js'

/**
 * A statement's failure as a person reads it: the driver's message with the way out appended,
 * for the errors a schema-first workflow runs into (a table not migrated, a required column).
 */
function worded<A, R>(statement: Effect.Effect<A, DatabaseError, R>) {
  return statement.pipe(
    Effect.mapError(
      (error) =>
        new DatabaseError({
          cause: DatabaseErrorDomain.makeDatabaseErrorMessage({ message: error.cause }),
        }),
    ),
  )
}

/**
 * The connection status as the sidebar shows it.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as DatabaseUseCase
 *   participant S as StudioService
 *   H->>U: readDbStatus()
 *   U->>S: studio().db.status
 *   S-->>U: connected, dialect, url, source, error
 *   U-->>H: status
 * ```
 *
 * @returns whether a database is open, which dialect and where the URL came from
 */
export function readDbStatus() {
  return Effect.sync(() => StudioService.studio().db.status)
}

/**
 * Row count of every model that has a table; models without one are left out rather than failing the whole answer.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as DatabaseUseCase
 *   participant S as StudioService
 *   participant D as DatabaseService
 *   participant M as ModelDomain
 *   participant Q as SqlDomain
 *   H->>U: readCounts()
 *   U->>S: studio() state, db
 *   S-->>U: snapshot models, db
 *   U->>D: db.driver
 *   alt DatabaseUnavailableError
 *     U-->>H: the failure
 *   end
 *   loop each model, four at a time
 *     U->>M: tableName({ model })
 *     U->>Q: makeCountStatement({ dialect, table })
 *     U->>D: query(count)
 *     alt the query fails (no table)
 *       Note over U: the model is left out
 *     else count
 *       D-->>U: rows[0].count
 *     end
 *   end
 *   U-->>H: counts keyed by model name
 * ```
 *
 * @returns counts keyed by model name
 */
export function readCounts() {
  return Effect.gen(function* () {
    const { state, db } = StudioService.studio()
    const driver = yield* db.driver
    const models = state.snapshot().schema?.models ?? []
    const counted = yield* Effect.forEach(
      models,
      (model) =>
        driver
          .query(
            SqlDomain.makeCountStatement({
              dialect: driver.dialect,
              table: ModelDomain.tableName({ model }),
              columns: [],
              search: '',
            }),
          )
          .pipe(Effect.option),
      { concurrency: 4 },
    )
    const counts = Object.fromEntries(
      models.flatMap((model, index) => {
        const count = counted[index]
        return count !== undefined && Option.isSome(count)
          ? [[model.name, Number(count.value.rows[0]?.count ?? 0) || 0] as const]
          : []
      }),
    )
    return { counts }
  })
}

const ReadRowsInput = z
  .object({
    modelName: z
      .string()
      .regex(/^[A-Za-z][A-Za-z0-9_]*$/u)
      .brand<'ModelName'>()
      .meta({ description: 'The Prisma model name, as validated in the path.', example: 'User' }),
    skip: z
      .number()
      .int()
      .min(0)
      .brand<'Skip'>()
      .meta({ description: 'Rows to skip before the page.', example: 0 }),
    take: z
      .number()
      .int()
      .min(1)
      .max(1000)
      .brand<'Take'>()
      .meta({ description: 'Rows per page.', example: 100 }),
    search: z.string().trim().brand<'Search'>().optional().meta({
      description: 'Text every returned row must contain; empty for all rows.',
      example: 'ann',
    }),
  })
  .readonly()
  .meta({
    description: 'Input for reading one page of a model',
    example: { modelName: 'User', skip: 0, take: 100 },
  })

/**
 * One page of a model's table, keyed by field names, with the total for paging.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as DatabaseUseCase
 *   participant S as StudioService
 *   participant D as DatabaseService
 *   participant M as ModelDomain
 *   participant Q as SqlDomain
 *   participant V as ValuesDomain
 *   participant E as DatabaseErrorDomain
 *   H->>U: readRows({ modelName, skip, take, search })
 *   U->>S: studio().state
 *   S-->>U: snapshot
 *   alt no model of that name
 *     U-->>H: UnknownModelError
 *   end
 *   U->>D: db.driver
 *   alt DatabaseUnavailableError
 *     U-->>H: the failure
 *   end
 *   U->>M: tableColumns, columnName, makeEnumReadValues, keyFields, tableName
 *   U->>Q: makeSelectStatement / makeCountStatement
 *   par
 *     U->>D: query(select page)
 *   and
 *     U->>D: query(count)
 *   end
 *   alt DatabaseError
 *     U->>E: makeDatabaseErrorMessage({ message })
 *     U-->>H: DatabaseError, with the way out
 *   else rows, total
 *     U->>V: makeRow({ row, columnToField, columnToEnum }) per row
 *     U-->>H: rows, total, skip, take, key, columns
 *   end
 * ```
 *
 * @param input - the model and the raw paging parameters
 * @returns the page, the total and the key fields that identify a row
 */
export function readRows(input: z.infer<typeof ReadRowsInput>) {
  return Effect.gen(function* () {
    const { state, db } = StudioService.studio()
    const schema = state.snapshot().schema
    const model = schema?.models.find((m) => m.name === input.modelName)
    if (!model) return yield* new UnknownModelError({ model: input.modelName })
    const driver = yield* db.driver
    const page = { skip: input.skip, take: input.take, search: input.search ?? '' }
    const fields = ModelDomain.tableColumns({ model })
    const columns = fields.map((field) => ModelDomain.columnName({ field }))
    const columnToField = new Map(
      fields.map((field) => [ModelDomain.columnName({ field }), field.name]),
    )
    const enums = schema?.enums ?? []
    const columnToEnum = ModelDomain.makeEnumReadValues({ model, enums })
    const key = ModelDomain.keyFields({ model })
    const orderBy = key.map((name) => fields.find((f) => f.name === name)?.dbName ?? name)
    const table = ModelDomain.tableName({ model })
    const [selected, counted] = yield* worded(
      Effect.all([
        driver.query(
          SqlDomain.makeSelectStatement({
            dialect: driver.dialect,
            table,
            columns,
            orderBy,
            ...page,
          }),
        ),
        driver.query(
          SqlDomain.makeCountStatement({
            dialect: driver.dialect,
            table,
            columns,
            search: page.search,
          }),
        ),
      ]),
    )
    const rows = {
      rows: selected.rows.map((row) => ValuesDomain.makeRow({ row, columnToField, columnToEnum })),
      total: Number(counted.rows[0]?.count ?? 0) || 0,
      skip: page.skip,
      take: page.take,
      key,
      columns: fields.map((f) => f.name),
    }
    return rows
  })
}

const InsertRowInput = z
  .object({
    modelName: z
      .string()
      .regex(/^[A-Za-z][A-Za-z0-9_]*$/u)
      .brand<'ModelName'>()
      .meta({ description: 'The Prisma model name, as validated in the path.', example: 'User' }),
    values: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .readonly()
      .meta({
        description: 'Field values for the new row; omitted fields take their defaults.',
      }),
  })
  .readonly()
  .meta({
    description: 'Input for inserting a row',
    example: { modelName: 'User', values: { email: 'ann@example.com' } },
  })

/**
 * Inserts one row; field names are translated to columns and values to the driver's representation.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as DatabaseUseCase
 *   participant S as StudioService
 *   participant D as DatabaseService
 *   participant F as DefaultsDomain
 *   participant M as ModelDomain
 *   participant Q as SqlDomain
 *   participant E as DatabaseErrorDomain
 *   H->>U: insertRow({ modelName, values })
 *   U->>S: studio().state
 *   S-->>U: snapshot
 *   alt no model of that name
 *     U-->>H: UnknownModelError
 *   end
 *   U->>D: db.driver
 *   alt DatabaseUnavailableError
 *     U-->>H: the failure
 *   end
 *   U->>F: makeGeneratedFields({ model, row })
 *   U->>S: generateDefaults({ fields })
 *   S-->>U: uuid(), cuid(), now() values
 *   U->>M: makeColumnValues({ model, dialect, row, enums })
 *   U->>Q: makeInsertStatement({ dialect, table, values })
 *   U->>D: query(insert)
 *   alt DatabaseError
 *     U->>E: makeDatabaseErrorMessage({ message })
 *     U-->>H: DatabaseError, with the way out
 *   else rowCount
 *     U-->>H: affected
 *   end
 * ```
 *
 * @param input - the model and the field values
 * @returns how many rows were written
 */
export function insertRow(input: z.infer<typeof InsertRowInput>) {
  return Effect.gen(function* () {
    const { state, db } = StudioService.studio()
    const schema = state.snapshot().schema
    const model = schema?.models.find((m) => m.name === input.modelName)
    if (!model) return yield* new UnknownModelError({ model: input.modelName })
    const driver = yield* db.driver
    // Prisma generates uuid() / cuid() / now() in the client; Studio has to do the same.
    const generated = yield* StudioService.generateDefaults({
      fields: DefaultsDomain.makeGeneratedFields({ model, row: input.values }),
    })
    const written = yield* worded(
      driver.query(
        SqlDomain.makeInsertStatement({
          dialect: driver.dialect,
          table: ModelDomain.tableName({ model }),
          values: ModelDomain.makeColumnValues({
            model,
            dialect: driver.dialect,
            row: { ...generated, ...input.values },
            enums: schema?.enums ?? [],
          }),
        }),
      ),
    )
    const affected = { affected: written.rowCount }
    return affected
  })
}

const UpdateRowInput = z
  .object({
    modelName: z
      .string()
      .regex(/^[A-Za-z][A-Za-z0-9_]*$/u)
      .brand<'ModelName'>()
      .meta({ description: 'The Prisma model name, as validated in the path.', example: 'User' }),
    where: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .readonly()
      .meta({ description: 'The key fields of the row to change.' }),
    values: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .readonly()
      .meta({ description: 'The fields to set.' }),
  })
  .readonly()
  .meta({
    description: 'Input for updating a row',
    example: { modelName: 'User', where: { id: 1 }, values: { name: 'Ann' } },
  })

/**
 * Updates the row identified by `where`; both parts must name at least one field.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as DatabaseUseCase
 *   participant S as StudioService
 *   participant D as DatabaseService
 *   participant M as ModelDomain
 *   participant Q as SqlDomain
 *   participant E as DatabaseErrorDomain
 *   H->>U: updateRow({ modelName, where, values })
 *   U->>S: studio().state
 *   S-->>U: snapshot
 *   alt no model of that name
 *     U-->>H: UnknownModelError
 *   else where or values names no field
 *     U-->>H: InvalidInputError
 *   end
 *   U->>D: db.driver
 *   alt DatabaseUnavailableError
 *     U-->>H: the failure
 *   end
 *   U->>M: makeColumnValues for where and for values
 *   U->>Q: makeUpdateStatement({ dialect, table, where, values })
 *   U->>D: query(update)
 *   alt DatabaseError
 *     U->>E: makeDatabaseErrorMessage({ message })
 *     U-->>H: DatabaseError, with the way out
 *   else rowCount
 *     U-->>H: affected
 *   end
 * ```
 *
 * @param input - the model, the key and the new values
 * @returns how many rows were changed
 */
export function updateRow(input: z.infer<typeof UpdateRowInput>) {
  return Effect.gen(function* () {
    const { state, db } = StudioService.studio()
    const schema = state.snapshot().schema
    const model = schema?.models.find((m) => m.name === input.modelName)
    if (!model) return yield* new UnknownModelError({ model: input.modelName })
    if (Object.keys(input.where).length === 0) {
      return yield* new InvalidInputError({
        field: 'where',
        message: 'must name at least one key field',
      })
    }
    if (Object.keys(input.values).length === 0) {
      return yield* new InvalidInputError({
        field: 'values',
        message: 'must name at least one field',
      })
    }
    const driver = yield* db.driver
    const enums = schema?.enums ?? []
    const written = yield* worded(
      driver.query(
        SqlDomain.makeUpdateStatement({
          dialect: driver.dialect,
          table: ModelDomain.tableName({ model }),
          where: ModelDomain.makeColumnValues({
            model,
            dialect: driver.dialect,
            row: input.where,
            enums,
          }),
          values: ModelDomain.makeColumnValues({
            model,
            dialect: driver.dialect,
            row: input.values,
            enums,
          }),
        }),
      ),
    )
    const affected = { affected: written.rowCount }
    return affected
  })
}

const DeleteRowInput = z
  .object({
    modelName: z
      .string()
      .regex(/^[A-Za-z][A-Za-z0-9_]*$/u)
      .brand<'ModelName'>()
      .meta({ description: 'The Prisma model name, as validated in the path.', example: 'User' }),
    where: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .readonly()
      .meta({ description: 'The key fields of the row to delete.' }),
  })
  .readonly()
  .meta({
    description: 'Input for deleting a row',
    example: { modelName: 'User', where: { id: 1 } },
  })

/**
 * Deletes the row identified by `where`.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as DatabaseUseCase
 *   participant S as StudioService
 *   participant D as DatabaseService
 *   participant M as ModelDomain
 *   participant Q as SqlDomain
 *   participant E as DatabaseErrorDomain
 *   H->>U: deleteRow({ modelName, where })
 *   U->>S: studio().state
 *   S-->>U: snapshot
 *   alt no model of that name
 *     U-->>H: UnknownModelError
 *   else where names no field
 *     U-->>H: InvalidInputError
 *   end
 *   U->>D: db.driver
 *   alt DatabaseUnavailableError
 *     U-->>H: the failure
 *   end
 *   U->>M: makeColumnValues({ model, dialect, row: where, enums })
 *   U->>Q: makeDeleteStatement({ dialect, table, where })
 *   U->>D: query(delete)
 *   alt DatabaseError
 *     U->>E: makeDatabaseErrorMessage({ message })
 *     U-->>H: DatabaseError, with the way out
 *   else rowCount
 *     U-->>H: affected
 *   end
 * ```
 *
 * @param input - the model and the key
 * @returns how many rows were deleted
 */
export function deleteRow(input: z.infer<typeof DeleteRowInput>) {
  return Effect.gen(function* () {
    const { state, db } = StudioService.studio()
    const schema = state.snapshot().schema
    const model = schema?.models.find((m) => m.name === input.modelName)
    if (!model) return yield* new UnknownModelError({ model: input.modelName })
    if (Object.keys(input.where).length === 0) {
      return yield* new InvalidInputError({
        field: 'where',
        message: 'must name at least one key field',
      })
    }
    const driver = yield* db.driver
    const enums = schema?.enums ?? []
    const written = yield* worded(
      driver.query(
        SqlDomain.makeDeleteStatement({
          dialect: driver.dialect,
          table: ModelDomain.tableName({ model }),
          where: ModelDomain.makeColumnValues({
            model,
            dialect: driver.dialect,
            row: input.where,
            enums,
          }),
        }),
      ),
    )
    const affected = { affected: written.rowCount }
    return affected
  })
}

const Cell = z
  .union([z.string(), z.number(), z.boolean(), z.null()])
  .meta({ description: 'A JSON cell value as the UI sends and shows it' })

const RunSqlInput = z
  .object({
    sql: z
      .string()
      .trim()
      .min(1)
      .brand<'Sql'>()
      .meta({ description: 'The statements to run.', example: 'SELECT 1' }),
    params: z
      .array(Cell)
      .readonly()
      .meta({ description: 'The values bound to the placeholders, in order.' }),
  })
  .readonly()
  .meta({
    description: 'Input for running SQL',
    example: { sql: 'SELECT * FROM users', params: [] },
  })

/**
 * Runs the statements one by one and returns the rows of the last, or its affected count for a
 * write, with the wall time of the whole.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as DatabaseUseCase
 *   participant S as StudioService
 *   participant D as DatabaseService
 *   participant X as sql (splitStatements)
 *   participant V as ValuesDomain
 *   participant E as DatabaseErrorDomain
 *   H->>U: runSql({ sql, params })
 *   U->>S: studio().db
 *   U->>D: db.driver
 *   alt DatabaseUnavailableError
 *     U-->>H: the failure
 *   end
 *   U->>X: splitStatements(sql)
 *   alt no statement
 *     U-->>H: InvalidInputError
 *   end
 *   U->>V: makeBindValue({ dialect, value }) per param
 *   loop each statement, in order
 *     U->>D: query({ sql, params })
 *   end
 *   alt DatabaseError
 *     U->>E: makeDatabaseErrorMessage({ message })
 *     U-->>H: DatabaseError, with the way out
 *   else results
 *     Note over U: the last result, its first SQL_ROW_LIMIT rows
 *     U->>V: makeRow({ row, columnToField }) per row
 *     U-->>H: columns, rows, rowCount, durationMs
 *   end
 * ```
 *
 * @param input - the text and the parameter values
 * @returns columns, rows, rowCount and durationMs
 */
export function runSql(input: z.infer<typeof RunSqlInput>) {
  return Effect.gen(function* () {
    const db = StudioService.studio().db
    const driver = yield* db.driver
    const statements = splitStatements(input.sql)
    if (statements.length === 0) {
      return yield* new InvalidInputError({ field: 'sql', message: 'holds no statement' })
    }
    const params = input.params.map((value) =>
      ValuesDomain.makeBindValue({ dialect: driver.dialect, value }),
    )
    const started = performance.now()
    const results = yield* worded(
      Effect.forEach(statements, (sql) => driver.query({ sql, params })),
    )
    const executed = results.at(-1) ?? { columns: [], rows: [], rowCount: 0 }
    const sqlResult = {
      columns: executed.columns,
      // Only the first page of a large result travels to the browser; `rowCount` still says how
      // many rows the statement produced, which is how the page knows it is showing a slice.
      rows: executed.rows
        .slice(0, SQL_ROW_LIMIT)
        .map((row) => ValuesDomain.makeRow({ row, columnToField: new Map() })),
      rowCount: executed.rowCount,
      durationMs: Math.round((performance.now() - started) * 10) / 10,
    }
    return sqlResult
  })
}

/**
 * The execution plan the database chooses for the first statement of the text.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as DatabaseUseCase
 *   participant S as StudioService
 *   participant D as DatabaseService
 *   participant X as sql (splitStatements)
 *   participant V as ValuesDomain
 *   participant Q as SqlDomain
 *   participant P as PlanDomain
 *   participant E as DatabaseErrorDomain
 *   H->>U: explainSql({ sql, params })
 *   U->>S: studio().db
 *   U->>D: db.driver
 *   alt DatabaseUnavailableError
 *     U-->>H: the failure
 *   end
 *   U->>X: splitStatements(sql)
 *   alt no statement
 *     U-->>H: InvalidInputError
 *   end
 *   U->>V: makeBindValue({ dialect, value }) per param
 *   U->>Q: makeExplainStatement({ dialect, sql: first })
 *   U->>D: query({ sql: explain, params })
 *   alt DatabaseError
 *     U->>E: makeDatabaseErrorMessage({ message })
 *     U-->>H: DatabaseError, with the way out
 *   else rows
 *     U->>P: makePlan({ dialect, rows })
 *     P-->>U: nodes, raw
 *     U-->>H: dialect, nodes, raw
 *   end
 * ```
 *
 * @param input - the text and the parameter values
 * @returns the plan steps, parents first, and the plan as the database printed it
 */
export function explainSql(input: z.infer<typeof RunSqlInput>) {
  return Effect.gen(function* () {
    const db = StudioService.studio().db
    const driver = yield* db.driver
    const [first] = splitStatements(input.sql)
    if (first === undefined) {
      return yield* new InvalidInputError({ field: 'sql', message: 'holds no statement' })
    }
    const params = input.params.map((value) =>
      ValuesDomain.makeBindValue({ dialect: driver.dialect, value }),
    )
    const explained = yield* worded(
      driver.query({
        sql: SqlDomain.makeExplainStatement({ dialect: driver.dialect, sql: first }),
        params,
      }),
    )
    const { nodes, raw } = PlanDomain.makePlan({ dialect: driver.dialect, rows: explained.rows })
    const plan = { dialect: driver.dialect, nodes, raw }
    return plan
  })
}

const AnalyzeSqlInput = z
  .object({
    sql: z
      .string()
      .trim()
      .min(1)
      .brand<'Sql'>()
      .meta({ description: 'The statements to analyze.', example: 'SELECT id FROM users' }),
  })
  .readonly()
  .meta({ description: 'Input for analyzing SQL', example: { sql: 'SELECT id FROM users' } })

/**
 * Analyzes every statement of the text against the tables of the Prisma schema: the dialect is
 * the connected database's, or the datasource provider's while none is connected.
 *
 * ```mermaid
 * sequenceDiagram
 *   participant H as Handler
 *   participant U as DatabaseUseCase
 *   participant S as StudioService
 *   participant C as SchemaDomain
 *   participant X as sql (analyze)
 *   H->>U: analyzeSql({ sql })
 *   U->>S: studio() state, db
 *   S-->>U: snapshot schema, db.status.dialect
 *   U->>C: makeAnalysisSchema({ dialect, provider, models })
 *   U->>X: analyze(sql, schema)
 *   X-->>U: graph, lineage, row type, parameters, diagnostics
 *   U-->>H: the analysis of each statement
 * ```
 *
 * @param input - the text
 * @returns the data-flow graph, lineage, row type, parameters and diagnostics of each statement
 */
export function analyzeSql(input: z.infer<typeof AnalyzeSqlInput>) {
  return Effect.sync(() => {
    const { state, db } = StudioService.studio()
    const schema = state.snapshot().schema
    return analyze(
      input.sql,
      SchemaDomain.makeAnalysisSchema({
        dialect: db.status.dialect,
        provider: schema?.provider ?? null,
        models: schema?.models ?? [],
      }),
    )
  })
}
