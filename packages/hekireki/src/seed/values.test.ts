import { Faker, allLocales } from '@faker-js/faker'
import type { DMMF } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
import type { GetDMMFError } from '@prisma/get-dmmf'
import { describe, expect, it } from 'vite-plus/test'

import { dateBetween, makeFieldValue, nativeTypeOf } from './values.js'

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

// Every field name the generator reads something into, plus the numeric names with a natural range.
const NAMED_SCHEMA = `
datasource db {
  provider = "postgresql"
}

model Named {
  id           Int      @id
  mail         String
  email_address String
  fullName     String
  display_name String
  username     String
  handle       String
  firstName    String
  given_name   String
  lastName     String
  surname      String
  title        String
  headline     String
  description  String
  body         String
  bio          String
  website      String
  link         String
  avatar       String
  imageUrl     String
  phone        String
  mobileNumber String
  address      String
  street       String
  city         String
  country      String
  prefecture   String
  zip          String
  postal_code  String
  slug         String
  sku          String
  promo_code   String
  password     String
  ip           String
  color        String
  colour       String
  company      String
  organisation String
  label        String
  category     String
  currency     String
  token        String
  apiKey       String
  guid         String
  whatever     String
  year         Int
  quantity     Int
  rating       Int
  stars        Int
  total        Int
  small        Int      @db.SmallInt
  count        Int
  lat          Float
  longitude    Float
  fee          Float
  weight       Float
  balance      Decimal  @db.Decimal(4, 1)
  loose        Decimal
  big          BigInt
  at           DateTime @db.Time(0)
  stamp        DateTime @default(now())
  roles        Role[]
  nums         Int[]
  maybe        String?
  maybeList    String[]
}

enum Role {
  ADMIN
  VIEWER
}
`

const MYSQL_SCHEMA = `
datasource db {
  provider = "mysql"
}

model Narrow {
  id    Int @id
  level Int @db.TinyInt
}
`

function fields(schema = SCHEMA) {
  const result: DMMF.Document | GetDMMFError = getDMMF({ datamodel: [['schema.prisma', schema]] })
  if ('type' in result) throw new Error(result.error.message)
  const model = result.datamodel.models[0]
  if (model === undefined) throw new Error('model expected')
  return new Map(model.fields.map((f) => [f.name, f] as const))
}

const FIELDS = fields()
const NAMED = fields(NAMED_SCHEMA)
const NARROW = fields(MYSQL_SCHEMA)
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

function named(name: string, from = NAMED) {
  const found = from.get(name)
  if (found === undefined) throw new Error(`no field ${name}`)
  return found
}

/** A value of the Named model's field, or of the MySQL Narrow model's when asked. */
function namedValue(
  name: string,
  options: {
    readonly rule?: unknown
    readonly seed?: number
    readonly bounds?: { nullRate: number | null; dates: { from: Date; to: Date } | null }
    readonly from?: Map<string, DMMF.Field>
  } = {},
) {
  return makeFieldValue({
    faker: faker(options.seed),
    field: named(name, options.from),
    enumValues:
      name === 'roles'
        ? [
            { name: 'ADMIN', dbName: 'ADMIN' },
            { name: 'VIEWER', dbName: 'VIEWER' },
          ]
        : null,
    rule:
      typeof options.rule === 'function' || typeof options.rule === 'object'
        ? (options.rule as never)
        : undefined,
    bounds: options.bounds ?? BOUNDS,
    index: 0,
    row: {},
  })
}

