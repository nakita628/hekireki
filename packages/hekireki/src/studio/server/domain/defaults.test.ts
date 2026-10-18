import { describe, expect, it } from 'vite-plus/test'

import { makeGeneratedFields } from './defaults.js'

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

describe('makeGeneratedFields', () => {
  it('names the client-side defaults of omitted fields only', () => {
    const model = {
      fields: [
        field('id', { default: 'uuid(7)' }),
        field('legacy', { default: 'uuid()' }),
        field('token', { default: 'cuid()' }),
        field('handle', { default: 'cuid(2)' }),
        field('slug', { default: 'nanoid(10)' }),
        field('code', { default: 'nanoid()' }),
        field('order', { default: 'ulid()' }),
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
    expect(makeGeneratedFields({ model, row: { given: 'keep' } })).toStrictEqual([
      { name: 'id', generator: { kind: 'uuid', version: 7 } },
      { name: 'legacy', generator: { kind: 'uuid', version: 4 } },
      { name: 'token', generator: { kind: 'cuid', version: 1 } },
      { name: 'handle', generator: { kind: 'cuid', version: 2 } },
      { name: 'slug', generator: { kind: 'nanoid', length: 10 } },
      { name: 'code', generator: { kind: 'nanoid', length: null } },
      { name: 'order', generator: { kind: 'ulid' } },
      { name: 'createdAt', generator: { kind: 'now' } },
      { name: 'updatedAt', generator: { kind: 'now' } },
      { name: 'tags', generator: { kind: 'literal', value: '[]' } },
    ])
  })

  it('leaves the database to its own defaults', () => {
    const model = {
      fields: [
        field('id', { default: 'autoincrement()' }),
        field('at', { default: 'dbgenerated("now()")' }),
      ],
    }
    expect(makeGeneratedFields({ model, row: {} })).toStrictEqual([])
  })
})
