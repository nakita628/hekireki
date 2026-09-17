import { Effect } from 'effect'

import type { Dialect } from '../../database/url.js'
import {
  catalogueText,
  INTERNAL_TABLES,
  makeMysqlTables,
  makePostgresTables,
  makeSqliteTable,
  MYSQL_STATEMENTS,
  postgresStatements,
  SQLITE_EXTRAS,
  SQLITE_TABLES,
  sqliteIndexStatement,
  sqliteStatements,
} from '../domain/catalogue.js'

/** One SQLite table: its columns, then the columns of each unique index that covers every row. */
function introspectSqliteTable<E>(
  driver: {
    readonly query: (statement: {
      readonly sql: string
      readonly params: readonly unknown[]
    }) => Effect.Effect<{ readonly rows: readonly Readonly<Record<string, unknown>>[] }, E>
  },
  input: {
    readonly table: string
    readonly triggers: readonly string[]
    readonly definition: string
  },
) {
  const { table } = input
  return Effect.gen(function* () {
    const statements = sqliteStatements(table)
    const columns = yield* driver.query(statements.columns)
    const indexes = yield* driver.query(statements.indexes)
    const foreignKeys = yield* driver.query(statements.foreignKeys)
    const uniques = yield* Effect.forEach(
      indexes.rows.filter(
        (row) => catalogueText(row, 'unique') === '1' && catalogueText(row, 'partial') !== '1',
      ),
      (row) =>
        driver
          .query(sqliteIndexStatement(catalogueText(row, 'name')))
          .pipe(Effect.map((result) => result.rows.map((column) => catalogueText(column, 'name')))),
    )
    return makeSqliteTable({
      table,
      columns: columns.rows,
      uniques,
      foreignKeys: foreignKeys.rows,
      triggers: input.triggers,
      definition: input.definition,
    })
  })
}

/**
 * The tables of the connected database: on PostgreSQL the current schema and every `@@schema`
 * the models name, with `defaultSchema` the one an unqualified model lands in; the connected
 * database on MySQL, with `mariadb` saying whether the server is MariaDB; the file on SQLite.
 *
 * A column's `maxLength` is the most characters its type holds, `precision` and `scale` the
 * digits of a decimal, `datetimePrecision` the digits of its fractional seconds, each when the
 * catalogue says; `enumValues` the values its type admits, when it restricts them. A foreign
 * key is `enforced` when the database has checked every row against it, so no orphan can be
 * there; `onDelete` and `onUpdate` are its rules, lower case (`no action`, `restrict`,
 * `cascade`, `set null`, `set default`).
 */
export function introspectDatabase<E>(input: {
  readonly driver: {
    readonly query: (statement: {
      readonly sql: string
      readonly params: readonly unknown[]
    }) => Effect.Effect<{ readonly rows: readonly Readonly<Record<string, unknown>>[] }, E>
  }
  readonly dialect: Dialect
  /** The `@@schema` names the models use, for PostgreSQL. */
  readonly schemas: readonly string[]
}) {
  const { driver } = input
  return Effect.gen(function* () {
    if (input.dialect === 'postgresql') {
      const statements = postgresStatements(input.schemas)
      const current = yield* driver.query(statements.current)
      const [columns, enums, uniques, foreignKeys] = yield* Effect.forEach(
        [statements.columns, statements.enums, statements.uniques, statements.foreignKeys],
        (statement) => driver.query(statement).pipe(Effect.map((result) => result.rows)),
      )
      // What Prisma's schema does not describe. A server that does not answer these (an older
      // CockroachDB has no triggers to list) is read as having none, rather than failing the check.
      const [triggers, checks] = yield* Effect.forEach(
        [statements.triggers, statements.checks],
        (statement) =>
          driver.query(statement).pipe(
            Effect.map((result) => result.rows),
            Effect.orElseSucceed((): readonly Readonly<Record<string, unknown>>[] => []),
          ),
      )
      return {
        defaultSchema: catalogueText(current.rows[0] ?? {}, 'schema') || 'public',
        mariadb: false,
        tables: makePostgresTables({
          columns: columns ?? [],
          enums: enums ?? [],
          uniques: uniques ?? [],
          foreignKeys: foreignKeys ?? [],
          triggers: triggers ?? [],
          checks: checks ?? [],
        }),
      }
    }
    if (input.dialect === 'mysql') {
      const version = yield* driver.query(MYSQL_STATEMENTS.version)
      const [columns, uniques, foreignKeys] = yield* Effect.forEach(
        [MYSQL_STATEMENTS.columns, MYSQL_STATEMENTS.uniques, MYSQL_STATEMENTS.foreignKeys],
        (statement) => driver.query(statement).pipe(Effect.map((result) => result.rows)),
      )
      // MariaDB speaks the mysql:// protocol, and converts text to numbers more strictly.
      const mariadb = /mariadb/iu.test(catalogueText(version.rows[0] ?? {}, 'version'))
      // A server too old to list CHECK constraints (MySQL before 8.0.16) enforces none.
      const [triggers, checks] = yield* Effect.forEach(
        [
          MYSQL_STATEMENTS.triggers,
          mariadb ? MYSQL_STATEMENTS.mariadbChecks : MYSQL_STATEMENTS.checks,
        ],
        (statement) =>
          driver.query(statement).pipe(
            Effect.map((result) => result.rows),
            Effect.orElseSucceed((): readonly Readonly<Record<string, unknown>>[] => []),
          ),
      )
      return {
        defaultSchema: null,
        mariadb,
        tables: makeMysqlTables({
          columns: columns ?? [],
          uniques: uniques ?? [],
          foreignKeys: foreignKeys ?? [],
          triggers: triggers ?? [],
          checks: checks ?? [],
          escapedChecks: !mariadb,
        }),
      }
    }
    const listed = yield* driver.query(SQLITE_TABLES)
    const names = listed.rows
      .map((row) => catalogueText(row, 'table'))
      .filter((name) => !INTERNAL_TABLES.has(name))
    const triggers = yield* driver.query(SQLITE_EXTRAS.triggers)
    const definitions = yield* driver.query(SQLITE_EXTRAS.definitions)
    const tables = yield* Effect.forEach(names, (table) =>
      introspectSqliteTable(driver, {
        table,
        triggers: triggers.rows
          .filter((row) => catalogueText(row, 'table') === table)
          .map((row) => catalogueText(row, 'name')),
        definition: catalogueText(
          definitions.rows.find((row) => catalogueText(row, 'table') === table) ?? {},
          'sql',
        ),
      }),
    )
    return { defaultSchema: null, mariadb: false, tables }
  })
}