/** The same field drawn from many seeds, to check a range holds and not just one sample. */
function draws(name: string, count = 200, options: { readonly rule?: unknown } = {}) {
  return Array.from({ length: count }, (_, seed) => namedValue(name, { seed, ...options }))
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

describe('makeFieldValue, what a field name means', () => {
  it.each([
    ['mail', /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]+$/u],
    ['email_address', /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]+$/u],
    ['fullName', /^\S.* \S+/u],
    ['display_name', /^\S.* \S+/u],
    ['username', /^[\w.-]+$/u],
    ['handle', /^[\w.-]+$/u],
    ['firstName', /^\S+$/u],
    ['given_name', /^\S+$/u],
    ['lastName', /^\S+$/u],
    ['surname', /^\S+$/u],
    ['title', /^[^.]+[^.]$/u],
    ['headline', /^[^.]+[^.]$/u],
    ['description', /\. /u],
    ['body', /\. /u],
    ['bio', /\. /u],
    ['website', /^https?:\/\//u],
    ['link', /^https?:\/\//u],
    ['avatar', /^https:\/\//u],
    ['imageUrl', /^https:\/\//u],
    ['phone', /\d/u],
    ['mobileNumber', /\d/u],
    ['address', /^\d+ /u],
    ['street', /^\d+ /u],
    ['city', /^\S/u],
    ['country', /^\S/u],
    ['prefecture', /^\S/u],
    ['zip', /^\d{5}(-\d{4})?$/u],
    ['postal_code', /^\d{5}(-\d{4})?$/u],
    ['slug', /^[a-z]+(-[a-z]+)*$/u],
    ['sku', /^[A-Z0-9]{8}$/u],
    ['promo_code', /^[A-Z0-9]{8}$/u],
    ['password', /^.{15}$/u],
    ['ip', /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-f:]{2,39}$/u],
    ['color', /^[a-z ]+$/u],
    ['colour', /^[a-z ]+$/u],
    ['company', /\S/u],
    ['organisation', /\S/u],
    ['label', /^[a-z]+$/u],
    ['category', /^[a-z]+$/u],
    ['currency', /^[A-Z]{3}$/u],
    ['token', /^[A-Za-z0-9]{32}$/u],
    ['apiKey', /^[A-Za-z0-9]{32}$/u],
    ['guid', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u],
    ['whatever', /^[a-z]+( [a-z]+){0,2}$/u],
  ])('%s looks like the name says', (name, shape) => {
    for (const drawn of draws(name, 40)) expect(drawn).toMatch(shape)
  })

  it.each([
    ['year', 1970, 2030],
    ['quantity', 1, 20],
    ['rating', 1, 5],
    ['stars', 1, 5],
    ['total', 0, 100_000],
    ['small', 0, 32_767],
    ['count', 0, 1000],
  ])('%s is an integer between %d and %d', (name, min, max) => {
    for (const drawn of draws(name)) {
      expect(Number.isInteger(drawn)).toBe(true)
      expect(typeof drawn === 'number' && drawn >= min && drawn <= max).toBe(true)
    }
  })

  it('keeps a MySQL TinyInt between 0 and 127', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const drawn = namedValue('level', { seed, from: NARROW })
      expect(
        typeof drawn === 'number' && Number.isInteger(drawn) && drawn >= 0 && drawn <= 127,
      ).toBe(true)
    }
  })

  it.each([
    ['lat', -90, 90],
    ['longitude', -180, 180],
    ['fee', 0, 10_000],
    ['weight', 0, 1000],
  ])('%s is a float between %d and %d with two decimals', (name, min, max) => {
    for (const drawn of draws(name)) {
      expect(typeof drawn === 'number' && drawn >= min && drawn <= max).toBe(true)
      expect(typeof drawn === 'number' && Number(drawn.toFixed(2)) === drawn).toBe(true)
    }
  })

  it('lets a rule move the bounds of any number, below and above the natural ones', () => {
    for (const drawn of draws('rating', 100, { rule: { min: 10, max: 12 } })) {
      expect(typeof drawn === 'number' && drawn >= 10 && drawn <= 12).toBe(true)
    }
    for (const drawn of draws('lat', 100, { rule: { min: -1, max: 0 } })) {
      expect(typeof drawn === 'number' && drawn >= -1 && drawn <= 0).toBe(true)
    }
    for (const drawn of draws('big', 100, { rule: { min: 5, max: 6 } })) {
      expect(drawn === 5n || drawn === 6n).toBe(true)
    }
    expect(namedValue('year', { rule: { min: 2000, max: 2000 } })).toBe(2000)
  })

  it('makes a BigInt a bigint in the Int range of its name', () => {
    for (const drawn of draws('big', 50)) {
      expect(typeof drawn === 'bigint' && drawn >= 0n && drawn <= 1000n).toBe(true)
    }
  })
})

