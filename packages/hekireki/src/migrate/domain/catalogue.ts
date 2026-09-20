import { quoteIdentifier } from '../../sql/index.js'

/** Prisma Migrate's own bookkeeping, and SQLite's; never part of a schema. */
export const INTERNAL_TABLES = new Set(['_prisma_migrations', 'sqlite_sequence'])

/** A catalogue value as text: drivers hand some of them back as numbers, booleans or bytes. */
export function catalogueText(row: Readonly<Record<string, unknown>>, key: string) {
  const value = row[key]
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value)
  }
  return value instanceof Uint8Array ? Buffer.from(value).toString('utf8') : ''
}

/** A number of the catalogue row, null when the catalogue leaves it empty. */
function numberOf(row: Readonly<Record<string, unknown>>, key: string) {
  const value = Number(catalogueText(row, key))
  return catalogueText(row, key) === '' || !Number.isFinite(value) ? null : value
}

/** The size columns information_schema gives for a column: characters, digits, fractional seconds. */
function sizesOf(row: Readonly<Record<string, unknown>>) {
  return {
    maxLength: numberOf(row, 'maxLength'),
    precision: numberOf(row, 'precision'),
    scale: numberOf(row, 'scale'),
    datetimePrecision: numberOf(row, 'datetimePrecision'),
  }
}

/** The items in groups of equal key, in the order each key first appears. */
function groupsOf<T>(items: readonly T[], keyOf: (item: T) => string) {
  return [...Map.groupBy(items, keyOf).values()]
}

function tableKey(row: Readonly<Record<string, unknown>>) {
  return JSON.stringify([catalogueText(row, 'schema'), catalogueText(row, 'table')])
}

/** The members of a MySQL `enum('A','B')` column type, quotes undone. */
export function mysqlEnumValues(columnType: string) {
  if (!/^enum\(/iu.test(columnType)) return null
  return [...columnType.matchAll(/'((?:[^']|'')*)'/gu)].map((match) =>
    (match[1] ?? '').replaceAll("''", "'"),
  )
}

/**
 * `IN (current_schema(), $1, ...)`: the current schema and the ones the models name with `@@schema`.
 *
 * @example
 * ```sql
 * -- schemaFilter('c.table_schema', ['audit'])
 * c.table_schema IN (current_schema(), $1)
 * ```
 */
function schemaFilter(column: string, schemas: readonly string[]) {
  const named = schemas.map((_, index) => `$${index + 1}`)
  return `${column} IN (${['current_schema()', ...named].join(', ')})`
}

/**
 * The PostgreSQL catalogue queries: every column of every base table, every enum label, and the
 * columns of every unique index (primary keys included; partial and expression indexes left
 * out, as they do not make the whole column unique) and of every foreign key, one row per column.
 */
export function postgresStatements(schemas: readonly string[]) {
  const params = [...schemas]
  return {
    current: { sql: 'SELECT current_schema() AS "schema"', params: [] },
    columns: {
      sql: `SELECT c.table_schema AS "schema", c.table_name AS "table", c.column_name AS "column", c.is_nullable AS "nullable", c.data_type AS "type", c.udt_schema AS "udtSchema", c.udt_name AS "udt", c.character_maximum_length AS "maxLength", c.numeric_precision AS "precision", c.numeric_scale AS "scale", c.datetime_precision AS "datetimePrecision", c.is_generated AS "generated", c.identity_generation AS "identity" FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name WHERE t.table_type = 'BASE TABLE' AND ${schemaFilter('c.table_schema', schemas)} ORDER BY c.table_schema, c.table_name, c.ordinal_position`,
      params,
    },
    enums: {
      sql: 'SELECT n.nspname AS "schema", t.typname AS "name", e.enumlabel AS "label" FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace ORDER BY n.nspname, t.typname, e.enumsortorder',
      params: [],
    },
    uniques: {
      sql: `SELECT n.nspname AS "schema", t.relname AS "table", c.relname AS "index", k.ord AS "position", a.attname AS "column" FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_class t ON t.oid = i.indrelid JOIN pg_namespace n ON n.oid = t.relnamespace CROSS JOIN LATERAL unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord) JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum WHERE i.indisunique AND i.indpred IS NULL AND i.indexprs IS NULL AND k.ord <= i.indnkeyatts AND ${schemaFilter('n.nspname', schemas)} ORDER BY 1, 2, 3, 4`,
      params,
    },
    foreignKeys: {
      sql: `SELECT n.nspname AS "schema", t.relname AS "table", c.conname AS "name", k.ord AS "position", a.attname AS "column", rn.nspname AS "refSchema", rt.relname AS "refTable", ra.attname AS "refColumn", c.convalidated AS "validated", c.confdeltype AS "onDelete", c.confupdtype AS "onUpdate" FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace JOIN pg_class rt ON rt.oid = c.confrelid JOIN pg_namespace rn ON rn.oid = rt.relnamespace CROSS JOIN LATERAL unnest(c.conkey, c.confkey) WITH ORDINALITY AS k(attnum, refattnum, ord) JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = k.refattnum WHERE c.contype = 'f' AND ${schemaFilter('n.nspname', schemas)} ORDER BY 1, 2, 3, 4`,
      params,
    },
    // What Prisma's schema does not describe and a fix or a migration still runs into: the
    // triggers a write fires, and the CHECK constraints it has to pass.
    triggers: {
      sql: `SELECT n.nspname AS "schema", c.relname AS "table", t.tgname AS "name" FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE NOT t.tgisinternal AND ${schemaFilter('n.nspname', schemas)} ORDER BY 1, 2, 3`,
      params,
    },
    checks: {
      sql: `SELECT n.nspname AS "schema", t.relname AS "table", c.conname AS "name", pg_get_expr(c.conbin, c.conrelid) AS "clause" FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE c.contype = 'c' AND ${schemaFilter('n.nspname', schemas)} ORDER BY 1, 2, 3`,
      params,
    },
  }
}

