import type { Dialect } from '../../database/url.js'

/**
 * The `ColumnType` codes the Prisma schema engine reads a result set by; it converts every value
 * it is handed according to the code the column was given, so a wrong code is a wrong value.
 * Taken from `ColumnTypeEnum` of `@prisma/driver-adapter-utils`.
 */
export const COLUMN_TYPE = {
  int32: 0,
  int64: 1,
  float: 2,
  double: 3,
  numeric: 4,
  boolean: 5,
  character: 6,
  text: 7,
  date: 8,
  time: 9,
  datetime: 10,
  json: 11,
  enum: 12,
  bytes: 13,
  set: 14,
  uuid: 15,
  int32Array: 64,
  int64Array: 65,
  floatArray: 66,
  doubleArray: 67,
  numericArray: 68,
  booleanArray: 69,
  characterArray: 70,
  textArray: 71,
  dateArray: 72,
  timeArray: 73,
  datetimeArray: 74,
  jsonArray: 75,
  enumArray: 76,
  bytesArray: 77,
  uuidArray: 78,
} as const

/** The type OID of `pg_type`, as `pg` reports it on every column it returns. */
const POSTGRES_OIDS: Readonly<Record<number, number>> = {
  16: COLUMN_TYPE.boolean,
  17: COLUMN_TYPE.bytes,
  18: COLUMN_TYPE.character,
  19: COLUMN_TYPE.text,
  20: COLUMN_TYPE.int64,
  21: COLUMN_TYPE.int32,
  23: COLUMN_TYPE.int32,
  25: COLUMN_TYPE.text,
  26: COLUMN_TYPE.int64,
  114: COLUMN_TYPE.json,
  700: COLUMN_TYPE.float,
  701: COLUMN_TYPE.double,
  1042: COLUMN_TYPE.character,
  1043: COLUMN_TYPE.text,
  1082: COLUMN_TYPE.date,
  1083: COLUMN_TYPE.time,
  1114: COLUMN_TYPE.datetime,
  1184: COLUMN_TYPE.datetime,
  1266: COLUMN_TYPE.time,
  1700: COLUMN_TYPE.numeric,
  2950: COLUMN_TYPE.uuid,
  3802: COLUMN_TYPE.json,
  1000: COLUMN_TYPE.booleanArray,
  1001: COLUMN_TYPE.bytesArray,
  1002: COLUMN_TYPE.characterArray,
  1005: COLUMN_TYPE.int32Array,
  1007: COLUMN_TYPE.int32Array,
  1009: COLUMN_TYPE.textArray,
  1014: COLUMN_TYPE.characterArray,
  1015: COLUMN_TYPE.textArray,
  1016: COLUMN_TYPE.int64Array,
  1021: COLUMN_TYPE.floatArray,
  1022: COLUMN_TYPE.doubleArray,
  1028: COLUMN_TYPE.int64Array,
  1115: COLUMN_TYPE.datetimeArray,
  1182: COLUMN_TYPE.dateArray,
  1183: COLUMN_TYPE.timeArray,
  1185: COLUMN_TYPE.datetimeArray,
  1231: COLUMN_TYPE.numericArray,
  199: COLUMN_TYPE.jsonArray,
  3807: COLUMN_TYPE.jsonArray,
  2951: COLUMN_TYPE.uuidArray,
}

/** The type code of the MySQL protocol, as `mysql2` reports it on every column. */
const MYSQL_CODES: Readonly<Record<number, number>> = {
  0: COLUMN_TYPE.numeric,
  1: COLUMN_TYPE.int32,
  2: COLUMN_TYPE.int32,
  3: COLUMN_TYPE.int32,
  4: COLUMN_TYPE.float,
  5: COLUMN_TYPE.double,
  7: COLUMN_TYPE.datetime,
  8: COLUMN_TYPE.int64,
  9: COLUMN_TYPE.int32,
  10: COLUMN_TYPE.date,
  11: COLUMN_TYPE.time,
  12: COLUMN_TYPE.datetime,
  13: COLUMN_TYPE.int32,
  15: COLUMN_TYPE.text,
  16: COLUMN_TYPE.bytes,
  245: COLUMN_TYPE.json,
  246: COLUMN_TYPE.numeric,
  247: COLUMN_TYPE.enum,
  248: COLUMN_TYPE.set,
  249: COLUMN_TYPE.bytes,
  250: COLUMN_TYPE.bytes,
  251: COLUMN_TYPE.bytes,
  252: COLUMN_TYPE.bytes,
  253: COLUMN_TYPE.text,
  254: COLUMN_TYPE.text,
  255: COLUMN_TYPE.bytes,
}

/** The declared type of a SQLite column; a `PRAGMA` or an expression has none. */
function sqliteColumnType(declared: string) {
  const upper = declared
    .toUpperCase()
    .replace(/\(.*\)$/u, '')
    .trim()
  if (upper === 'BOOLEAN') return COLUMN_TYPE.boolean
  if (upper === 'DATETIME' || upper === 'TIMESTAMP') return COLUMN_TYPE.datetime
  if (upper === 'DATE') return COLUMN_TYPE.date
  if (upper === 'TIME') return COLUMN_TYPE.time
  if (upper === 'JSON' || upper === 'JSONB') return COLUMN_TYPE.json
  if (upper === 'BLOB') return COLUMN_TYPE.bytes
  if (upper === 'DECIMAL' || upper === 'NUMERIC') return COLUMN_TYPE.numeric
  if (upper.includes('INT')) return COLUMN_TYPE.int64
  if (upper.includes('CHAR') || upper.includes('CLOB') || upper.includes('TEXT')) {
    return COLUMN_TYPE.text
  }
  if (upper.includes('REAL') || upper.includes('FLOA') || upper.includes('DOUB')) {
    return COLUMN_TYPE.double
  }
  return null
}

/** What a value says about its column, for a column the database gives no type for. */
export function columnTypeOfValue(value: unknown) {
  if (typeof value === 'bigint') return COLUMN_TYPE.int64
  if (typeof value === 'number') {
    return Number.isInteger(value) ? COLUMN_TYPE.int32 : COLUMN_TYPE.double
  }
  if (typeof value === 'boolean') return COLUMN_TYPE.boolean
  if (value instanceof Uint8Array) return COLUMN_TYPE.bytes
  return COLUMN_TYPE.text
}

/**
 * The `ColumnType` of a column as the database types it: the OID on PostgreSQL, the protocol type
 * code on MySQL, the declared type on SQLite. Null for a type not listed, and for the columns of a
 * `PRAGMA`, so the caller reads those from the values instead.
 */
export function columnTypeOfNative(dialect: Dialect, nativeType: string | number | null) {
  if (nativeType === null) return null
  if (dialect === 'postgresql') {
    return typeof nativeType === 'number' ? (POSTGRES_OIDS[nativeType] ?? null) : null
  }
  if (dialect === 'mysql') {
    return typeof nativeType === 'number' ? (MYSQL_CODES[nativeType] ?? null) : null
  }
  return typeof nativeType === 'string' ? sqliteColumnType(nativeType) : null
}
