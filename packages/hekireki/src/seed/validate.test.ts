import type { DMMF } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
import type { GetDMMFError } from '@prisma/get-dmmf'
import { Effect, Exit } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import { makeSeedPlan } from './plan.js'
import type { ModelTable } from './plan.js'
import { fieldSchema, validateRows } from './validate.js'

const SCHEMA = `
datasource db {
  provider = "postgresql"
}

enum Role {
  ADMIN
  VIEWER @map("viewer")
}

model Sample {
  id       String    @id @default(uuid(7))
  legacy   String    @default(cuid())
  modern   String    @default(cuid(2))
  sortable String    @default(ulid())
  short    String    @default(nanoid(8))
  key      String    @db.Uuid
  code     String    @db.VarChar(4)
  email    String
  website  String?
  free     String
  small    Int?      @db.SmallInt
  count    Int
  big      BigInt
  ratio    Float
  price    Decimal   @db.Decimal(6, 2)
  amount   Decimal
  flag     Boolean
  at       DateTime
  role     Role
  tags     String[]
  meta     Json
  blob     Bytes
  plain    String    @default(nanoid())
  v4       String    @default(uuid(4))
  chr      String    @db.Char(2)
  whole    Decimal   @db.Decimal(4, 0)
  text     String    @db.Text
  mail     String
  homepage String
  emailNote String
  urlCount Int
  roles    Role[]
  when     DateTime? @db.Date
}
`

// The integer widths only MySQL has; PostgreSQL's parser rejects them, so they get their own schema.
const MYSQL_SCHEMA = `
datasource db {
  provider = "mysql"
}

model Widths {
  id      Int @id
  tiny    Int @db.TinyInt
  utiny   Int @db.UnsignedTinyInt
  medium  Int @db.MediumInt
  umedium Int @db.UnsignedMediumInt
  usmall  Int @db.UnsignedSmallInt
  uint    Int @db.UnsignedInt
  plain   Int
}
`

function table(schema = SCHEMA, name = 'Sample') {
  const result: DMMF.Document | GetDMMFError = getDMMF({ datamodel: [['schema.prisma', schema]] })
  if ('type' in result) throw new Error(result.error.message)
  const found = Effect.runSync(makeSeedPlan(result.datamodel)).find((t) => t.name === name)
  if (found?.kind !== 'model') throw new Error('model table expected')
  return found
}

const TABLE: ModelTable = table()
const WIDTHS: ModelTable = table(MYSQL_SCHEMA, 'Widths')

function field(name: string) {
  const found = TABLE.model.fields.find((f) => f.name === name)
  if (found === undefined) throw new Error(`no field ${name}`)
  return found
}

/** The first message a value fails the field's schema with, or null when it passes. */
function problem(name: string, value: unknown) {
  const column = TABLE.columns.find((c) => c.field === name)
  const result = fieldSchema(field(name), column?.enumValues ?? null).safeParse(value)
  return result.success ? null : (result.error.issues[0]?.message ?? '')
}

// cspell:ignore ghijklmnopqrstuv xxat zmbrgj NDEKTSV RRFFQ
const VALID = {
  id: '0195a4c8-3d2e-7f10-8a5b-1c2d3e4f5a6b',
  legacy: 'cm1abcdefghijklmnopqrstuv',
  modern: 'tz4a98xxat96iws9zmbrgj3a',
  sortable: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  short: 'V1StGXR8',
  key: '9d5e6c7a-1b2c-4d3e-8f90-123456789abc',
  code: 'ABCD',
  email: 'ann@example.com',
  website: 'https://example.com/path?x=1',
  free: 'anything at all',
  small: 1000,
  count: 42,
  big: 9n,
  ratio: 1.5,
  price: '1234.56',
  amount: '10.5',
  flag: true,
  at: new Date('2025-01-01T00:00:00.000Z'),
  role: 'ADMIN',
  tags: ['a', 'b'],
  meta: { note: 'x', list: [1, null] },
  blob: Uint8Array.from([1]),
  plain: 'V1StGXR8_Z5jdHi6B-myT',
  v4: '9d5e6c7a-1b2c-4d3e-8f90-123456789abc',
  chr: 'ab',
  whole: '1234',
  text: 'x'.repeat(10_000),
  mail: 'bob@example.org',
  homepage: 'http://example.org',
  emailNote: 'not an address, and no need to be',
  urlCount: 3,
  roles: ['ADMIN', 'VIEWER'],
  when: new Date('2025-01-01T00:00:00.000Z'),
}