/** The MySQL catalogue queries, over the connected database: the server, columns, unique indexes, foreign keys. */
export const MYSQL_STATEMENTS = {
  version: { sql: 'SELECT VERSION() AS `version`', params: [] },
  columns: {
    sql: "SELECT c.table_name AS `table`, c.column_name AS `column`, c.is_nullable AS `nullable`, c.data_type AS `type`, c.column_type AS `full`, c.character_maximum_length AS `maxLength`, c.numeric_precision AS `precision`, c.numeric_scale AS `scale`, c.datetime_precision AS `datetimePrecision`, c.generation_expression AS `generation` FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name WHERE c.table_schema = DATABASE() AND t.table_type = 'BASE TABLE' ORDER BY c.table_name, c.ordinal_position",
    params: [],
  },
  uniques: {
    sql: 'SELECT table_name AS `table`, index_name AS `index`, seq_in_index AS `position`, column_name AS `column` FROM information_schema.statistics WHERE table_schema = DATABASE() AND non_unique = 0 AND column_name IS NOT NULL AND sub_part IS NULL ORDER BY table_name, index_name, seq_in_index',
    params: [],
  },
  foreignKeys: {
    sql: 'SELECT k.table_name AS `table`, k.constraint_name AS `name`, k.ordinal_position AS `position`, k.column_name AS `column`, k.referenced_table_name AS `refTable`, k.referenced_column_name AS `refColumn`, r.delete_rule AS `onDelete`, r.update_rule AS `onUpdate` FROM information_schema.key_column_usage k JOIN information_schema.referential_constraints r ON r.constraint_schema = k.table_schema AND r.constraint_name = k.constraint_name AND r.table_name = k.table_name WHERE k.table_schema = DATABASE() AND k.referenced_table_name IS NOT NULL ORDER BY k.table_name, k.constraint_name, k.ordinal_position',
    params: [],
  },
  triggers: {
    sql: 'SELECT event_object_table AS `table`, trigger_name AS `name` FROM information_schema.triggers WHERE trigger_schema = DATABASE() ORDER BY 1, 2',
    params: [],
  },
  // MySQL names a CHECK constraint once in a database and keeps its table in table_constraints.
  checks: {
    sql: "SELECT tc.table_name AS `table`, cc.constraint_name AS `name`, cc.check_clause AS `clause` FROM information_schema.check_constraints cc JOIN information_schema.table_constraints tc ON tc.constraint_schema = cc.constraint_schema AND tc.constraint_name = cc.constraint_name AND tc.constraint_type = 'CHECK' WHERE cc.constraint_schema = DATABASE() ORDER BY 1, 2",
    params: [],
  },
  // MariaDB names one per table (`CONSTRAINT_1` in every table), and keeps the table beside it.
  mariadbChecks: {
    sql: 'SELECT table_name AS `table`, constraint_name AS `name`, check_clause AS `clause` FROM information_schema.check_constraints WHERE constraint_schema = DATABASE() ORDER BY 1, 2',
    params: [],
  },
}

