import { describe, expect, it } from 'vite-plus/test'

import { isWriteOperation, makeClientQuery, makeClientResult, makeSqlParams } from './client.js'

const MODELS = ['User', 'Post', 'OrderItem']

describe('makeClientQuery', () => {
  it('reads one call with its literal argument', () => {
    const text = `prisma.user.findMany({
  where: { email: { contains: 'ann' }, age: { gte: -18 }, "quoted key": 1 },
  orderBy: [{ createdAt: 'desc' }],
  take: 10,
  skip: 0,
  include: { posts: true },
})`
    expect(makeClientQuery({ text, models: MODELS })).toStrictEqual({
      calls: [
        {
          model: 'User',
          delegate: 'user',
          operation: 'findMany',
          write: false,
          args: {
            where: { email: { contains: 'ann' }, age: { gte: -18 }, 'quoted key': 1 },
            orderBy: [{ createdAt: 'desc' }],
            take: 10,
            skip: 0,
            include: { posts: true },
          },
          range: { start: 0, end: text.length },
        },
      ],
      transaction: false,
      options: undefined,
      diagnostics: [],
    })
  })

  it('takes a call without an argument, a leading await, a trailing semicolon and comments', () => {
    const text = '// how many?\nawait prisma.orderItem.count(); /* done */'
    expect(makeClientQuery({ text, models: MODELS })).toStrictEqual({
      calls: [
        {
          model: 'OrderItem',
          delegate: 'orderItem',
          operation: 'count',
          write: false,
          args: undefined,
          range: { start: 19, end: 43 },
        },
      ],
      transaction: false,
      options: undefined,
      diagnostics: [],
    })
  })

  it('reads dates, bigints, nulls, undefined, escapes and number forms', () => {
    const text = `db.post.create({ data: {
  at: new Date("2025-01-01T00:00:00.000Z"),
  epoch: new Date(0),
  big: 12_345n,
  hex: 0xff,
  exp: 1.5e3,
  none: null,
  skip: undefined,
  flag: false,
  text: 'it\\'s\\né\\x41',
  tpl: \`plain\`,
}, })`
    const { calls, diagnostics } = makeClientQuery({ text, models: MODELS })
    expect(diagnostics).toStrictEqual([])
    expect(calls.map((call) => call.args)).toStrictEqual([
      {
        data: {
          at: new Date('2025-01-01T00:00:00.000Z'),
          epoch: new Date(0),
          big: 12_345n,
          hex: 255,
          exp: 1500,
          none: null,
          skip: undefined,
          flag: false,
          text: "it's\néA",
          tpl: 'plain',
        },
      },
    ])
    expect(calls.map((call) => call.write)).toStrictEqual([true])
  })

  it('reads a batch $transaction with its options', () => {
    const text =
      'prisma.$transaction([prisma.user.count(), prisma.post.deleteMany({ where: { id: 1 } }),], { isolationLevel: "Serializable" })'
    expect(makeClientQuery({ text, models: MODELS })).toStrictEqual({
      calls: [
        {
          model: 'User',
          delegate: 'user',
          operation: 'count',
          write: false,
          args: undefined,
          range: { start: 21, end: 40 },
        },
        {
          model: 'Post',
          delegate: 'post',
          operation: 'deleteMany',
          write: true,
          args: { where: { id: 1 } },
          range: { start: 42, end: 86 },
        },
      ],
      transaction: true,
      options: { isolationLevel: 'Serializable' },
      diagnostics: [],
    })
  })

  it('reports every unknown delegate and operation, and keeps the calls that resolve', () => {
    const text =
      'prisma.$transaction([prisma.usr.findMany(), prisma.post.findAll(), prisma.user.count()])'
    expect(makeClientQuery({ text, models: MODELS })).toStrictEqual({
      calls: [
        {
          model: 'User',
          delegate: 'user',
          operation: 'count',
          write: false,
          args: undefined,
          range: { start: 67, end: 86 },
        },
      ],
      transaction: true,
      options: undefined,
      diagnostics: [
        {
          message: 'Unknown model delegate "usr". The client has user, post, orderItem',
          range: { start: 28, end: 31 },
        },
        {
          message:
            '"findAll" is not a model operation. Use findUnique, findUniqueOrThrow, findFirst, findFirstOrThrow, findMany, count, aggregate, groupBy, create, createMany, createManyAndReturn, update, updateMany, updateManyAndReturn, upsert, delete, deleteMany',
          range: { start: 56, end: 63 },
        },
      ],
    })
    expect(makeClientQuery({ text: 'prisma.user.count()', models: [] }).diagnostics).toStrictEqual([
      {
        message: 'Unknown model delegate "user": the schema has no models',
        range: { start: 7, end: 11 },
      },
    ])
  })

  it.each([
    [
      'prisma.user.findMany({ where: { id } })',
      '"id" is a variable: write "id: <value>"',
      { start: 32, end: 34 },
    ],
    [
      'prisma.user.findMany({ where: { id: userId } })',
      '"userId" is not a literal. Arguments are read, not evaluated: write strings, numbers, booleans, null, objects, arrays or new Date(...).',
      { start: 36, end: 42 },
    ],
    [
      'prisma.user.findMany({ ...base })',
      'Spread is not supported: write the fields out',
      { start: 23, end: 26 },
    ],
    [
      'prisma.user.findMany({ [key]: 1 })',
      'Computed keys are not supported',
      { start: 23, end: 24 },
    ],
    [
      'prisma.user.findMany({ where: { name: `${name}` } })',
      'Template literals that interpolate are not supported',
      { start: 38, end: 47 },
    ],
    [
      'prisma.user.findMany({ at: new Map() })',
      'Only new Date(...) is supported, not new Map',
      { start: 31, end: 34 },
    ],
    [
      'prisma.user.findMany({ at: new Date("soon") })',
      'Invalid date: "soon"',
      { start: 36, end: 43 },
    ],
    [
      'prisma.user.findMany({ take: 1 }, {})',
      'A model operation takes one argument',
      { start: 34, end: 35 },
    ],
    [
      'prisma.user.findMany({ take: 1 ',
      'Expected "," or "}", found the end of the text',
      { start: 30, end: 30 },
    ],
    ['prisma.user.findMany({ name: "ann })', 'Unterminated string', { start: 29, end: 30 }],
    ['prisma.user.findMany() /* open', 'Unterminated comment', { start: 23, end: 25 }],
    ['prisma.user.findMany({ a: 1 # 2 })', 'Unexpected character "#"', { start: 28, end: 29 }],
    [
      'prisma.user.count()\nprisma.post.count()',
      'Only one call runs at a time: batch several in prisma.$transaction([...])',
      { start: 20, end: 39 },
    ],
    [
      'prisma.$queryRaw`SELECT 1`',
      '$queryRaw is not supported here: run raw SQL on the SQL page',
      { start: 7, end: 16 },
    ],
    [
      'prisma.$transaction(async (tx) => tx.user.count())',
      '$transaction takes an array of calls here: prisma.$transaction([prisma.user.count(), ...])',
      { start: 20, end: 25 },
    ],
    ['prisma.$transaction([])', '$transaction needs at least one call', { start: 20, end: 21 }],
    [
      'prisma.$transaction([prisma.$transaction([])])',
      '$transaction cannot be nested',
      { start: 28, end: 40 },
    ],
    ['prisma.user', 'Expected "." and an operation after "user"', { start: 11, end: 11 }],
    [
      'prisma.user.findMany',
      'Expected "(" after "findMany", found the end of the text',
      { start: 20, end: 20 },
    ],
    ['user.findMany()', 'Expected "." and an operation after "findMany"', { start: 13, end: 14 }],
    ['42', 'Expected a call such as prisma.user.findMany(), found "42"', { start: 0, end: 2 }],
  ])('refuses %s', (text, message, range) => {
    expect(makeClientQuery({ text, models: MODELS })).toStrictEqual({
      calls: [],
      transaction: false,
      options: undefined,
      diagnostics: [{ message, range }],
    })
  })
})

