import { Effect, Option } from 'effect'
import * as z from 'zod'

import {
  columnName,
  keyFields,
  makeColumnValues,
  makeCountStatement,
  makeDeleteStatement,
  makeInsertStatement,
  makeRow,
  makeSelectStatement,
  makeUpdateStatement,
  tableColumns,
  tableName,
} from '../domain/index.js'
import { ContractViolationError, InvalidInputError, UnknownModelError } from '../errors/index.js'
import {
  AffectedSchema,
  CountsSchema,
  DbStatusSchema,
  RowsSchema,
  SqlResultSchema,
} from '../routes/index.js'
import { DatabaseTag, requireDriver, runStatement, StudioStateTag } from '../services/index.js'

/**
 * The connection status as the sidebar shows it.
 *
 * @returns whether a database is open, which dialect and where the URL came from
 */
export function readDbStatus() {
  return Effect.gen(function* () {
    const db = yield* DatabaseTag
    const result = DbStatusSchema.safeParse(db.status())
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
    const state = yield* StudioStateTag
    const driver = yield* requireDriver({ db: yield* DatabaseTag })
    const models = state.snapshot().schema?.models ?? []
    const counted = yield* Effect.forEach(
      models,
      (model) =>
        runStatement({
          driver,
          statement: makeCountStatement({
            dialect: driver.dialect,
            table: tableName({ model }),
            columns: [],
            search: '',
          }),
        }).pipe(Effect.option),
      { concurrency: 4 },
    )
    const result = CountsSchema.safeParse({
      counts: Object.fromEntries(
        models.flatMap((model, index) => {
          const count = counted[index]
          return count !== undefined && Option.isSome(count)
            ? [[model.name, Number(count.value.rows[0]?.count ?? 0) || 0] as const]
            : []
        }),
      ),
    })
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
 *   Note over U: makeRow → validate against Rows
 * ```
 *
 * @param input - the model and the raw paging parameters
 * @returns the page, the total and the key fields that identify a row
 */
export function readRows(input: z.infer<typeof ReadRowsInput>) {
  return Effect.gen(function* () {
    const state = yield* StudioStateTag
    const model = state.snapshot().schema?.models.find((m) => m.name === input.modelName)
    if (!model) return yield* new UnknownModelError({ model: input.modelName })
    const driver = yield* requireDriver({ db: yield* DatabaseTag })
    const page = { skip: input.skip, take: input.take, search: input.search ?? '' }
    const fields = tableColumns({ model })
    const columns = fields.map((field) => columnName({ field }))
    const columnToField = new Map(fields.map((field) => [columnName({ field }), field.name]))
    const key = keyFields({ model })
    const orderBy = key.map((name) => fields.find((f) => f.name === name)?.dbName ?? name)
    const table = tableName({ model })
    const [selected, counted] = yield* Effect.all([
      runStatement({
        driver,
        statement: makeSelectStatement({
          dialect: driver.dialect,
          table,
          columns,
          orderBy,
          ...page,
        }),
      }),
      runStatement({
        driver,
        statement: makeCountStatement({
          dialect: driver.dialect,
          table,
          columns,
          search: page.search,
        }),
      }),
    ])
    const result = RowsSchema.safeParse({
      rows: selected.rows.map((row) => makeRow({ row, columnToField })),
      total: Number(counted.rows[0]?.count ?? 0) || 0,
      skip: page.skip,
      take: page.take,
      key,
      columns: fields.map((f) => f.name),
    })
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
    const state = yield* StudioStateTag
    const model = state.snapshot().schema?.models.find((m) => m.name === input.modelName)
    if (!model) return yield* new UnknownModelError({ model: input.modelName })
    const driver = yield* requireDriver({ db: yield* DatabaseTag })
    const written = yield* runStatement({
      driver,
      statement: makeInsertStatement({
        dialect: driver.dialect,
        table: tableName({ model }),
        values: makeColumnValues({ model, dialect: driver.dialect, row: input.values }),
      }),
    })
    const result = AffectedSchema.safeParse({ affected: written.rowCount })
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
    const state = yield* StudioStateTag
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
    const driver = yield* requireDriver({ db: yield* DatabaseTag })
    const written = yield* runStatement({
      driver,
      statement: makeUpdateStatement({
        dialect: driver.dialect,
        table: tableName({ model }),
        where: makeColumnValues({ model, dialect: driver.dialect, row: input.where }),
        values: makeColumnValues({ model, dialect: driver.dialect, row: input.values }),
      }),
    })
    const result = AffectedSchema.safeParse({ affected: written.rowCount })
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
    const state = yield* StudioStateTag
    const model = state.snapshot().schema?.models.find((m) => m.name === input.modelName)
    if (!model) return yield* new UnknownModelError({ model: input.modelName })
    if (Object.keys(input.where).length === 0) {
      return yield* new InvalidInputError({
        field: 'where',
        message: 'must name at least one key field',
      })
    }
    const driver = yield* requireDriver({ db: yield* DatabaseTag })
    const written = yield* runStatement({
      driver,
      statement: makeDeleteStatement({
        dialect: driver.dialect,
        table: tableName({ model }),
        where: makeColumnValues({ model, dialect: driver.dialect, row: input.where }),
      }),
    })
    const result = AffectedSchema.safeParse({ affected: written.rowCount })
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
    const driver = yield* requireDriver({ db: yield* DatabaseTag })
    const started = performance.now()
    const executed = yield* runStatement({ driver, statement: { sql: input.sql, params: [] } })
    const result = SqlResultSchema.safeParse({
      columns: executed.columns,
      rows: executed.rows.map((row) => makeRow({ row, columnToField: new Map() })),
      rowCount: executed.rowCount,
      durationMs: Math.round((performance.now() - started) * 10) / 10,
    })
    if (!result.success) {
      return yield* new ContractViolationError({ message: result.error.message })
    }
    return result.data
  })
}
