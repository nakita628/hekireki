import { Faker, allLocales } from '@faker-js/faker'
import type { DMMF } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
import type { GetDMMFError } from '@prisma/get-dmmf'
import { describe, expect, it } from 'vite-plus/test'

import { makeFieldValue } from './values.js'

const SCHEMA = `
datasource db {
  provider = "postgresql"
}

enum Role {
  ADMIN
  VIEWER
}

model Sample {
  id        String   @id @default(uuid(7))
  legacy    String   @default(cuid())
  modern    String   @default(cuid(2))
  short     String   @default(nanoid(8))
  sortable  String   @default(ulid())
  seq       BigInt   @default(autoincrement())
  email     String   @unique
  name      String
  nickname  String   @db.VarChar(6)
  age       Int?     @db.SmallInt
  qty       Int
  price     Decimal  @db.Decimal(6, 2)
  ratio     Float
  role      Role     @default(VIEWER)
  tags      String[]
  flags     Boolean
  createdAt DateTime @default(now())
  born      DateTime @db.Date
  meta      Json
  blob      Bytes
  key       String   @db.Uuid
}
`

function fields() {
  const result: DMMF.Document | GetDMMFError = getDMMF({ datamodel: [['schema.prisma', SCHEMA]] })
  if ('type' in result) throw new Error(result.error.message)
  const model = result.datamodel.models[0]
  if (model === undefined) throw new Error('model expected')
  return new Map(model.fields.map((f) => [f.name, f] as const))
}

const FIELDS = fields()
const BOUNDS = {
  nullRate: 0,
  dates: { from: new Date('2025-01-01T00:00:00.000Z'), to: new Date('2025-12-31T23:59:59.999Z') },
}

function field(name: string) {
  const found = FIELDS.get(name)
  if (found === undefined) throw new Error(`no field ${name}`)
  return found
}

function faker(seed = 1) {
  const instance = new Faker({ locale: [allLocales.en, allLocales.base] })
  instance.seed(seed)
  return instance
}

function value(
  name: string,
  options: { readonly rule?: unknown; readonly index?: number; readonly seed?: number } = {},
) {
  return makeFieldValue({
    faker: faker(options.seed),
    field: field(name),
    enumValues:
      name === 'role'
        ? [
            { name: 'ADMIN', dbName: 'ADMIN' },
            { name: 'VIEWER', dbName: 'VIEWER' },
          ]
        : null,
    rule:
      typeof options.rule === 'function' || typeof options.rule === 'object'
        ? (options.rule as never)
        : undefined,
    bounds: BOUNDS,
    index: options.index ?? 0,
    row: {},
  })
}