describe('fieldSchema', () => {
  it('accepts every value that fits its field', () => {
    for (const [name, value] of Object.entries(VALID)) {
      expect([name, problem(name, value)]).toStrictEqual([name, null])
    }
    expect(problem('small', null)).toBeNull()
  })

  it('knows the id formats Prisma generates', () => {
    expect(problem('id', VALID.key)).toBe('Invalid UUID v7')
    expect(problem('legacy', VALID.modern)).toBe('Invalid cuid')
    expect(problem('modern', 'UPPER98xxat96iws9zmbrgj3')).toBe('Invalid cuid2')
    expect(problem('modern', 'tz4a98xxat96iws9zmbrgj3')).toBe(
      'Invalid cuid2: 24 characters expected',
    )
    expect(problem('sortable', '01ARZ3NDEKTSV4RRFFQ69G5FA')).toBe('Invalid ULID')
    expect(problem('short', 'V1StGXR8x')).toBe('Invalid nanoid of 8 characters')
    expect(problem('key', 'nope')).toBe('Invalid UUID')
  })

  it('reads an email address or a URL from the field name', () => {
    expect(problem('email', 'ann@example')).toBe('Invalid email address')
    expect(problem('email', 'not an email')).toBe('Invalid email address')
    expect(problem('website', 'example.com')).toBe('Invalid URL')
    expect(problem('website', null)).toBeNull()
  })

  it('reads lengths, ranges and digits from @db attributes', () => {
    expect(problem('code', 'ABCDE')).toBe('Too big: expected string to have <=4 characters')
    expect(problem('small', 40_000)).toBe('Too big: expected number to be <=32767')
    expect(problem('small', -40_000)).toBe('Too small: expected number to be >=-32768')
    expect(problem('count', 1.5)).toBe('Invalid input: expected int, received number')
    expect(problem('count', 3_000_000_000)).toBe('Too big: expected number to be <=2147483647')
    expect(problem('price', '12345.67')).toBe(
      'Invalid decimal: at most 4 integer and 2 fraction digits (@db.Decimal(6, 2))',
    )
    expect(problem('price', '12.345')).toBe(
      'Invalid decimal: at most 4 integer and 2 fraction digits (@db.Decimal(6, 2))',
    )
    expect(problem('amount', 'ten')).toBe('Invalid decimal string')
  })

  it('checks the plain types, enum members, lists, JSON and bytes', () => {
    expect(problem('big', 9)).toBe('Invalid input: expected bigint, received number')
    expect(problem('ratio', Number.NaN)).toBe('Invalid input: expected number, received NaN')
    expect(problem('flag', 'yes')).toBe('Invalid input: expected boolean, received string')
    expect(problem('at', new Date('nope'))).toBe('Invalid input: expected date, received Date')
    expect(problem('at', '2025-01-01')).toBe('Invalid input: expected date, received string')
    expect(problem('role', 'viewer')).toBe('Invalid option: expected one of "ADMIN"|"VIEWER"')
    expect(problem('tags', 'a')).toBe('Invalid input: expected array, received string')
    expect(problem('tags', ['a', 1])).toBe('Invalid input: expected string, received number')
    expect(problem('meta', 1n)).toBe('Invalid input')
    expect(problem('blob', 'AQ==')).toBe('Invalid input: expected Uint8Array, received string')
    expect(problem('count', null)).toBe('Invalid input: expected number, received null')
  })
})

