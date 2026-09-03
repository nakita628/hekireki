import { describe, expect, it } from 'vite-plus/test'

import {
  makeCuid,
  makeCuid2,
  makeGeneratedDefaults,
  makeNanoid,
  makeUlid,
  makeUuidV7,
} from './defaults.js'

function field(
  name: string,
  overrides: Partial<{
    kind: 'scalar' | 'object' | 'enum' | 'unsupported'
    isList: boolean
    isRequired: boolean
    isUpdatedAt: boolean
    default: string | null
  }> = {},
) {
  return {
    name,
    kind: 'scalar' as const,
    isList: false,
    isRequired: true,
    isUpdatedAt: false,
    default: null,
    ...overrides,
  }
}

const NOW = Date.UTC(2026, 8, 3, 12, 0, 0)

describe('generators', () => {
  it('shape the ids the way Prisma does', () => {
    expect(makeUuidV7(NOW)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    )
    expect(makeUuidV7(NOW).slice(0, 12)).toBe(makeUuidV7(NOW).slice(0, 12))
    expect(makeCuid(NOW)).toMatch(/^c[0-9a-z]{24}$/u)
    expect(makeCuid2()).toMatch(/^[a-z][0-9a-z]{23}$/u)
    expect(makeNanoid()).toMatch(/^[A-Za-z0-9_-]{21}$/u)
    expect(makeNanoid(8)).toHaveLength(8)
    expect(makeUlid(NOW)).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/u)
    expect(makeUlid(NOW).slice(0, 10)).toBe(makeUlid(NOW).slice(0, 10))
  })
})

describe('makeGeneratedDefaults', () => {
  it('fills the client-side defaults of omitted fields only', () => {
    const model = {
      fields: [
        field('id', { default: 'uuid(7)' }),
        field('token', { default: 'cuid()' }),
        field('slug', { default: 'nanoid(10)' }),
        field('createdAt', { default: 'now()' }),
        field('updatedAt', { isUpdatedAt: true }),
        field('serial', { default: 'autoincrement()' }),
        field('name', { default: '"anonymous"' }),
        field('tags', { isList: true }),
        field('extra', { isList: true, isRequired: false }),
        field('given', { default: 'uuid()' }),
        field('author', { kind: 'object' }),
      ],
    }
    const values = makeGeneratedDefaults({ model, row: { given: 'keep' }, now: NOW })
    expect(new Set(Object.keys(values))).toStrictEqual(
      new Set(['createdAt', 'id', 'slug', 'tags', 'token', 'updatedAt']),
    )
    expect(values.id).toMatch(/^[0-9a-f-]{36}$/u)
    expect(values.token).toMatch(/^c[0-9a-z]{24}$/u)
    expect(values.slug).toHaveLength(10)
    expect(values.createdAt).toBe('2026-09-03T12:00:00.000Z')
    expect(values.updatedAt).toBe('2026-09-03T12:00:00.000Z')
    expect(values.tags).toBe('[]')
  })

  it('leaves the database to its own defaults', () => {
    const model = {
      fields: [
        field('id', { default: 'autoincrement()' }),
        field('at', { default: 'dbgenerated("now()")' }),
      ],
    }
    expect(makeGeneratedDefaults({ model, row: {} })).toStrictEqual({})
  })
})
