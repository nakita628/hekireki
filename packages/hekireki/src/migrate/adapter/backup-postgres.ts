import { Effect } from 'effect'
import * as z from 'zod'

import type { Driver } from '../../studio/server/services/database.js'
import {
  POSTGRES_ENUM_COLUMNS,
  POSTGRES_RESTORE_CATALOGUE,
  postgresBackupStatements,
  postgresClearStatements,
  postgresRestoreStatements,
} from '../domain/backup.js'
import { MigrateConfigError } from '../errors.js'
import { introspectDatabase } from './introspect.js'
import { countTables } from './rehearse.js'

// A backup on PostgreSQL that can be restored: beside the copy of every table, the backup keeps
// the statements that make the schema again as it was (written from the catalogue when it is
// taken) and a record of what the database was then. A restore drops what is there, runs them,
// and compares the database it made with that record before it commits: what differs is rolled
// back and said, so a restore either puts everything back or changes nothing.

/** Where a backup keeps the statements of its restore, in order, and what the database was. */
const RESTORE_TABLE = '_hekireki_restore'
const STATE_TABLE = '_hekireki_state'

const CatalogueColumns = z
  .array(
    z.object({
      table: z.string().meta({ description: 'The table.', example: 'User' }),
      column: z.string().meta({ description: 'The column.', example: 'role' }),
      type: z
        .string()
        .meta({ description: 'Its type, as format_type says it.', example: '"Role"' }),
      notNull: z.boolean().meta({ description: 'Whether it is NOT NULL.', example: true }),
      default: z
        .string()
        .nullable()
        .meta({ description: 'Its default, or what it is generated from.', example: '0' }),
      identity: z
        .string()
        .meta({ description: '`a` or `d` for an identity column, else empty.', example: '' }),
      generated: z
        .string()
        .meta({ description: '`s` for a stored generated column, else empty.', example: '' }),
      collation: z
        .string()
        .nullable()
        .meta({ description: 'Its collation, when not that of its type.', example: '"C"' }),
      isEnum: z
        .boolean()
        .meta({ description: 'Whether its type is an enum or an array of one.', example: true }),
    }),
  )
  .meta({ description: 'Every column of every table of the schema' })

const CatalogueEnums = z
  .array(
    z.object({
      name: z.string().meta({ description: 'The enum.', example: 'Role' }),
      label: z.string().meta({ description: 'One of its labels.', example: 'ADMIN' }),
    }),
  )
  .meta({ description: 'The labels of every enum of the schema, in order' })

const CatalogueSequences = z
  .array(
    z.object({
      name: z.string().meta({ description: 'The sequence.', example: 'User_id_seq' }),
      type: z.string().meta({ description: 'The type it counts in.', example: 'integer' }),
      start: z.string().meta({ description: 'Where it starts.', example: '1' }),
      increment: z.string().meta({ description: 'Its step.', example: '1' }),
      min: z.string().meta({ description: 'Its least value.', example: '1' }),
      max: z.string().meta({ description: 'Its greatest value.', example: '2147483647' }),
      cache: z.string().meta({ description: 'How many values it keeps ahead.', example: '1' }),
      cycle: z.boolean().meta({ description: 'Whether it starts over.', example: false }),
      table: z
        .string()
        .meta({ description: 'The table of the column that owns it.', example: 'User' }),
      column: z.string().meta({ description: 'The column that owns it.', example: 'id' }),
      identity: z
        .boolean()
        .meta({ description: 'Whether an identity column made it.', example: false }),
      last: z
        .string()
        .nullable()
        .meta({ description: 'Where it had got to; null when never used.', example: '42' }),
    }),
  )
  .meta({ description: 'The sequences columns of the schema own' })

const CatalogueConstraints = z
  .array(
    z.object({
      table: z.string().meta({ description: 'The table.', example: 'Post' }),
      name: z.string().meta({ description: 'The constraint.', example: 'Post_authorId_fkey' }),
      foreign: z.boolean().meta({ description: 'Whether it is a foreign key.', example: true }),
      definition: z.string().meta({
        description: 'As pg_get_constraintdef writes it.',
        example: 'FOREIGN KEY ("authorId") REFERENCES "User"(id)',
      }),
    }),
  )
  .meta({ description: 'Every constraint of every table of the schema' })