/** Every table of the SQLite file, SQLite's own left out. */
export const SQLITE_TABLES = {
  sql: `SELECT name AS "table" FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  params: [],
}

/** The triggers of the SQLite file, and the statement each table was made with, which is where its CHECKs are. */
export const SQLITE_EXTRAS = {
  triggers: {
    sql: `SELECT tbl_name AS "table", name AS "name" FROM sqlite_master WHERE type = 'trigger' ORDER BY 1, 2`,
    params: [],
  },
  definitions: {
    sql: `SELECT name AS "table", sql AS "sql" FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    params: [],
  },
}

/**
 * The CHECK constraints of a SQLite table, read from the statement it was made with: SQLite keeps
 * them nowhere else. Each is the text between the parentheses after `CHECK`, quotes and nested
 * parentheses followed.
 *
 * @example
 * ```ts
 * sqliteCheckClauses(`CREATE TABLE "User" ("age" INTEGER CHECK ("age" >= 0), "note" TEXT DEFAULT 'CHECK (x)')`)
 * // ['"age" >= 0']
 * ```
 */
export function sqliteCheckClauses(definition: string) {
  // By UTF-16 index, which is what `slice` counts in.
  const scanned = Array.from(
    { length: definition.length },
    (_, at) => definition[at] ?? '',
  ).reduce<{
    readonly quote: string | null
    readonly depth: number
    readonly start: number | null
    readonly clauses: readonly string[]
  }>(
    (state, char, index) => {
      if (state.quote !== null) return char === state.quote ? { ...state, quote: null } : state
      if (char === "'" || char === '"' || char === '`') return { ...state, quote: char }
      if (char === '(') {
        return state.start === null
          ? /\bCHECK\s*$/iu.test(definition.slice(0, index))
            ? { ...state, start: index + 1, depth: 1 }
            : state
          : { ...state, depth: state.depth + 1 }
      }
      if (char !== ')' || state.start === null) return state
      return state.depth === 1
        ? {
            ...state,
            depth: 0,
            start: null,
            clauses: [...state.clauses, definition.slice(state.start, index).trim()],
          }
        : { ...state, depth: state.depth - 1 }
    },
    { quote: null, depth: 0, start: null, clauses: [] },
  )
  return scanned.clauses
}

/**
 * PRAGMA takes no parameter, so the names are quoted in.
 *
 * @example
 * ```sql
 * PRAGMA table_info("User")
 * PRAGMA index_list("User")
 * PRAGMA foreign_key_list("User")
 * ```
 */
export function sqliteStatements(table: string) {
  return {
    columns: { sql: `PRAGMA table_info(${quoteIdentifier('sqlite', table)})`, params: [] },
    indexes: { sql: `PRAGMA index_list(${quoteIdentifier('sqlite', table)})`, params: [] },
    foreignKeys: {
      sql: `PRAGMA foreign_key_list(${quoteIdentifier('sqlite', table)})`,
      params: [],
    },
  }
}

/** PostgreSQL's `confdeltype` letters, as the other databases spell the rule. */
const POSTGRES_DELETE_RULES: Readonly<Record<string, string>> = {
  a: 'no action',
  r: 'restrict',
  c: 'cascade',
  n: 'set null',
  d: 'set default',
}

/** An ON DELETE or ON UPDATE rule, lower case: `no action`, `restrict`, `cascade`, `set null`, `set default`. */
function deleteRule(value: string) {
  return POSTGRES_DELETE_RULES[value] ?? (value.toLowerCase() || 'no action')
}

function uniqueColumns(rows: readonly Readonly<Record<string, unknown>>[]) {
  return groupsOf(rows, (row) => JSON.stringify([tableKey(row), catalogueText(row, 'index')])).map(
    (index) => ({
      key: tableKey(index[0] ?? {}),
      columns: index.map((row) => catalogueText(row, 'column')),
    }),
  )
}

/** The triggers and CHECK constraints of each table, from the rows of the two queries that list them. */
function unmanagedOf(
  triggers: readonly Readonly<Record<string, unknown>>[],
  checks: readonly Readonly<Record<string, unknown>>[],
  key: string,
) {
  return {
    triggers: triggers
      .filter((row) => tableKey(row) === key)
      .map((row) => catalogueText(row, 'name')),
    checks: checks
      .filter((row) => tableKey(row) === key)
      .map((row) => ({ name: catalogueText(row, 'name'), clause: catalogueText(row, 'clause') })),
  }
}