describe('isWriteOperation', () => {
  it('tells the writes from the reads', () => {
    expect(
      ['findMany', 'count', 'groupBy', 'create', 'upsert', 'deleteMany', 'updateManyAndReturn'].map(
        (operation) => isWriteOperation({ operation }),
      ),
    ).toStrictEqual([false, false, false, true, true, true, true])
  })
})

describe('makeClientResult', () => {
  it('writes the values JSON cannot carry as strings', () => {
    class Decimal {
      constructor(private readonly digits: string) {}
      toJSON() {
        return this.digits
      }
    }
    expect(
      makeClientResult({
        value: {
          id: 1n,
          at: new Date('2025-01-01T00:00:00.000Z'),
          price: new Decimal('9.90'),
          bytes: new Uint8Array([104, 105]),
          nested: [{ none: undefined, nan: Number.NaN }],
          bare: Object.assign(Object.create(null), { ok: true }),
        },
        limit: 10,
      }),
    ).toStrictEqual({
      result: {
        id: '1',
        at: '2025-01-01T00:00:00.000Z',
        price: '9.90',
        bytes: 'aGk=',
        nested: [{ none: null, nan: null }],
        bare: { ok: true },
      },
      rowCount: null,
      truncated: false,
    })
  })

  it('keeps the first rows of an array and says how many there were', () => {
    expect(makeClientResult({ value: [{ id: 1 }, { id: 2 }, { id: 3 }], limit: 2 })).toStrictEqual({
      result: [{ id: 1 }, { id: 2 }],
      rowCount: 3,
      truncated: true,
    })
    expect(makeClientResult({ value: 3, limit: 2 })).toStrictEqual({
      result: 3,
      rowCount: null,
      truncated: false,
    })
  })
})

