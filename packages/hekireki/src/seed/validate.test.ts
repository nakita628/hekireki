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
}
`

function table() {
  const result: DMMF.Document | GetDMMFError = getDMMF({ datamodel: [['schema.prisma', SCHEMA]] })
  if ('type' in result) throw new Error(result.error.message)
  const found = Effect.runSync(makeSeedPlan(result.datamodel)).find((t) => t.name === 'Sample')
  if (found?.kind !== 'model') throw new Error('model table expected')
  return found
}

const TABLE: ModelTable = table()

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

describe('validateRows', () => {
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
