import { describe, expect, it } from 'vite-plus/test'

import { operatorClassName, parseDateTimeDefault, prismaConstraintName } from './prisma-postgres.js'

// Every expected name is the one Prisma Migrate writes for the same table and columns.
describe('prismaConstraintName', () => {
  const table58 = `T${'a'.repeat(57)}`
  const table59 = `T${'a'.repeat(58)}`

  it('keeps a name that fits in 63 bytes', () => {
    expect(prismaConstraintName(table58, '_pkey')).toBe(`${table58}_pkey`)
  })

  it('cuts the base so that base and suffix fit', () => {
    expect(prismaConstraintName(table59, '_pkey')).toBe(`${table58}_pkey`)
    expect(prismaConstraintName(`${table58}_c`, '_key')).toBe(`${table58}__key`)
    expect(prismaConstraintName(`${table59}_c`, '_key')).toBe(`${table59}_key`)
  })

  it('counts UTF-8 bytes and cuts at a character boundary', () => {
    expect(prismaConstraintName('日本語のテーブル名前日本語のテーブル', '_pkey')).toBe(
      '日本語のテーブル名前日本語のテーブル_pkey',
    )
    expect(
      prismaConstraintName(
        '日本語のテーブル名前日本語のテーブル_名前名前名前名前名前名前名前名前',
        '_key',
      ),
    ).toBe('日本語のテーブル名前日本語のテーブル_名_key')
  })
})

describe('parseDateTimeDefault', () => {
  it('reads a UTC timestamp', () => {
    expect(parseDateTimeDefault('2020-02-29T23:59:59.999Z')).toStrictEqual({
      year: 2020,
      month: 2,
      day: 29,
      hour: 23,
      minute: 59,
      second: 59,
      microsecond: 999_000,
      offsetMinutes: 0,
    })
  })

  it('reads an offset, east and west', () => {
    expect(parseDateTimeDefault('2020-01-01T12:34:56+09:00')?.offsetMinutes).toBe(540)
    expect(parseDateTimeDefault('2020-01-01T12:34:56-05:30')?.offsetMinutes).toBe(-330)
  })

  it('reads the fraction to the microsecond, rounding half to even as PostgreSQL does', () => {
    expect(parseDateTimeDefault('2020-01-01T00:00:00.5Z')?.microsecond).toBe(500_000)
    expect(parseDateTimeDefault('2020-01-01T00:00:00.1234565Z')?.microsecond).toBe(123_456)
    expect(parseDateTimeDefault('2020-01-01T00:00:00.1234575Z')?.microsecond).toBe(123_458)
    expect(parseDateTimeDefault('2020-01-01T00:00:00.12345651Z')?.microsecond).toBe(123_457)
    expect(parseDateTimeDefault('2020-01-01T00:00:00.9999995Z')?.microsecond).toBe(1_000_000)
  })

  it.each([
    '2021-02-29T00:00:00Z',
    '2020-01-01T24:00:00Z',
    '0000-01-01T00:00:00Z',
    '2020-01-01',
    '2020-01-01T00:00:00',
    'now',
  ])('rejects %j', (value) => {
    expect(parseDateTimeDefault(value)).toBe(null)
  })
})