describe('makeSqlParams', () => {
  it('reads the logged params as cells', () => {
    expect(makeSqlParams({ text: '["ann",10,true,null,[1],{"a":1}]' })).toStrictEqual([
      'ann',
      10,
      true,
      null,
      '[1]',
      '{"a":1}',
    ])
    expect(makeSqlParams({ text: 'not json' })).toStrictEqual([])
    expect(makeSqlParams({ text: '{"a":1}' })).toStrictEqual([])
  })
})

describe('makeClientQuery on large and deep input', () => {
  it('reads the data of a createMany with twenty thousand rows', () => {
    const rows = Array.from({ length: 20_000 }, (_, index) => `{ email: "u${index}@example.com" }`)
    const text = `prisma.user.createMany({ data: [${rows.join(', ')}] })`
    const { calls, diagnostics } = makeClientQuery({ text, models: MODELS })
    expect(diagnostics).toStrictEqual([])
    const args = calls[0]?.args as { data: { email: string }[] }
    expect(args.data).toHaveLength(20_000)
    expect(args.data.at(-1)).toStrictEqual({ email: 'u19999@example.com' })
  })

  it('refuses arguments nested past the limit with a diagnostic, not a crash', () => {
    const open = '['.repeat(300)
    const text = `prisma.user.findMany({ where: { id: { in: ${open}1${']'.repeat(300)} } } })`
    expect(makeClientQuery({ text, models: MODELS }).diagnostics).toStrictEqual([
      { message: 'The arguments nest deeper than 256 levels', range: { start: 294, end: 295 } },
    ])
    const fine = `prisma.user.findMany({ where: { id: { in: ${'['.repeat(200)}1${']'.repeat(200)} } } })`
    expect(makeClientQuery({ text: fine, models: MODELS }).diagnostics).toStrictEqual([])
  })
})

