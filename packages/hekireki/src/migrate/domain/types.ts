import type { Dialect } from '../../database/url.js'

// A family is what a column can hold, coarsely: enough to tell a type change that loses data
// from one that does not. `string`, `int`, `bigint`, `float`, `decimal`, `boolean`, `datetime`,
// `json`, `bytes` and `enum`.

const PRISMA_FAMILIES: Readonly<Record<string, string>> = {
  String: 'string',
  Int: 'int',
  BigInt: 'bigint',
  Float: 'float',
  Decimal: 'decimal',
  Boolean: 'boolean',
  DateTime: 'datetime',
  Json: 'json',
  Bytes: 'bytes',
}

/** The family of a Prisma scalar or enum field. */
export function prismaFamily(input: { readonly type: string; readonly kind: string }) {
  if (input.kind === 'enum') return 'enum'
  return input.kind === 'scalar' ? (PRISMA_FAMILIES[input.type] ?? null) : null
}

const POSTGRES_FAMILIES: Readonly<Record<string, string>> = {
  text: 'string',
  'character varying': 'string',
  character: 'string',
  citext: 'string',
  uuid: 'string',
  inet: 'string',
  xml: 'string',
  bit: 'string',
  'bit varying': 'string',
  smallint: 'int',
  integer: 'int',
  bigint: 'bigint',
  real: 'float',
  'double precision': 'float',
  numeric: 'decimal',
  money: 'decimal',
  boolean: 'boolean',
  date: 'datetime',
  'time without time zone': 'datetime',
  'time with time zone': 'datetime',
  'timestamp without time zone': 'datetime',
  'timestamp with time zone': 'datetime',
  json: 'json',
  jsonb: 'json',
  bytea: 'bytes',
  'USER-DEFINED': 'enum',
}

const MYSQL_FAMILIES: Readonly<Record<string, string>> = {
  char: 'string',
  varchar: 'string',
  tinytext: 'string',
  text: 'string',
  mediumtext: 'string',
  longtext: 'string',
  tinyint: 'int',
  smallint: 'int',
  mediumint: 'int',
  int: 'int',
  year: 'int',
  bigint: 'bigint',
  float: 'float',
  double: 'float',
  decimal: 'decimal',
  bit: 'boolean',
  date: 'datetime',
  datetime: 'datetime',
  timestamp: 'datetime',
  time: 'datetime',
  json: 'json',
  binary: 'bytes',
  varbinary: 'bytes',
  tinyblob: 'bytes',
  blob: 'bytes',
  mediumblob: 'bytes',
  longblob: 'bytes',
  enum: 'enum',
}

/** The declared types Prisma Migrate writes on SQLite; anything else is read by its affinity. */
const SQLITE_FAMILIES: Readonly<Record<string, string>> = {
  TEXT: 'string',
  INTEGER: 'int',
  BIGINT: 'bigint',
  REAL: 'float',
  DECIMAL: 'decimal',
  BOOLEAN: 'boolean',
  DATETIME: 'datetime',
  JSON: 'json',
  JSONB: 'json',
  BLOB: 'bytes',
}

function sqliteFamily(declared: string) {
  const upper = declared
    .toUpperCase()
    .replace(/\(.*\)$/u, '')
    .trim()
  const known = SQLITE_FAMILIES[upper]
  if (known !== undefined) return known
  if (upper.includes('INT')) return 'int'
  if (upper.includes('CHAR') || upper.includes('CLOB') || upper.includes('TEXT')) return 'string'
  if (upper.includes('REAL') || upper.includes('FLOA') || upper.includes('DOUB')) return 'float'
  return null
}

/**
 * The family of a column as the database reports it: `data_type` on PostgreSQL and MySQL (with
 * `column_type`, so `tinyint(1)` reads as the boolean Prisma writes it as), the declared type on
 * SQLite. Null for a type the check does not know, so nothing is said about it.
 */
export function databaseFamily(input: {
  readonly dialect: Dialect
  readonly dataType: string
  readonly columnType: string | null
}) {
  if (input.dialect === 'postgresql') return POSTGRES_FAMILIES[input.dataType] ?? null
  if (input.dialect === 'mysql') {
    const type = input.dataType.toLowerCase()
    if (type === 'tinyint' && (input.columnType ?? '').toLowerCase() === 'tinyint(1)') {
      return 'boolean'
    }
    return MYSQL_FAMILIES[type] ?? null
  }
  return sqliteFamily(input.dataType)
}