describe('fieldSchema, the id formats one by one', () => {
  it.each([
    ['id', '0195a4c8-3d2e-7f10-8a5b-1c2d3e4f5a6b', null],
    ['id', '0195A4C8-3D2E-7F10-8A5B-1C2D3E4F5A6B', null],
    ['id', '9d5e6c7a-1b2c-4d3e-8f90-123456789abc', 'Invalid UUID v7'],
    ['id', '0195a4c8-3d2e-7f10-8a5b-1c2d3e4f5a6', 'Invalid UUID v7'],
    ['id', '0195a4c83d2e7f108a5b1c2d3e4f5a6b', 'Invalid UUID v7'],
    ['id', '', 'Invalid UUID v7'],
    ['id', 'tz4a98xxat96iws9zmbrgj3a', 'Invalid UUID v7'],
    ['v4', '9d5e6c7a-1b2c-4d3e-8f90-123456789abc', null],
    ['v4', '0195a4c8-3d2e-7f10-8a5b-1c2d3e4f5a6b', null],
    ['v4', 'not-a-uuid', 'Invalid UUID'],
    ['key', '9d5e6c7a-1b2c-4d3e-8f90-123456789abc', null],
    ['key', '', 'Invalid UUID'],
    ['legacy', 'cm1abcdefghijklmnopqrstuv', null],
    ['legacy', 'cm1abcdefghijklmnopqrstu', 'Invalid cuid'],
    ['legacy', 'xm1abcdefghijklmnopqrstuv', 'Invalid cuid'],
    ['legacy', 'CM1ABCDEFGHIJKLMNOPQRSTUV', 'Invalid cuid'],
    ['modern', 'tz4a98xxat96iws9zmbrgj3a', null],
    ['modern', 'cm1abcdefghijklmnopqrstuv', 'Invalid cuid2: 24 characters expected'],
    ['modern', 'tz4a98xxat96iws9zmbrgj3ab', 'Invalid cuid2: 24 characters expected'],
    // zod's cuid2 check takes any lower-case alphanumeric string; only the length is added here.
    ['modern', '1z4a98xxat96iws9zmbrgj3a', null],
    ['modern', 'tz4a98xxat-6iws9zmbrgj3a', 'Invalid cuid2'],
    ['sortable', '01ARZ3NDEKTSV4RRFFQ69G5FAV', null],
    ['sortable', '01arz3ndektsv4rrffq69g5fav', null],
    ['sortable', '01ARZ3NDEKTSV4RRFFQ69G5FAVX', 'Invalid ULID'],
    ['sortable', '01ARZ3NDEKTSV4RRFFQ69G5FAI', 'Invalid ULID'],
    ['sortable', '', 'Invalid ULID'],
    ['short', 'V1StGXR8', null],
    ['short', 'V1StGX_-', null],
    ['short', 'V1StGXR', 'Invalid nanoid of 8 characters'],
    ['short', 'V1StGXR!', 'Invalid nanoid of 8 characters'],
    ['plain', 'V1StGXR8_Z5jdHi6B-myT', null],
    ['plain', 'V1StGXR8_Z5jdHi6B-my', 'Invalid nanoid'],
    ['plain', 'V1StGXR8_Z5jdHi6B-myT!', 'Invalid nanoid'],
  ] as const)('%s = %s → %s', (name, value, expected) => {
    expect(problem(name, value)).toBe(expected)
  })
})

describe('fieldSchema, the MySQL integer widths one by one', () => {
  it.each([
    ['tiny', -128, null],
    ['tiny', 127, null],
    ['tiny', 128, 'Too big: expected number to be <=127'],
    ['tiny', -129, 'Too small: expected number to be >=-128'],
    ['utiny', 0, null],
    ['utiny', 255, null],
    ['utiny', 256, 'Too big: expected number to be <=255'],
    ['utiny', -1, 'Too small: expected number to be >=0'],
    ['usmall', 65_535, null],
    ['usmall', 65_536, 'Too big: expected number to be <=65535'],
    ['medium', 8_388_607, null],
    ['medium', 8_388_608, 'Too big: expected number to be <=8388607'],
    ['medium', -8_388_609, 'Too small: expected number to be >=-8388608'],
    ['umedium', 16_777_215, null],
    ['umedium', 16_777_216, 'Too big: expected number to be <=16777215'],
    ['uint', 4_294_967_295, null],
    ['uint', 4_294_967_296, 'Too big: expected number to be <=4294967295'],
    ['uint', -1, 'Too small: expected number to be >=0'],
    ['plain', 2_147_483_647, null],
    ['plain', 2_147_483_648, 'Too big: expected number to be <=2147483647'],
  ] as const)('%s = %s → %s', (name, value, expected) => {
    const found = WIDTHS.model.fields.find((f) => f.name === name)
    if (found === undefined) throw new Error(`no field ${name}`)
    const result = fieldSchema(found, null).safeParse(value)
    expect(result.success ? null : (result.error.issues[0]?.message ?? '')).toBe(expected)
  })
})