describe('makeClientQuery on the rest of what it refuses', () => {
  it.each([
    ['prisma.user.findMany({ at: new Date })', 'Expected "(" after "new Date", found "}"'],
    ['prisma.user.findMany({ at: new Date(now) })', 'new Date takes one string or number'],
    ['prisma.user.findMany({ at: new Date(1n) })', 'new Date takes one string or number'],
    ['prisma.user.findMany({ at: new Date(1, 2) })', 'Expected ")", found ","'],
    ['prisma.user.findMany({ (a): 1 })', 'Expected a key, found "("'],
    ['prisma.user.findMany({ a 1 })', 'Expected ":" after "a", found "1"'],
    ['prisma.user.findMany({ "a" })', 'Expected ":" after "a", found "}"'],
    ['prisma.user.findMany({ a: - x })', 'Expected a number after "-"'],
    ['prisma.user.findMany({ a: 1 }', 'Expected ")", found the end of the text'],
    ['prisma.user.findMany(,)', 'Expected a value, found ","'],
    ['prisma user', 'Expected "." after "prisma", found "user"'],
    ['prisma.(', 'Expected a model delegate such as "user", found "("'],
    ['prisma.1', 'Expected "." after "prisma", found ".1"'],
    ['prisma.user."findMany"()', 'Expected an operation such as "findMany", found ""findMany""'],
    ['prisma.$transaction', 'Expected "(" after "$transaction", found the end of the text'],
    ['prisma.$transaction([prisma.user.count()] {})', 'Expected ")", found "{"'],
    [
      'prisma.$transaction([prisma.user.count()], { a: b })',
      '"b" is not a literal. Arguments are read, not evaluated: write strings, numbers, booleans, null, objects, arrays or new Date(...).',
    ],
    [
      'prisma.$transaction([prisma.user.count() prisma.post.count()])',
      'Expected "," or "]", found "prisma"',
    ],
  ])('refuses %s', (text, message) => {
    expect(
      makeClientQuery({ text, models: MODELS }).diagnostics.map((d) => d.message),
    ).toStrictEqual([message])
  })

  it('reads new Date() as the moment it is read, and a number key as its text', () => {
    const before = Date.now()
    const { calls } = makeClientQuery({
      text: 'prisma.user.findMany({ where: { at: new Date() }, 1: "one", 0x10: "hex" })',
      models: MODELS,
    })
    const args = calls[0]?.args as { where: { at: Date }; 1: string; 16: string }
    expect(args.where.at).toBeInstanceOf(Date)
    expect(args.where.at.getTime()).toBeGreaterThanOrEqual(before)
    expect(args.where.at.getTime()).toBeLessThanOrEqual(Date.now())
    expect([args[1], args[16]]).toStrictEqual(['one', 'hex'])
  })
})