const Definitions = z
  .array(
    z.object({
      definition: z.string().meta({
        description: 'A statement as PostgreSQL writes it.',
        example: 'CREATE INDEX "Post_title_idx" ON public."Post" USING btree (title)',
      }),
    }),
  )
  .meta({
    description: 'The indexes or the triggers of the schema, each as the statement that makes it',
  })

const Names = z
  .array(
    z.object({
      table: z
        .string()
        .optional()
        .meta({ description: 'The table, for a constraint.', example: 'Post' }),
      name: z.string().meta({ description: 'What is named.', example: 'Post_authorId_fkey' }),
    }),
  )
  .meta({ description: 'Names read from the catalogue' })

/** What the database is, to compare a restore with: every table as the check reads it, and its rows. */
function stateOf(driver: Driver) {
  return Effect.gen(function* () {
    const introspected = yield* introspectDatabase({ driver, dialect: 'postgresql', schemas: [] })
    const rows = yield* countTables(driver)
    // Asked for before it is counted: inside a transaction a statement that fails, caught or
    // not, leaves PostgreSQL refusing the rest, and the COMMIT after it undoes everything in silence.
    const recorded = yield* driver.query({
      sql: `SELECT to_regclass('"_prisma_migrations"') IS NOT NULL AS "there"`,
      params: [],
    })
    const history =
      recorded.rows[0]?.there === true
        ? (yield* driver.query({
            sql: 'SELECT COUNT(*)::int AS "count" FROM "_prisma_migrations"',
            params: [],
          })).rows[0]?.count
        : null
    return JSON.stringify({ tables: introspected.tables, rows, history })
  })
}

/**
 * Takes the backup: a schema named for it with a copy of every table, the statements of its
 * restore, and what the database was. All of it in one transaction: a backup is whole or not there.
 *
 * @param driver - the open connection
 * @param name - what the backup is called, which is the name of its schema
 */
export function createPostgresBackup(driver: Driver, name: string) {
  return Effect.gen(function* () {
    const schema = (yield* driver.query({
      sql: 'SELECT current_schema() AS "name"',
      params: [],
    })).rows
    const current = typeof schema[0]?.name === 'string' ? schema[0].name : 'public'
    const columns = CatalogueColumns.safeParse(
      (yield* driver.query(POSTGRES_RESTORE_CATALOGUE.columns)).rows,
    )
    const enums = CatalogueEnums.safeParse(
      (yield* driver.query(POSTGRES_RESTORE_CATALOGUE.enums)).rows,
    )
    const sequences = CatalogueSequences.safeParse(
      (yield* driver.query(POSTGRES_RESTORE_CATALOGUE.sequences)).rows,
    )
    const constraints = CatalogueConstraints.safeParse(
      (yield* driver.query(POSTGRES_RESTORE_CATALOGUE.constraints)).rows,
    )
    const indexes = Definitions.safeParse(
      (yield* driver.query(POSTGRES_RESTORE_CATALOGUE.indexes)).rows,
    )
    const triggers = Definitions.safeParse(
      (yield* driver.query(POSTGRES_RESTORE_CATALOGUE.triggers)).rows,
    )
    const enumColumns = (yield* driver.query(POSTGRES_ENUM_COLUMNS)).rows
    if (
      !columns.success ||
      !enums.success ||
      !sequences.success ||
      !constraints.success ||
      !indexes.success ||
      !triggers.success
    ) {
      return yield* new MigrateConfigError({
        message: 'The backup could not be taken: the catalogue of the database did not read.',
      })
    }
    const tables = [...new Set(columns.data.map((column) => column.table))]
    const copies = postgresBackupStatements({
      name,
      schema: current,
      tables: tables.map((table) => ({
        table,
        columns: columns.data.filter((one) => one.table === table).map((one) => one.column),
      })),
      enumColumns: enumColumns.map((row) => ({
        table: String(row.table),
        column: String(row.column),
        array: row.array === true,
      })),
    })
    const restore = postgresRestoreStatements({
      name,
      schema: current,
      columns: columns.data,
      enums: enums.data,
      sequences: sequences.data,
      constraints: constraints.data,
      indexes: indexes.data.map((one) => one.definition),
      triggers: triggers.data.map((one) => one.definition),
    })
    const state = yield* stateOf(driver)
    const quoted = `"${name}"`
    yield* driver.executeScript(
      [
        'BEGIN',
        ...copies,
        `CREATE TABLE ${quoted}."${RESTORE_TABLE}" ("position" integer PRIMARY KEY, "statement" text NOT NULL)`,
        `CREATE TABLE ${quoted}."${STATE_TABLE}" ("state" text NOT NULL)`,
      ].join(';\n'),
    )
    yield* Effect.forEach(restore, (statement, position) =>
      driver.executeRaw({
        sql: `INSERT INTO ${quoted}."${RESTORE_TABLE}" ("position", "statement") VALUES ($1, $2)`,
        params: [position, statement],
      }),
    )
    yield* driver.executeRaw({
      sql: `INSERT INTO ${quoted}."${STATE_TABLE}" ("state") VALUES ($1)`,
      params: [state],
    })
    yield* driver.executeScript('COMMIT')
    return name
    // A failure of the database goes up as it is: Studio answers it as the database's own.
  }).pipe(Effect.tapError(() => driver.executeScript('ROLLBACK').pipe(Effect.ignore)))
}