describe('makeFieldValue', () => {
  it('is deterministic for a seed and differs across seeds, generated ids included', () => {
    expect(value('name', { seed: 3 })).toBe(value('name', { seed: 3 }))
    expect(value('name', { seed: 3 })).not.toBe(value('name', { seed: 4 }))
    // cuid and cuid2 stamp the clock in, so those two are the exception.
    for (const name of ['id', 'short', 'sortable']) {
      expect(value(name, { seed: 5 })).toBe(value(name, { seed: 5 }))
      expect(value(name, { seed: 5 })).not.toBe(value(name, { seed: 6 }))
    }
  })

  it('shapes generated ids like the Prisma functions they stand for', () => {
    // cspell:ignore HJKMNP
    expect(value('id')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    )
    expect(value('legacy')).toMatch(/^c[a-z0-9]{24}$/u)
    expect(value('modern')).toMatch(/^[a-z][a-z0-9]{23}$/u)
    expect(value('short')).toMatch(/^[\w-]{8}$/u)
    expect(value('sortable')).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/u)
    expect(value('key')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    )
  })

  it('numbers autoincrement columns from 1, as a bigint for BigInt', () => {
    expect(value('seq', { index: 0 })).toBe(1n)
    expect(value('seq', { index: 41 })).toBe(42n)
  })

  it('reads the field name: an email is an email, a name a name', () => {
    expect(value('email')).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]+$/u)
    expect(value('name')).toMatch(/^\S+ \S+/u)
  })

  it('cuts strings to the native length and lets a rule cut further', () => {
    expect(JSON.stringify(value('nickname')).length).toBeLessThanOrEqual(8)
    expect(JSON.stringify(value('name', { rule: { length: 3 } })).length).toBeLessThanOrEqual(5)
  })

  it('keeps integers in the native range, the name range and the rule range', () => {
    const age = value('age')
    expect(typeof age === 'number' && age >= 18 && age <= 90).toBe(true)
    const qty = value('qty')
    expect(typeof qty === 'number' && qty >= 1 && qty <= 20).toBe(true)
    const ruled = value('qty', { rule: { min: 100, max: 101 } })
    expect(typeof ruled === 'number' && ruled >= 100 && ruled <= 101).toBe(true)
  })

  it('renders a Decimal with the declared scale and within its precision', () => {
    const price = value('price')
    expect(price).toMatch(/^\d{1,4}\.\d{2}$/u)
    expect(value('ratio')).toBeTypeOf('number')
  })

  it('draws an enum member by its Prisma name, or from the rule values', () => {
    expect(['ADMIN', 'VIEWER']).toContain(value('role'))
    expect(value('role', { rule: { values: ['ADMIN'] } })).toBe('ADMIN')
  })

  it('fills a list with 0 to 3 elements by default and as many as the rule says', () => {
    const tags = value('tags')
    expect(Array.isArray(tags) && tags.length <= 3).toBe(true)
    const ruled = value('tags', { rule: { length: 2 } })
    expect(Array.isArray(ruled) ? ruled.length : -1).toBe(2)
    const chosen = value('tags', { rule: { values: ['x', 'y', 'z'], length: 2 } })
    expect(
      Array.isArray(chosen) &&
        chosen.every((tag) => typeof tag === 'string' && ['x', 'y', 'z'].includes(tag)),
    ).toBe(true)
    expect(Array.isArray(chosen) ? chosen.length : -1).toBe(2)
  })

  it('keeps every DateTime inside the window, and a @db.Date at midnight', () => {
    const created = value('createdAt', { rule: { from: '2025-03-01', to: '2025-03-31' } })
    expect(
      created instanceof Date &&
        created >= new Date('2025-03-01') &&
        created <= new Date('2025-03-31'),
    ).toBe(true)
    const born = value('born')
    expect(born instanceof Date && born.toISOString().endsWith('T00:00:00.000Z')).toBe(true)
  })

  it('makes JSON, bytes and booleans of the right shape', () => {
    const meta = value('meta')
    expect(
      typeof meta === 'object' && meta !== null && !Array.isArray(meta) && 'note' in meta,
    ).toBe(true)
    expect(value('blob')).toBeInstanceOf(Uint8Array)
    expect(value('flags')).toBeTypeOf('boolean')
  })

  it('lets a rule fix the value or compute it from faker and the row', () => {
    expect(value('name', { rule: { value: 'fixed' } })).toBe('fixed')
    expect(
      makeFieldValue({
        faker: faker(),
        field: field('name'),
        enumValues: null,
        rule: (_faker, context) => `${JSON.stringify(context.row.email)}#${context.index}`,
        bounds: BOUNDS,
        index: 4,
        row: { email: 'a@b.c' },
      }),
    ).toBe('"a@b.c"#4')
  })

  it('leaves an optional field null at the null rate, never below zero', () => {
    const always = makeFieldValue({
      faker: faker(),
      field: field('age'),
      enumValues: null,
      rule: undefined,
      bounds: { ...BOUNDS, nullRate: 1 },
      index: 0,
      row: {},
    })
    expect(always).toBeNull()
    expect(value('age', { rule: { nullRate: 0 } })).not.toBeNull()
  })
})