describe('makeClientQuery reads back whatever literal it is given', () => {
  // A seeded generator (Park–Miller): the same trees on every run, different ones per seed.
  function random(seed: number) {
    const state = { value: (seed % 2_147_483_646) + 1 }
    return () => {
      state.value = (state.value * 48_271) % 2_147_483_647
      return (state.value - 1) / 2_147_483_646
    }
  }

  type Value =
    | string
    | number
    | bigint
    | boolean
    | null
    | undefined
    | Date
    | Value[]
    | { [key: string]: Value }

  const CHARACTERS = [
    'a',
    'Z',
    '0',
    ' ',
    '"',
    "'",
    '`',
    '\\',
    '\n',
    '\t',
    '$',
    '{',
    '}',
    'é',
    '漢',
    '😀',
    '/',
    '*',
  ]
  const KEYS = [
    'id',
    'email',
    'where',
    'new',
    'true',
    '$in',
    '_count',
    'has space',
    'dash-ed',
    'ünï',
    '0',
  ]

  function valueOf(draw: () => number, depth: number): Value {
    const pick = <T>(items: readonly T[]) => items[Math.floor(draw() * items.length)] ?? items[0]
    const kind = pick(
      depth > 3
        ? ['string', 'int', 'float', 'bigint', 'literal', 'date']
        : ['string', 'int', 'float', 'bigint', 'literal', 'date', 'array', 'object', 'object'],
    )
    if (kind === 'string') {
      return Array.from({ length: Math.floor(draw() * 8) }, () => pick(CHARACTERS)).join('')
    }
    if (kind === 'int') return Math.floor(draw() * 2_000_000) - 1_000_000 || 1
    if (kind === 'float') return (draw() - 0.5) * 10 ** Math.floor(draw() * 12) || 0.5
    if (kind === 'bigint') return BigInt(Math.floor(draw() * 1e15)) * 1000n + 7n
    if (kind === 'literal') return pick([true, false, null, undefined])
    if (kind === 'date') return new Date(Math.floor(draw() * 4e12))
    if (kind === 'array') {
      return Array.from({ length: Math.floor(draw() * 4) }, () => valueOf(draw, depth + 1))
    }
    const keys = KEYS.filter(() => draw() < 0.4)
    return Object.fromEntries(keys.map((key) => [key, valueOf(draw, depth + 1)]))
  }

  function printOf(draw: () => number, value: Value): string {
    const gap = () => [' ', '', '\n  ', ' /* c */ ', ' // c\n'][Math.floor(draw() * 5)] ?? ' '
    const comma = () => (draw() < 0.3 ? ',' : '')
    if (typeof value === 'string') {
      const style = Math.floor(draw() * 3)
      if (style === 0) return JSON.stringify(value)
      if (style === 1) {
        return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\n', '\\n')}'`
      }
      return `\`${value.replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('$', '\\$')}\``
    }
    if (typeof value === 'number') {
      const text = draw() < 0.3 ? value.toExponential() : String(value)
      return value < 0 ? `-${gap()}${text.slice(1)}` : text
    }
    if (typeof value === 'bigint') return `${value}n`
    if (value === null) return 'null'
    if (value === undefined) return 'undefined'
    if (typeof value === 'boolean') return String(value)
    if (value instanceof Date) {
      return draw() < 0.5
        ? `new Date(${JSON.stringify(value.toISOString())})`
        : `new Date(${value.getTime()})`
    }
    if (Array.isArray(value)) {
      return `[${gap()}${value.map((item) => printOf(draw, item)).join(`,${gap()}`)}${value.length > 0 ? comma() : ''}${gap()}]`
    }
    const entries = Object.entries(value).map(([key, item]) => {
      const name = /^[A-Za-z_$][\w$]*$/u.test(key) && draw() < 0.7 ? key : JSON.stringify(key)
      return `${name}${gap()}:${gap()}${printOf(draw, item)}`
    })
    return `{${gap()}${entries.join(`,${gap()}`)}${entries.length > 0 ? comma() : ''}${gap()}}`
  }

  it.each(Array.from({ length: 300 }, (_, seed) => seed))(
    'reads back the tree of seed %i',
    (seed) => {
      const draw = random(seed)
      const where = valueOf(draw, 1)
      const args = { where, take: 1 }
      const text = `await prisma.user.findMany(${printOf(draw, args)});`
      const { calls, diagnostics } = makeClientQuery({ text, models: MODELS })
      expect(diagnostics).toStrictEqual([])
      expect(calls.map((call) => call.args)).toStrictEqual([args])
    },
  )

  it.each(Array.from({ length: 40 }, (_, seed) => seed))(
    'answers every prefix of the text of seed %i with calls or diagnostics, never an exception',
    (seed) => {
      const draw = random(seed + 1000)
      const text = `prisma.user.findMany(${printOf(draw, { where: valueOf(draw, 1) })})`
      for (let end = 0; end <= text.length; end += Math.max(1, Math.floor(text.length / 25))) {
        const result = makeClientQuery({ text: text.slice(0, end), models: MODELS })
        expect(result.calls.length + result.diagnostics.length).toBeGreaterThan(0)
        for (const diagnostic of result.diagnostics) {
          expect(diagnostic.range.start).toBeGreaterThanOrEqual(0)
          expect(diagnostic.range.end).toBeLessThanOrEqual(end)
          expect(diagnostic.range.start).toBeLessThanOrEqual(diagnostic.range.end)
        }
      }
    },
  )
})

describe('makeClientResult on values Prisma Client does not return', () => {
  it('writes an invalid date, a function, a symbol and an object without a JSON form as null', () => {
    class Opaque {
      readonly secret = 1
    }
    class Nested {
      toJSON() {
        return { nested: true }
      }
    }
    expect(
      makeClientResult({
        value: {
          invalid: new Date(Number.NaN),
          fn: () => 1,
          symbol: Symbol('s'),
          opaque: new Opaque(),
          nested: new Nested(),
          infinite: Number.POSITIVE_INFINITY,
        },
        limit: 10,
      }).result,
    ).toStrictEqual({
      invalid: null,
      fn: null,
      symbol: null,
      opaque: null,
      nested: null,
      infinite: null,
    })
  })
})