describe('makeFieldValue, decimals and dates', () => {
  it('fits a Decimal to its precision and scale, and defaults to (10, 2)', () => {
    for (const drawn of draws('balance')) expect(drawn).toMatch(/^\d{1,3}\.\d$/u)
    for (const drawn of draws('loose')) expect(drawn).toMatch(/^\d{1,8}\.\d{2}$/u)
    for (const drawn of draws('balance', 100, { rule: { min: -5, max: -4 } })) {
      expect(drawn).toMatch(/^-[45]\.\d$/u)
    }
    // A rule beyond the precision is cut to what the column can hold, in both directions.
    expect(namedValue('balance', { rule: { min: 999_999, max: 999_999 } })).toBe('999.0')
    expect(namedValue('balance', { rule: { min: -999_999, max: -999_999 } })).toBe('-999.0')
    for (const drawn of draws('balance', 50, { rule: { min: 500, max: 999_999 } })) {
      expect(drawn).toMatch(/^[5-9]\d\d\.\d$/u)
    }
  })

  it('keeps a @db.Time on the epoch day and a DateTime in the window, with now() drawn the same way', () => {
    for (const drawn of draws('at', 50)) {
      expect(drawn instanceof Date && drawn.toISOString().startsWith('1970-01-01T')).toBe(true)
    }
    for (const drawn of draws('stamp', 50)) {
      expect(drawn instanceof Date && drawn >= BOUNDS.dates.from && drawn <= BOUNDS.dates.to).toBe(
        true,
      )
    }
  })

  it('draws a date from the rule window first, the config window next, and the past year last', () => {
    const rule = dateBetween(faker(), { from: '2020-01-01', to: '2020-01-31' }, BOUNDS)
    expect(rule >= new Date('2020-01-01') && rule <= new Date('2020-01-31')).toBe(true)
    const config = dateBetween(faker(), {}, BOUNDS)
    expect(config >= BOUNDS.dates.from && config <= BOUNDS.dates.to).toBe(true)
    const instance = faker()
    const reference = new Date(instance.defaultRefDate())
    const none = dateBetween(instance, {}, { nullRate: null, dates: null })
    expect(none <= reference).toBe(true)
    expect(none.getTime()).toBeGreaterThanOrEqual(reference.getTime() - 366 * 24 * 60 * 60 * 1000)
  })

  it('completes a rule with one edge from the config window, and swaps edges given backwards', () => {
    const late = dateBetween(faker(), { from: '2025-12-01' }, BOUNDS)
    expect(late >= new Date('2025-12-01') && late <= BOUNDS.dates.to).toBe(true)
    const early = dateBetween(faker(), { to: '2025-01-31' }, BOUNDS)
    expect(early >= BOUNDS.dates.from && early <= new Date('2025-01-31')).toBe(true)
    const swapped = dateBetween(faker(), { from: '2025-06-30', to: '2025-06-01' }, BOUNDS)
    expect(swapped >= new Date('2025-06-01') && swapped <= new Date('2025-06-30')).toBe(true)
    // A window given only by config edges narrows the same way as a rule.
    const onlyFrom = dateBetween(
      faker(),
      {},
      { nullRate: null, dates: { from: new Date('2030-01-01'), to: new Date('2030-01-02') } },
    )
    expect(onlyFrom >= new Date('2030-01-01') && onlyFrom <= new Date('2030-01-02')).toBe(true)
  })
})

