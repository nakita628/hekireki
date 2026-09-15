import { describe, expect, it } from 'vite-plus/test'

import { makeClientResult, makeSqlParams } from './client-result.js'

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