/** The PostgreSQL tables from the rows of the catalogue queries. */
export function makePostgresTables(input: {
  readonly columns: readonly Readonly<Record<string, unknown>>[]
  readonly enums: readonly Readonly<Record<string, unknown>>[]
  readonly uniques: readonly Readonly<Record<string, unknown>>[]
  readonly foreignKeys: readonly Readonly<Record<string, unknown>>[]
  readonly triggers?: readonly Readonly<Record<string, unknown>>[]
  readonly checks?: readonly Readonly<Record<string, unknown>>[]
}) {
  const labels = groupsOf(input.enums, (row) =>
    JSON.stringify([catalogueText(row, 'schema'), catalogueText(row, 'name')]),
  )
  const labelsOf = (schema: string, name: string) =>
    labels
      .find(
        (group) =>
          group[0] !== undefined &&
          catalogueText(group[0], 'schema') === schema &&
          catalogueText(group[0], 'name') === name,
      )
      ?.map((row) => catalogueText(row, 'label')) ?? null
  const uniques = uniqueColumns(input.uniques)
  const foreignKeys = groupsOf(input.foreignKeys, (row) =>
    JSON.stringify([tableKey(row), catalogueText(row, 'name')]),
  )
  return groupsOf(input.columns, tableKey)
    .filter((rows) => !INTERNAL_TABLES.has(catalogueText(rows[0] ?? {}, 'table')))
    .map((rows) => {
      const key = tableKey(rows[0] ?? {})
      const unmanaged = unmanagedOf(input.triggers ?? [], input.checks ?? [], key)
      return {
        schema: catalogueText(rows[0] ?? {}, 'schema'),
        table: catalogueText(rows[0] ?? {}, 'table'),
        columns: rows.map((row) => {
          const dataType = catalogueText(row, 'type')
          return {
            name: catalogueText(row, 'column'),
            nullable: catalogueText(row, 'nullable').toUpperCase() === 'YES',
            dataType:
              dataType === 'ARRAY' ? `${catalogueText(row, 'udt').replace(/^_/u, '')}[]` : dataType,
            columnType: null,
            ...sizesOf(row),
            enumValues:
              dataType === 'USER-DEFINED'
                ? labelsOf(catalogueText(row, 'udtSchema'), catalogueText(row, 'udt'))
                : null,
            // A generated column, or an identity the database alone may write: no UPDATE sets it.
            generated:
              catalogueText(row, 'generated') === 'ALWAYS' ||
              catalogueText(row, 'identity') === 'ALWAYS',
          }
        }),
        triggers: unmanaged.triggers,
        checks: unmanaged.checks,
        uniques: uniques.filter((unique) => unique.key === key).map((unique) => unique.columns),
        foreignKeys: foreignKeys
          .filter((group) => tableKey(group[0] ?? {}) === key)
          .map((group) => ({
            columns: group.map((row) => catalogueText(row, 'column')),
            refSchema: catalogueText(group[0] ?? {}, 'refSchema'),
            refTable: catalogueText(group[0] ?? {}, 'refTable'),
            refColumns: group.map((row) => catalogueText(row, 'refColumn')),
            enforced: group[0]?.validated === true,
            onDelete: deleteRule(catalogueText(group[0] ?? {}, 'onDelete')),
            onUpdate: deleteRule(catalogueText(group[0] ?? {}, 'onUpdate')),
          })),
      }
    })
}

