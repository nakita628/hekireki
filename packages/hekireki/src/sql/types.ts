/**
 * How a column's declared type reads in TypeScript, per dialect — the mapping inferql applies
 * when it writes `Schema`, so the row type Studio shows is the one `sql('...')` would carry.
 */

export type Dialect = 'postgresql' | 'mysql' | 'sqlite'

/** SQLite's type affinity rules (https://www.sqlite.org/datatype3.html#affname), plus the conventional date/time and JSON spellings that store text. */
function sqliteTsType(dataType: string) {
  const upper = dataType.toUpperCase()
  if (upper === '') return 'unknown'
  if (upper.includes('INT')) return 'number'
  if (upper.includes('CHAR') || upper.includes('CLOB') || upper.includes('TEXT')) return 'string'
  if (upper.includes('BLOB')) return 'Uint8Array'
  if (upper.includes('REAL') || upper.includes('FLOA') || upper.includes('DOUB')) return 'number'
  if (upper.includes('BOOL')) return 'number'
  if (upper.includes('DATE') || upper.includes('TIME') || upper.includes('JSON')) return 'string'
  if (upper.includes('DEC') || upper.includes('NUM')) return 'number'
  return 'number'
}

const POSTGRES_TYPES: Readonly<Record<string, string>> = {
  int2: 'number',
  smallint: 'number',
  int4: 'number',
  int: 'number',
  integer: 'number',
  serial: 'number',
  serial4: 'number',
  smallserial: 'number',
  float4: 'number',
  real: 'number',
  float8: 'number',
  'double precision': 'number',
  oid: 'number',
  int8: 'string',
  bigint: 'string',
  bigserial: 'string',
  serial8: 'string',
  numeric: 'string',
  decimal: 'string',
  money: 'string',
  text: 'string',
  varchar: 'string',
  'character varying': 'string',
  bpchar: 'string',
  char: 'string',
  character: 'string',
  name: 'string',
  citext: 'string',
  uuid: 'string',
  time: 'string',
  timetz: 'string',
  'time without time zone': 'string',
  'time with time zone': 'string',
  interval: 'string',
  inet: 'string',
  cidr: 'string',
  macaddr: 'string',
  xml: 'string',
  tsvector: 'string',
  tsquery: 'string',
  bit: 'string',
  varbit: 'string',
  bool: 'boolean',
  boolean: 'boolean',
  date: 'Date',
  timestamp: 'Date',
  timestamptz: 'Date',
  'timestamp without time zone': 'Date',
  'timestamp with time zone': 'Date',
  bytea: 'Uint8Array',
  json: 'unknown',
  jsonb: 'unknown',
}

function postgresTsType(dataType: string): string {
  const lower = dataType.toLowerCase().trim()
  if (lower.endsWith('[]')) return `${postgresTsType(lower.slice(0, -2))}[]`
  if (lower.startsWith('_')) return `${postgresTsType(lower.slice(1))}[]`
  const base = lower.replace(/\(.*\)$/u, '').trim()
  return POSTGRES_TYPES[base] ?? 'unknown'
}

const MYSQL_TYPES: Readonly<Record<string, string>> = {
  tinyint: 'number',
  smallint: 'number',
  mediumint: 'number',
  int: 'number',
  integer: 'number',
  bigint: 'number',
  year: 'number',
  float: 'number',
  double: 'number',
  real: 'number',
  decimal: 'string',
  numeric: 'string',
  varchar: 'string',
  char: 'string',
  text: 'string',
  tinytext: 'string',
  mediumtext: 'string',
  longtext: 'string',
  enum: 'string',
  set: 'string',
  time: 'string',
  date: 'Date',
  datetime: 'Date',
  timestamp: 'Date',
  bit: 'Uint8Array',
  binary: 'Uint8Array',
  varbinary: 'Uint8Array',
  blob: 'Uint8Array',
  tinyblob: 'Uint8Array',
  mediumblob: 'Uint8Array',
  longblob: 'Uint8Array',
  geometry: 'Uint8Array',
  json: 'unknown',
  boolean: 'number',
  bool: 'number',
}

function mysqlTsType(dataType: string) {
  const base = dataType
    .toLowerCase()
    .replace(/\(.*\)$/u, '')
    .replace(/\s+unsigned$/u, '')
    .trim()
  return MYSQL_TYPES[base] ?? 'unknown'
}

/** The TypeScript type a driver hands back for a column of the declared type. */
export function toTsType(dialect: Dialect, dataType: string) {
  switch (dialect) {
    case 'sqlite':
      return sqliteTsType(dataType)
    case 'postgresql':
      return postgresTsType(dataType)
    case 'mysql':
      return mysqlTsType(dataType)
    default:
      return 'unknown'
  }
}

/** The declared type a literal of the expression kind would have in the dialect, for the type column of the picture. */
export function literalDataType(dialect: Dialect, kind: 'string' | 'number' | 'boolean') {
  if (kind === 'string') {
    return dialect === 'sqlite' ? 'TEXT' : dialect === 'mysql' ? 'varchar' : 'text'
  }
  if (kind === 'number') {
    return dialect === 'sqlite' ? 'INTEGER' : dialect === 'mysql' ? 'int' : 'int4'
  }
  return dialect === 'postgresql' ? 'bool' : dialect === 'mysql' ? 'tinyint' : 'INTEGER'
}
