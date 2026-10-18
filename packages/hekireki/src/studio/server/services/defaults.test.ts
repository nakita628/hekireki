import { Effect } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import { generateDefaults } from './defaults.js'

describe('generateDefaults', () => {
  it('makes an id of each kind, the time for now, and the literal as it is', async () => {
    const before = Date.now()
    const values = await Effect.runPromise(
      generateDefaults({
        fields: [
          { name: 'id', generator: { kind: 'uuid', version: 7 } },
          { name: 'legacy', generator: { kind: 'uuid', version: 4 } },
          { name: 'token', generator: { kind: 'cuid', version: 1 } },
          { name: 'handle', generator: { kind: 'cuid', version: 2 } },
          { name: 'slug', generator: { kind: 'nanoid', length: 10 } },
          { name: 'code', generator: { kind: 'nanoid', length: null } },
          { name: 'order', generator: { kind: 'ulid' } },
          { name: 'createdAt', generator: { kind: 'now' } },
          { name: 'tags', generator: { kind: 'literal', value: '[]' } },
        ],
      }),
    )
    expect(Object.keys(values)).toStrictEqual([
      'id',
      'legacy',
      'token',
      'handle',
      'slug',
      'code',
      'order',
      'createdAt',
      'tags',
    ])
    expect(values.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    )
    expect(values.legacy).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    )
    expect(values.token).toMatch(/^c[0-9a-z]{24}$/u)
    expect(values.handle).toMatch(/^[a-z][0-9a-z]{23}$/u)
    expect(values.slug).toHaveLength(10)
    expect(values.code).toHaveLength(21)
    expect(values.order).toMatch(/^[0-9A-Z]{26}$/u)
    const at = new Date(values.createdAt ?? '').getTime()
    expect(at).toBeGreaterThanOrEqual(before)
    expect(at).toBeLessThanOrEqual(Date.now())
    expect(values.tags).toBe('[]')
  })

  it('makes nothing for no fields', async () => {
    expect(await Effect.runPromise(generateDefaults({ fields: [] }))).toStrictEqual({})
  })
})