/** The MySQL tables from the rows of the three catalogue queries. */
export function makeMysqlTables(input: {
  readonly columns: readonly Readonly<Record<string, unknown>>[]
  readonly uniques: readonly Readonly<Record<string, unknown>>[]
  readonly foreignKeys: readonly Readonly<Record<string, unknown>>[]
  readonly triggers?: readonly Readonly<Record<string, unknown>>[]
  readonly checks?: readonly Readonly<Record<string, unknown>>[]
  /**
   * MySQL writes the quotes of a string in a CHECK clause behind a backslash, and what is inside
   * them escaped once more (`_utf8mb4\'it\\\'s\'` for `'it''s'`), which no statement can use as it
   * is: one level of backslashes is taken off. MariaDB writes the clause as SQL, and it is left
   * alone.
   */
  readonly escapedChecks?: boolean
}) {
  const checks =
    input.escapedChecks === true
      ? (input.checks ?? []).map((row) => ({
          table: row.table,
          name: row.name,
          clause: catalogueText(row, 'clause').replaceAll(/\\(?<escaped>.)/gsu, '$<escaped>'),
        }))
      : (input.checks ?? [])
  const uniques = uniqueColumns(input.uniques)
  const foreignKeys = groupsOf(input.foreignKeys, (row) =>
    JSON.stringify([tableKey(row), catalogueText(row, 'name')]),
  )
  return groupsOf(input.columns, tableKey)
    .filter((rows) => !INTERNAL_TABLES.has(catalogueText(rows[0] ?? {}, 'table')))
    .map((rows) => {
      const key = tableKey(rows[0] ?? {})
      const unmanaged = unmanagedOf(input.triggers ?? [], checks, key)
      return {
        schema: null,
        table: catalogueText(rows[0] ?? {}, 'table'),
        columns: rows.map((row) => ({
          name: catalogueText(row, 'column'),
          nullable: catalogueText(row, 'nullable').toUpperCase() === 'YES',
          dataType: catalogueText(row, 'type'),
          columnType: catalogueText(row, 'full'),
          ...sizesOf(row),
          enumValues: mysqlEnumValues(catalogueText(row, 'full')),
          generated: catalogueText(row, 'generation') !== '',
        })),
        triggers: unmanaged.triggers,
        checks: unmanaged.checks,
        uniques: uniques.filter((unique) => unique.key === key).map((unique) => unique.columns),
        foreignKeys: foreignKeys
          .filter((group) => tableKey(group[0] ?? {}) === key)
          .map((group) => ({
            columns: group.map((row) => catalogueText(row, 'column')),
            refSchema: null,
            refTable: catalogueText(group[0] ?? {}, 'refTable'),
            refColumns: group.map((row) => catalogueText(row, 'refColumn')),
            enforced: true,
            onDelete: deleteRule(catalogueText(group[0] ?? {}, 'onDelete')),
            onUpdate: deleteRule(catalogueText(group[0] ?? {}, 'onUpdate')),
          })),
      }
    })
}

/**
 * One SQLite table from `PRAGMA table_info`, the columns of its unique indexes, and its foreign
 * keys from `PRAGMA foreign_key_list`. The foreign keys are never taken as enforced: SQLite
 * checks them only on connections that turn them on, so one says nothing about the rows already
 * there; they tell which deletes the database may refuse or cascade.
 */
export function makeSqliteTable(input: {
  readonly table: string
  readonly columns: readonly Readonly<Record<string, unknown>>[]
  readonly uniques: readonly (readonly string[])[]
  readonly foreignKeys?: readonly Readonly<Record<string, unknown>>[]
  readonly triggers?: readonly string[]
  /** The statement the table was made with, which is where SQLite keeps its CHECK constraints. */
  readonly definition?: string
}) {
  const primaryKey = input.columns
    .filter((row) => Number(row.pk) > 0)
    .toSorted((a, b) => Number(a.pk) - Number(b.pk))
    .map((row) => catalogueText(row, 'name'))
  return {
    schema: null,
    table: input.table,
    columns: input.columns.map((row) => ({
      name: catalogueText(row, 'name'),
      // A primary key column is NOT NULL to Prisma whatever the declaration says.
      nullable: catalogueText(row, 'notnull') !== '1' && Number(row.pk) === 0,
      dataType: catalogueText(row, 'type'),
      columnType: null,
      maxLength: null,
      precision: null,
      scale: null,
      datetimePrecision: null,
      enumValues: null,
      // `PRAGMA table_info` leaves a generated column out altogether.
      generated: false,
    })),
    triggers: input.triggers ?? [],
    checks: sqliteCheckClauses(input.definition ?? '').map((clause, index) => ({
      name: `CHECK ${index + 1}`,
      clause,
    })),
    uniques: primaryKey.length === 0 ? input.uniques : [primaryKey, ...input.uniques],
    foreignKeys: groupsOf(input.foreignKeys ?? [], (row) => catalogueText(row, 'id')).map(
      (rows) => ({
        columns: rows.map((row) => catalogueText(row, 'from')),
        refSchema: null,
        refTable: catalogueText(rows[0] ?? {}, 'table'),
        refColumns: rows.map((row) => catalogueText(row, 'to')),
        enforced: false,
        onDelete: deleteRule(catalogueText(rows[0] ?? {}, 'on_delete')),
        onUpdate: deleteRule(catalogueText(rows[0] ?? {}, 'on_update')),
      }),
    ),
  }
}

/**
 * The columns of one SQLite index, in order; like every PRAGMA, the name is quoted in.
 *
 * @example
 * ```sql
 * PRAGMA index_info("User_email_key")
 * ```
 */
export function sqliteIndexStatement(index: string) {
  return { sql: `PRAGMA index_info(${quoteIdentifier('sqlite', index)})`, params: [] }
}