describe('operatorClassName', () => {
  it.each([
    ['InetOps', 'inet_ops'],
    ['JsonbOps', 'jsonb_ops'],
    ['JsonbPathOps', 'jsonb_path_ops'],
    ['ArrayOps', 'array_ops'],
    ['TextOps', 'text_ops'],
    ['BitMinMaxOps', 'bit_minmax_ops'],
    ['VarBitMinMaxOps', 'varbit_minmax_ops'],
    ['BpcharBloomOps', 'bpchar_bloom_ops'],
    ['BpcharMinMaxOps', 'bpchar_minmax_ops'],
    ['ByteaBloomOps', 'bytea_bloom_ops'],
    ['ByteaMinMaxOps', 'bytea_minmax_ops'],
    ['DateBloomOps', 'date_bloom_ops'],
    ['DateMinMaxOps', 'date_minmax_ops'],
    ['DateMinMaxMultiOps', 'date_minmax_multi_ops'],
    ['Float4BloomOps', 'float4_bloom_ops'],
    ['Float4MinMaxOps', 'float4_minmax_ops'],
    ['Float4MinMaxMultiOps', 'float4_minmax_multi_ops'],
    ['Float8BloomOps', 'float8_bloom_ops'],
    ['Float8MinMaxOps', 'float8_minmax_ops'],
    ['Float8MinMaxMultiOps', 'float8_minmax_multi_ops'],
    ['InetInclusionOps', 'inet_inclusion_ops'],
    ['InetBloomOps', 'inet_bloom_ops'],
    ['InetMinMaxOps', 'inet_minmax_ops'],
    ['InetMinMaxMultiOps', 'inet_minmax_multi_ops'],
    ['Int2BloomOps', 'int2_bloom_ops'],
    ['Int2MinMaxOps', 'int2_minmax_ops'],
    ['Int2MinMaxMultiOps', 'int2_minmax_multi_ops'],
    ['Int4BloomOps', 'int4_bloom_ops'],
    ['Int4MinMaxOps', 'int4_minmax_ops'],
    ['Int4MinMaxMultiOps', 'int4_minmax_multi_ops'],
    ['Int8BloomOps', 'int8_bloom_ops'],
    ['Int8MinMaxOps', 'int8_minmax_ops'],
    ['Int8MinMaxMultiOps', 'int8_minmax_multi_ops'],
    ['NumericBloomOps', 'numeric_bloom_ops'],
    ['NumericMinMaxOps', 'numeric_minmax_ops'],
    ['NumericMinMaxMultiOps', 'numeric_minmax_multi_ops'],
    ['OidBloomOps', 'oid_bloom_ops'],
    ['OidMinMaxOps', 'oid_minmax_ops'],
    ['OidMinMaxMultiOps', 'oid_minmax_multi_ops'],
    ['TextBloomOps', 'text_bloom_ops'],
    ['TextMinMaxOps', 'text_minmax_ops'],
    ['TimestampBloomOps', 'timestamp_bloom_ops'],
    ['TimestampMinMaxOps', 'timestamp_minmax_ops'],
    ['TimestampMinMaxMultiOps', 'timestamp_minmax_multi_ops'],
    ['TimestampTzBloomOps', 'timestamptz_bloom_ops'],
    ['TimestampTzMinMaxOps', 'timestamptz_minmax_ops'],
    ['TimestampTzMinMaxMultiOps', 'timestamptz_minmax_multi_ops'],
    ['TimeBloomOps', 'time_bloom_ops'],
    ['TimeMinMaxOps', 'time_minmax_ops'],
    ['TimeMinMaxMultiOps', 'time_minmax_multi_ops'],
    ['TimeTzBloomOps', 'timetz_bloom_ops'],
    ['TimeTzMinMaxOps', 'timetz_minmax_ops'],
    ['TimeTzMinMaxMultiOps', 'timetz_minmax_multi_ops'],
    ['UuidBloomOps', 'uuid_bloom_ops'],
    ['UuidMinMaxOps', 'uuid_minmax_ops'],
  ])('writes %s as %s', (name, sql) => {
    expect(operatorClassName(name, undefined)).toBe(sql)
  })

  it('reads BitMinMaxOps on a uuid column as the UuidMinMaxMultiOps DMMF misnames', () => {
    expect(operatorClassName('BitMinMaxOps', 'Uuid')).toBe('uuid_minmax_multi_ops')
    expect(operatorClassName('BitMinMaxOps', 'Bit')).toBe('bit_minmax_ops')
  })

  it('uses a raw("...") operator class as it is', () => {
    expect(operatorClassName('text_pattern_ops', undefined)).toBe('text_pattern_ops')
  })
})