describe('makeFieldValue, lists, nulls and fixed values', () => {
  it('sizes a list by min and max, by length, and never returns null for one', () => {
    for (const drawn of draws('nums', 50, { rule: { min: 2, max: 4 } })) {
      expect(Array.isArray(drawn) && drawn.length >= 2 && drawn.length <= 4).toBe(true)
    }
    for (const drawn of draws('roles', 50, { rule: { length: { min: 1, max: 1 } } })) {
      expect(drawn).toHaveLength(1)
      expect(['ADMIN', 'VIEWER']).toContain(Array.isArray(drawn) ? drawn[0] : null)
    }
    expect(namedValue('nums', { rule: { min: 0, max: 0 } })).toStrictEqual([])
    for (const drawn of draws('maybeList', 50, { bounds: { nullRate: 1, dates: null } } as never)) {
      expect(Array.isArray(drawn)).toBe(true)
    }
  })

  it('keeps list elements inside their own bounds, not the list length bounds', () => {
    for (const drawn of draws('nums', 50, { rule: { min: 3, max: 3 } })) {
      expect(
        Array.isArray(drawn) && drawn.every((n) => typeof n === 'number' && n >= 0 && n <= 1000),
      ).toBe(true)
    }
  })

  it('nulls an optional field by the rule rate over the config rate, and never a required one', () => {
    const always = { nullRate: 1, dates: null }
    const never = { nullRate: 0, dates: null }
    expect(namedValue('maybe', { bounds: always })).toBeNull()
    expect(namedValue('maybe', { bounds: never })).not.toBeNull()
    expect(namedValue('maybe', { bounds: { nullRate: null, dates: null } })).not.toBeNull()
    expect(namedValue('maybe', { bounds: always, rule: { nullRate: 0 } })).not.toBeNull()
    expect(namedValue('maybe', { bounds: never, rule: { nullRate: 1 } })).toBeNull()
    for (const drawn of draws('whatever', 50, { bounds: always } as never)) {
      expect(drawn).not.toBeNull()
    }
    const nulls = draws('maybe', 400, { bounds: { nullRate: 0.25, dates: null } } as never).filter(
      (drawn) => drawn === null,
    ).length
    expect(nulls).toBeGreaterThan(50)
    expect(nulls).toBeLessThan(150)
  })

  it('returns a fixed value as it is, null included, before any drawing', () => {
    expect(namedValue('count', { rule: { value: 7 } })).toBe(7)
    expect(namedValue('maybe', { rule: { value: null } })).toBeNull()
    expect(namedValue('nums', { rule: { value: [1, 2] } })).toStrictEqual([1, 2])
    const fixed = new Date('2001-01-01T00:00:00.000Z')
    expect(namedValue('stamp', { rule: { value: fixed } })).toBe(fixed)
  })

  it('draws from the rule values only, for scalars and for lists', () => {
    for (const drawn of draws('count', 50, { rule: { values: [1, 2, 3] } })) {
      expect([1, 2, 3]).toContain(drawn)
    }
    for (const drawn of draws('nums', 50, { rule: { values: [9], length: 3 } })) {
      expect(drawn).toStrictEqual([9])
    }
    // An empty list of values means no restriction.
    expect(typeof namedValue('count', { rule: { values: [] } })).toBe('number')
  })

  it('hands a rule function the seeded faker, the index and the row so far', () => {
    const seen: unknown[] = []
    const made = makeFieldValue({
      faker: faker(9),
      field: named('count'),
      enumValues: null,
      rule: (instance, context) => {
        seen.push(context)
        return instance.number.int({ min: 5, max: 5 })
      },
      bounds: BOUNDS,
      index: 3,
      row: { id: 1, mail: 'a@b.c' },
    })
    expect(made).toBe(5)
    expect(seen).toStrictEqual([{ index: 3, row: { id: 1, mail: 'a@b.c' } }])
  })

  it('numbers an Int id from the index unless a rule gives it a range', () => {
    expect(namedValue('id')).toBe(1)
    expect(
      makeFieldValue({
        faker: faker(),
        field: named('id'),
        enumValues: null,
        rule: undefined,
        bounds: BOUNDS,
        index: 9,
        row: {},
      }),
    ).toBe(10)
    const ruled = namedValue('id', { rule: { min: 100, max: 100 } })
    expect(ruled).toBe(100)
  })

  it('leaves an enum with no members null rather than inventing one', () => {
    expect(
      makeFieldValue({
        faker: faker(),
        field: field('role'),
        enumValues: [],
        rule: undefined,
        bounds: BOUNDS,
        index: 0,
        row: {},
      }),
    ).toBeNull()
  })
})

describe('nativeTypeOf', () => {
  it('reads the @db attribute name and numeric arguments, or none', () => {
    expect(nativeTypeOf(field('nickname'))).toStrictEqual({ name: 'VarChar', args: [6] })
    expect(nativeTypeOf(field('price'))).toStrictEqual({ name: 'Decimal', args: [6, 2] })
    expect(nativeTypeOf(field('born'))).toStrictEqual({ name: 'Date', args: [] })
    expect(nativeTypeOf(field('name'))).toStrictEqual({ name: null, args: [] })
  })
})