/**
 * Puts the database back as the backup has it, in one transaction: the tables and enums of the
 * schema dropped (never with CASCADE, so what the backup cannot make again stops it), the
 * backup's statements run, and the database they made compared with what it was when the backup
 * was taken. It commits only when the two are the same.
 *
 * @param driver - the open connection
 * @param name - the backup, which is the name of its schema
 */
export function restorePostgresBackup(driver: Driver, name: string) {
  return Effect.gen(function* () {
    const quoted = `"${name}"`
    const stored = yield* driver
      .query({
        sql: `SELECT "statement" FROM ${quoted}."${RESTORE_TABLE}" ORDER BY "position"`,
        params: [],
      })
      .pipe(
        Effect.mapError(
          () =>
            new MigrateConfigError({
              message: `${name} was taken before Studio could restore a PostgreSQL backup: its rows are in the schema of that name, and what to bring back is for a person to say.`,
            }),
        ),
      )
    const kept = (yield* driver.query({
      sql: `SELECT "state" FROM ${quoted}."${STATE_TABLE}"`,
      params: [],
    })).rows
    const schema = (yield* driver.query({
      sql: 'SELECT current_schema() AS "name"',
      params: [],
    })).rows
    const tables = Names.safeParse(
      (yield* driver.query({
        sql: `SELECT c.relname AS "name" FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = current_schema() AND c.relkind = 'r' ORDER BY 1`,
        params: [],
      })).rows,
    )
    const foreignKeys = Names.safeParse(
      (yield* driver.query({
        sql: `SELECT t.relname AS "table", c.conname AS "name" FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE n.nspname = current_schema() AND c.contype = 'f' ORDER BY 1, 2`,
        params: [],
      })).rows,
    )
    const enums = Names.safeParse(
      (yield* driver.query({
        sql: `SELECT t.typname AS "name" FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = current_schema() AND t.typtype = 'e' ORDER BY 1`,
        params: [],
      })).rows,
    )
    if (!tables.success || !foreignKeys.success || !enums.success) {
      return yield* new MigrateConfigError({
        message: 'The backup could not be restored: the catalogue of the database did not read.',
      })
    }
    const clear = postgresClearStatements({
      schema: typeof schema[0]?.name === 'string' ? schema[0].name : 'public',
      tables: tables.data.map((one) => one.name),
      foreignKeys: foreignKeys.data.map((one) => ({ table: one.table ?? '', name: one.name })),
      enums: enums.data.map((one) => one.name),
    })
    yield* driver.executeScript(
      ['BEGIN', ...clear, ...stored.rows.map((row) => String(row.statement))].join(';\n'),
    )
    const state = yield* stateOf(driver)
    if (state !== kept[0]?.state) {
      return yield* new MigrateConfigError({
        message: `The backup could not be restored: the database ${name} makes again is not the one it was taken of, so nothing was changed. Its rows are in the schema of that name.`,
      })
    }
    // A transaction PostgreSQL has given up on takes COMMIT as ROLLBACK and says nothing: it is
    // asked one more thing first, which such a transaction refuses.
    yield* driver.query({ sql: 'SELECT 1', params: [] })
    yield* driver.executeScript('COMMIT')
    return name
  }).pipe(
    Effect.tapError(() => driver.executeScript('ROLLBACK').pipe(Effect.ignore)),
    Effect.mapError((error) =>
      error instanceof MigrateConfigError
        ? error
        : new MigrateConfigError({
            message: `The backup could not be restored, and nothing was changed: ${error.cause}`,
          }),
    ),
  )
}
