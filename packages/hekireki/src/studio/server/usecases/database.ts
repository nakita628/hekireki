import { Effect, Option } from 'effect'
import * as z from 'zod'

import { SQL_ROW_LIMIT } from '../constants/index.js'
import * as DefaultsDomain from '../domain/index.js'
import * as ModelDomain from '../domain/index.js'
import * as SqlDomain from '../domain/index.js'
import * as ValuesDomain from '../domain/index.js'
import { ContractViolationError, InvalidInputError, UnknownModelError } from '../errors/index.js'
import {
  AffectedSchema,
  CountsSchema,
  DbStatusSchema,
  RowsSchema,
  SqlResultSchema,
} from '../routes/index.js'
import * as RuntimeService from '../services/index.js'

/**
 * The connection status as the sidebar shows it.
 *
 * @returns whether a database is open, which dialect and where the URL came from
 */
export function readDbStatus() {
  return Effect.gen(function* () {
    const db = yield* RuntimeService.DatabaseTag
    const result = DbStatusSchema.safeParse(db.status)
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
  })
}

/**
 * Row count of every model that has a table; models without one are left out rather than failing the whole answer.
 *
 * @returns counts keyed by model name
 */
export function readCounts() {
  return Effect.gen(function* () {
    const state = yield* RuntimeService.StudioStateTag
    const db = yield* RuntimeService.DatabaseTag
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
    const result = CountsSchema.safeParse({ counts })
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
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
 *   participant U as readRows
 *   participant St as StudioState
 *   participant D as Database (driver)
 *   U->>St: model by name
 *   St-->>U: model / UnknownModelError
 *   Note over U: select + count statements (domain)
 *   par
 *     U->>D: SELECT page
 *   and
 *     U->>D: COUNT(*)
 *   end
 *   D-->>U: rows, total
 *   Note over U: ValuesDomain.makeRow → validate against Rows
 * ```
 *
 * @param input - the model and the raw paging parameters
 * @returns the page, the total and the key fields that identify a row
 */
export function readRows(input: z.infer<typeof ReadRowsInput>) {
  return Effect.gen(function* () {
    const state = yield* RuntimeService.StudioStateTag
    const model = state.snapshot().schema?.models.find((m) => m.name === input.modelName)
    if (!model) return yield* new UnknownModelError({ model: input.modelName })
    const db = yield* RuntimeService.DatabaseTag
    const driver = yield* db.driver
    const page = { skip: input.skip, take: input.take, search: input.search ?? '' }
    const fields = ModelDomain.tableColumns({ model })
    const columns = fields.map((field) => ModelDomain.columnName({ field }))
    const columnToField = new Map(
      fields.map((field) => [ModelDomain.columnName({ field }), field.name]),
    )
    const enums = state.snapshot().schema?.enums ?? []
    const columnToEnum = ModelDomain.makeEnumReadValues({ model, enums })
    const key = ModelDomain.keyFields({ model })
    const orderBy = key.map((name) => fields.find((f) => f.name === name)?.dbName ?? name)
    const table = ModelDomain.tableName({ model })
    const [selected, counted] = yield* Effect.all([
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
    ])
    const rows = {
      rows: selected.rows.map((row) => ValuesDomain.makeRow({ row, columnToField, columnToEnum })),
      total: Number(counted.rows[0]?.count ?? 0) || 0,
      skip: page.skip,
      take: page.take,
      key,
      columns: fields.map((f) => f.name),
    }
    const result = RowsSchema.safeParse(rows)
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
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
 * @param input - the model and the field values
 * @returns how many rows were written
 */
export function insertRow(input: z.infer<typeof InsertRowInput>) {
  return Effect.gen(function* () {
    const state = yield* RuntimeService.StudioStateTag
    const model = state.snapshot().schema?.models.find((m) => m.name === input.modelName)
    if (!model) return yield* new UnknownModelError({ model: input.modelName })
    const db = yield* RuntimeService.DatabaseTag
    const driver = yield* db.driver
    const written = yield* driver.query(
      SqlDomain.makeInsertStatement({
        dialect: driver.dialect,
        table: ModelDomain.tableName({ model }),
        values: ModelDomain.makeColumnValues({
          model,
          dialect: driver.dialect,
          // Prisma generates uuid() / cuid() / now() in the client; Studio has to do the same.
          row: {
            ...DefaultsDomain.makeGeneratedDefaults({ model, row: input.values }),
            ...input.values,
          },
          enums: state.snapshot().schema?.enums ?? [],
        }),
      }),
    )
    const affected = { affected: written.rowCount }
    const result = AffectedSchema.safeParse(affected)
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
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
 * @param input - the model, the key and the new values
 * @returns how many rows were changed
 */
export function updateRow(input: z.infer<typeof UpdateRowInput>) {
  return Effect.gen(function* () {
    const state = yield* RuntimeService.StudioStateTag
    const model = state.snapshot().schema?.models.find((m) => m.name === input.modelName)
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
    const db = yield* RuntimeService.DatabaseTag
    const driver = yield* db.driver
    const enums = state.snapshot().schema?.enums ?? []
    const written = yield* driver.query(
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
    )
    const affected = { affected: written.rowCount }
    const result = AffectedSchema.safeParse(affected)
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
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
 * @param input - the model and the key
 * @returns how many rows were deleted
 */
export function deleteRow(input: z.infer<typeof DeleteRowInput>) {
  return Effect.gen(function* () {
    const state = yield* RuntimeService.StudioStateTag
    const model = state.snapshot().schema?.models.find((m) => m.name === input.modelName)
    if (!model) return yield* new UnknownModelError({ model: input.modelName })
    if (Object.keys(input.where).length === 0) {
      return yield* new InvalidInputError({
        field: 'where',
        message: 'must name at least one key field',
      })
    }
    const db = yield* RuntimeService.DatabaseTag
    const driver = yield* db.driver
    const enums = state.snapshot().schema?.enums ?? []
    const written = yield* driver.query(
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
    )
    const affected = { affected: written.rowCount }
    const result = AffectedSchema.safeParse(affected)
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
  })
}

const RunSqlInput = z
  .object({
    sql: z
      .string()
      .trim()
      .min(1)
      .brand<'Sql'>()
      .meta({ description: 'One SQL statement, run as is.', example: 'SELECT 1' }),
  })
  .readonly()
  .meta({ description: 'Input for running SQL', example: { sql: 'SELECT * FROM users' } })

/**
 * Runs one statement and returns its rows, or the affected count for writes, with the wall time.
 *
 * @param input - the statement
 * @returns columns, rows, rowCount and durationMs
 */
export function runSql(input: z.infer<typeof RunSqlInput>) {
  return Effect.gen(function* () {
    const db = yield* RuntimeService.DatabaseTag
    const driver = yield* db.driver
    const started = performance.now()
    const executed = yield* driver.query({ sql: input.sql, params: [] })
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
    const result = SqlResultSchema.safeParse(sqlResult)
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
  })
}
