import { describe, expect, it } from 'vite-plus/test'

import { makeRow, makeCell, makeDbValue } from './values.js'

describe('makeCell', () => {
  it('passes JSON scalars through and converts the rest to strings', () => {
    expect(makeCell({ value: null })).toBeNull()
    expect(makeCell({ value: undefined })).toBeNull()
    expect(makeCell({ value: 'a' })).toBe('a')
    expect(makeCell({ value: 1.5 })).toBe(1.5)
    expect(makeCell({ value: true })).toBe(true)
    expect(makeCell({ value: 10n })).toBe('10')
    expect(makeCell({ value: new Date('2026-09-02T00:00:00.000Z') })).toBe(
      '2026-09-02T00:00:00.000Z',
    )
    expect(makeCell({ value: new Date('nope') })).toBeNull()
    expect(makeCell({ value: Buffer.from('hi') })).toBe('aGk=')
    expect(makeCell({ value: { a: [1] } })).toBe('{"a":[1]}')
  })
})

describe('makeDbValue', () => {
  const scalar = (type: string) => ({ type, kind: 'scalar', isList: false }) as const
  const db = (
    dialect: 'postgresql' | 'mysql' | 'sqlite',
    field: { readonly type: string; readonly kind: string; readonly isList: boolean },
    value: string | number | boolean | null,
  ) => makeDbValue({ dialect, field, value })

  it('converts numbers, booleans and dates per dialect', () => {
    expect(db('sqlite', scalar('Int'), '42')).toBe(42)
    expect(db('sqlite', scalar('Int'), 'abc')).toBe('abc')
    expect(db('postgresql', scalar('Boolean'), 'true')).toBe(true)
    expect(db('sqlite', scalar('Boolean'), true)).toBe(1)
    expect(db('sqlite', scalar('Boolean'), '0')).toBe(0)
    expect(db('sqlite', scalar('DateTime'), '2026-01-01T00:00:00.000Z')).toBe(
      '2026-01-01T00:00:00.000Z',
    )
    expect(db('postgresql', scalar('DateTime'), '2026-01-01T00:00:00.000Z')).toStrictEqual(
      new Date('2026-01-01T00:00:00.000Z'),
    )
    expect(db('mysql', scalar('BigInt'), 9)).toBe('9')
    expect(db('mysql', scalar('Decimal'), '1.50')).toBe('1.50')
    expect(db('sqlite', scalar('String'), 'x')).toBe('x')
    expect(db('sqlite', scalar('String'), null)).toBeNull()
  })

  it('decodes bytes from base64 and keeps json as text', () => {
    expect(db('sqlite', scalar('Bytes'), 'aGk=')).toStrictEqual(Buffer.from('hi'))
    expect(db('postgresql', scalar('Json'), '{"a":1}')).toBe('{"a":1}')
  })

  it('parses list values for postgresql arrays and keeps text elsewhere', () => {
    const list = { type: 'String', kind: 'scalar', isList: true } as const
    expect(db('postgresql', list, '["a","b"]')).toStrictEqual(['a', 'b'])
    expect(db('postgresql', list, 'not json')).toBe('not json')
    expect(db('sqlite', list, '["a"]')).toBe('["a"]')
  })

  it('keeps enum values as strings', () => {
    expect(db('mysql', { type: 'Role', kind: 'enum', isList: false }, 'ADMIN')).toBe('ADMIN')
  })
})

describe('makeRow', () => {
  it('renames columns back to field names and serializes values', () => {
    expect(
      makeRow({
        row: { user_id: 1n, created_at: new Date(0), extra: null },
        columnToField: new Map([
          ['user_id', 'userId'],
          ['created_at', 'createdAt'],
        ]),
      }),
    ).toStrictEqual({ userId: '1', createdAt: '1970-01-01T00:00:00.000Z', extra: null })
  })
})