describe('fieldSchema, the @db lengths and the Int range one by one', () => {
  it.each([
    ['count', -2_147_483_649, 'Too small: expected number to be >=-2147483648'],
    ['count', '3', 'Invalid input: expected number, received string'],
    ['count', 3n, 'Invalid input: expected number, received bigint'],
    ['chr', 'ab', null],
    ['chr', 'abc', 'Too big: expected string to have <=2 characters'],
    ['chr', '', null],
    ['text', 'x'.repeat(100_000), null],
    ['code', '', null],
    ['code', 4, 'Invalid input: expected string, received number'],
  ] as const)('%s = %s → %s', (name, value, expected) => {
    expect(problem(name, value)).toBe(expected)
  })
})

describe('fieldSchema, names, nullability, lists and the rest', () => {
  it.each([
    ['mail', 'bob@example.org', null],
    ['mail', 'bob@', 'Invalid email address'],
    ['homepage', 'http://example.org', null],
    ['homepage', 'ftp://example.org/file', null],
    ['homepage', '/relative', 'Invalid URL'],
    ['emailNote', 'anything', null],
    ['urlCount', 3, null],
    ['website', 'https://例え.jp', null],
    ['website', 'https://', 'Invalid URL'],
    ['email', 'a@b.co', null],
    ['email', 'a b@example.com', 'Invalid email address'],
    ['email', null, 'Invalid input: expected string, received null'],
    ['website', null, null],
    ['small', null, null],
    ['small', undefined, 'Invalid input: expected number, received undefined'],
    ['when', null, null],
    ['when', new Date('2025-06-01T12:34:56.000Z'), null],
    ['when', 1_735_689_600_000, 'Invalid input: expected date, received number'],
    ['roles', [], null],
    ['roles', ['ADMIN', 'ADMIN'], null],
    ['roles', ['viewer'], 'Invalid option: expected one of "ADMIN"|"VIEWER"'],
    ['roles', null, 'Invalid input: expected array, received null'],
    ['tags', [], null],
    ['tags', [null], 'Invalid input: expected string, received null'],
    ['tags', 'a,b', 'Invalid input: expected array, received string'],
    ['flag', 1, 'Invalid input: expected boolean, received number'],
    ['flag', 'true', 'Invalid input: expected boolean, received string'],
    ['big', '9', 'Invalid input: expected bigint, received string'],
    ['big', 9.5, 'Invalid input: expected bigint, received number'],
    ['big', -(2n ** 70n), null],
    ['ratio', Number.POSITIVE_INFINITY, 'Invalid input: expected number, received Infinity'],
    ['ratio', -0, null],
    ['amount', '-0.5', null],
    ['amount', '1e5', 'Invalid decimal string'],
    ['amount', 10.5, 'Invalid input: expected string, received number'],
    ['price', '-1234.5', null],
    ['price', '1234', null],
    ['price', '.5', 'Invalid decimal: at most 4 integer and 2 fraction digits (@db.Decimal(6, 2))'],
    ['whole', '-9999', null],
    [
      'whole',
      '12345',
      'Invalid decimal: at most 4 integer and 0 fraction digits (@db.Decimal(4, 0))',
    ],
    [
      'whole',
      '12.3',
      'Invalid decimal: at most 4 integer and 0 fraction digits (@db.Decimal(4, 0))',
    ],
    [
      'whole',
      '12.',
      'Invalid decimal: at most 4 integer and 0 fraction digits (@db.Decimal(4, 0))',
    ],
    ['meta', null, null],
    ['meta', [1, 'two', { three: true }], null],
    ['meta', undefined, 'Invalid input'],
    ['meta', new Date(), 'Invalid input'],
    ['blob', new TextEncoder().encode('hi'), null],
    ['blob', new Uint8Array(0), null],
    ['blob', [1, 2], 'Invalid input: expected Uint8Array, received array'],
    ['role', 'ADMIN', null],
    ['role', 'admin', 'Invalid option: expected one of "ADMIN"|"VIEWER"'],
    ['role', 0, 'Invalid option: expected one of "ADMIN"|"VIEWER"'],
    ['at', new Date(0), null],
    ['at', '2025-01-01T00:00:00.000Z', 'Invalid input: expected date, received string'],
    ['free', 'x'.repeat(1_000_000), null],
  ] as const)('%s = %s → %s', (name, value, expected) => {
    expect(problem(name, value)).toBe(expected)
  })
})

describe('validateRows', () => {
  it('is fine with no rows, ignores keys that are not columns, and caps the report at twenty lines', () => {
    expect(Exit.isSuccess(Effect.runSyncExit(validateRows(TABLE, [])))).toBe(true)
    // Keys no column owns are reported before validation, by the generator; here they are passed over.
    expect(Exit.isSuccess(Effect.runSyncExit(validateRows(TABLE, [{ ...VALID, nope: 'x' }])))).toBe(
      true,
    )
    const broken = Array.from({ length: 25 }, (_, i) => ({ ...VALID, count: `${i}` }))
    const error = Effect.runSync(Effect.flip(validateRows(TABLE, broken)))
    const lines = error.message.split('\n')
    expect(lines[0]).toBe('Sample: 25 values failed validation, nothing was inserted.')
    expect(lines[1]).toBe(
      '   Sample[0].count: Invalid input: expected number, received string (got "0")',
    )
    expect(lines[20]).toBe(
      '   Sample[19].count: Invalid input: expected number, received string (got "19")',
    )
    expect(lines[21]).toBe('   ... and 5 more')
    expect(lines.length).toBe(22)
  })

  it('names one failed value in the singular', () => {
    const error = Effect.runSync(Effect.flip(validateRows(TABLE, [{ ...VALID, flag: 'no' }])))
    expect(error.message).toBe(
      'Sample: 1 value failed validation, nothing was inserted.\n   Sample[0].flag: Invalid input: expected boolean, received string (got "no")',
    )
  })

  it('describes what was there for bigints, dates and bytes, and says nothing for a missing value', () => {
    const { flag, ...withoutFlag } = VALID
    expect(flag).toBe(true)
    expect(Effect.runSync(Effect.flip(validateRows(TABLE, [withoutFlag]))).message).toBe(
      'Sample: 1 value failed validation, nothing was inserted.\n   Sample[0].flag: Invalid input: expected boolean, received undefined (got nothing)',
    )
    const error = Effect.runSync(
      Effect.flip(
        validateRows(TABLE, [{ ...VALID, count: 9n, at: 'x', blob: 'AQ==', big: new Date(0) }]),
      ),
    )
    expect(error.message.split('\n').slice(1)).toStrictEqual([
      '   Sample[0].count: Invalid input: expected number, received bigint (got 9n)',
      '   Sample[0].big: Invalid input: expected bigint, received Date (got 1970-01-01T00:00:00.000Z)',
      '   Sample[0].at: Invalid input: expected date, received string (got "x")',
      '   Sample[0].blob: Invalid input: expected Uint8Array, received string (got "AQ==")',
    ])
  })

  it('passes rows that fit and names every value that does not', () => {
    expect(Exit.isSuccess(Effect.runSyncExit(validateRows(TABLE, [VALID, VALID])))).toBe(true)
    const error = Effect.runSync(
      Effect.flip(
        validateRows(TABLE, [
          VALID,
          { ...VALID, id: 'x', tags: ['ok', 3], small: 1.5 },
          { ...VALID, role: 'ROOT' },
        ]),
      ),
    )
    expect(error.message).toBe(
      [
        'Sample: 4 values failed validation, nothing was inserted.',
        '   Sample[1].id: Invalid UUID v7 (got "x")',
        '   Sample[1].small: Invalid input: expected int, received number (got 1.5)',
        '   Sample[1].tags[1]: Invalid input: expected string, received number (got ["ok",3])',
        '   Sample[2].role: Invalid option: expected one of "ADMIN"|"VIEWER" (got "ROOT")',
      ].join('\n'),
    )
  })
})
