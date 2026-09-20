import { describe, expect, it } from 'vite-plus/test'

import { defineConfig, defineData, defineSchema } from './config.js'
import type { Row } from './config.js'
import { resolveSeedConfig } from './options.js'

const schema = defineSchema({
  models: [
    {
      name: 'User',
      fields: [
        {
          name: 'id',
          kind: 'scalar',
          type: 'Int',
          isList: false,
          isRequired: true,
          hasDefault: true,
        },
        {
          name: 'email',
          kind: 'scalar',
          type: 'String',
          isList: false,
          isRequired: true,
          hasDefault: false,
        },
        {
          name: 'age',
          kind: 'scalar',
          type: 'Int',
          isList: false,
          isRequired: false,
          hasDefault: false,
        },
        {
          name: 'role',
          kind: 'enum',
          type: 'Role',
          isList: false,
          isRequired: true,
          hasDefault: true,
        },
        {
          name: 'joined',
          kind: 'scalar',
          type: 'DateTime',
          isList: false,
          isRequired: true,
          hasDefault: false,
        },
        {
          name: 'tags',
          kind: 'scalar',
          type: 'String',
          isList: true,
          isRequired: true,
          hasDefault: false,
        },
        {
          name: 'posts',
          kind: 'object',
          type: 'Post',
          isList: true,
          isRequired: true,
          hasDefault: false,
          relationName: 'PostToUser',
        },
        {
          name: 'groups',
          kind: 'object',
          type: 'Group',
          isList: true,
          isRequired: true,
          hasDefault: false,
          relationName: 'GroupToUser',
        },
      ],
      uniques: [['id'], ['email']],
    },
    {
      name: 'Post',
      fields: [
        {
          name: 'id',
          kind: 'scalar',
          type: 'Int',
          isList: false,
          isRequired: true,
          hasDefault: true,
        },
        {
          name: 'authorId',
          kind: 'scalar',
          type: 'Int',
          isList: false,
          isRequired: true,
          hasDefault: false,
        },
        {
          name: 'author',
          kind: 'object',
          type: 'User',
          isList: false,
          isRequired: true,
          hasDefault: false,
          relationName: 'PostToUser',
          relationFromFields: ['authorId'],
        },
      ],
      uniques: [['id']],
    },
    {
      name: 'Group',
      fields: [
        {
          name: 'id',
          kind: 'scalar',
          type: 'Int',
          isList: false,
          isRequired: true,
          hasDefault: true,
        },
        {
          name: 'users',
          kind: 'object',
          type: 'User',
          isList: true,
          isRequired: true,
          hasDefault: false,
          relationName: 'GroupToUser',
        },
      ],
      uniques: [['id']],
    },
  ],
  enums: [{ name: 'Role', values: ['ADMIN', 'VIEWER'] }],
})

describe('defineConfig', () => {
  it('returns a loose config as it is', () => {
    const config = { seed: 3, models: { User: { count: 2 } } }
    expect(defineConfig(config)).toBe(config)
  })

  it('returns a typed config as plain options, the schema module being a type-level witness', () => {
    expect(defineConfig(schema, { seed: 1, schema: 'other.prisma' })).toStrictEqual({
      seed: 1,
      schema: 'other.prisma',
    })
  })

  it('accepts rules that fit the schema: enum members, bounds per type, the row so far', () => {
    const config = defineConfig(schema, {
      models: {
        User: {
          count: 5,
          fields: {
            email: (faker, { row }) => `${String(row.id ?? 0)}-${faker.internet.email()}`,
            age: { min: 18, max: 65, nullRate: 0.2 },
            role: { values: ['ADMIN'] },
            joined: { from: '2024-01-01', to: new Date('2024-12-31') },
            tags: { min: 1, max: 3 },
          },
          relations: { groups: { min: 1, max: 2 }, posts: { min: 1, max: 5 } },
        },
        Post: { fields: { authorId: { value: 1 } } },
      },
    })
    expect(config.models?.User?.count).toBe(5)
  })

  it('accepts nested rows, unique-key parents and keyed links, with no id written', () => {
    const config = defineConfig(schema, {
      models: {
        User: {
          data: [
            {
              email: 'ann@example.com',
              joined: '2025-01-01',
              posts: [{}, {}], // authorId is filled by the nesting, id by autoincrement
              groups: [{ id: 1 }, 2],
            },
          ],
        },
        Post: { data: [{ author: { email: 'bob@example.com' } }, { author: { id: 1 } }] },
      },
    })
    expect(config.models?.User?.data?.length).toBe(1)
    defineConfig(schema, {
      models: {
        // @ts-expect-error -- a key must be one of the model's unique keys, not any field
        Post: { data: [{ author: { age: 3 } }] },
      },
    })
    defineConfig(schema, {
      models: {
        User: {
          // @ts-expect-error -- a nested row still needs its own required fields
          data: [{ email: 'a@example.com', joined: '2025-01-01', posts: [{ authorId: 'x' }] }],
        },
      },
    })
  })

  it('accepts real data that fits the fields: required ones present, defaults left out', () => {
    const config = defineConfig(schema, {
      models: {
        User: {
          data: [
            { id: 1, email: 'ann@example.com', role: 'ADMIN', joined: '2025-01-01', tags: ['a'] },
            { email: 'bob@example.com', joined: new Date('2025-01-02'), age: null },
          ],
        },
        Post: { count: 3 },
      },
    })
    expect(config.models?.User?.data?.length).toBe(2)
  })

  it('rejects what the schema does not have, at compile time', () => {
    defineConfig(schema, {
      models: {
        // @ts-expect-error -- no such model
        Ghost: { count: 1 },
      },
    })
    defineConfig(schema, {
      models: {
        User: {
          fields: {
            // @ts-expect-error -- no such field
            nope: { min: 1 },
          },
        },
      },
    })
    defineConfig(schema, {
      models: {
        User: {
          fields: {
            // @ts-expect-error -- not a member of Role
            role: { values: ['ROOT'] },
          },
        },
      },
    })
    defineConfig(schema, {
      models: {
        User: {
          fields: {
            // @ts-expect-error -- a required field is never null
            email: { nullRate: 0.5 },
          },
        },
      },
    })
    defineConfig(schema, {
      models: {
        User: {
          fields: {
            // @ts-expect-error -- dates do not take numeric bounds
            joined: { min: 1 },
          },
        },
      },
    })
    defineConfig(schema, {
      models: {
        User: {
          // @ts-expect-error -- email is a column, not a relation a rule can bound
          relations: { email: { max: 1 } },
        },
      },
    })
    defineConfig(schema, {
      models: {
        Post: {
          // @ts-expect-error -- author owns the key; the bound goes on User.posts
          relations: { author: { max: 1 } },
        },
      },
    })
    defineConfig(schema, {
      models: {
        User: {
          fields: {
            // @ts-expect-error -- a generator must return the field's type
            age: () => 'old',
          },
        },
      },
    })
    defineConfig(schema, {
      models: {
        User: {
          // @ts-expect-error -- a row may only carry the model's fields
          data: [{ email: 'a@example.com', joined: '2025-01-01', nope: 'x' }],
        },
      },
    })
    defineConfig(schema, {
      models: {
        User: {
          // @ts-expect-error -- a row value must have the field's type
          data: [{ id: 'one', email: 'a@example.com', joined: '2025-01-01' }],
        },
      },
    })
    defineConfig(schema, {
      models: {
        User: {
          // @ts-expect-error -- a required field is never null in a row
          data: [{ email: null, joined: '2025-01-01' }],
        },
      },
    })
    defineConfig(schema, {
      models: {
        User: {
          // @ts-expect-error -- a required field without a default must be given
          data: [{ email: 'ann@example.com' }],
        },
      },
    })
    defineConfig(schema, {
      models: {
        User: {
          data: [{ email: 'ann@example.com', joined: '2025-01-01' }],
          // @ts-expect-error -- real rows or faker rows, not both
          count: 3,
        },
      },
    })
    expect(true).toBe(true)
  })
})

describe('defineData and Row', () => {
  it('type rows kept in their own variables the way defineConfig would', () => {
    const cy: Row<typeof schema, 'User'> = { email: 'cy@example.com', joined: '2025-03-02' }
    const posts: readonly Row<typeof schema, 'Post', 'authorId'>[] = [{}, {}]
    const users = defineData(schema, 'User', [
      { email: 'ann@example.com', joined: '2025-01-01', posts, groups: [{ id: 1 }] },
      cy,
    ])
    expect(users.length).toBe(2)
    expect(defineConfig(schema, { models: { User: { data: users } } }).models?.User?.data).toBe(
      users,
    )
    defineData(schema, 'User', [
      // @ts-expect-error -- joined is required and has no default
      { email: 'ann@example.com' },
    ])
    defineData(schema, 'Post', [
      // @ts-expect-error -- authorId is filled only when the row is nested under a User
      { author: { nope: 1 } },
    ])
    // @ts-expect-error -- no such model
    defineData(schema, 'Ghost', [])
    const loose: Row<typeof schema, 'Post'> = {}
    expect(loose).toStrictEqual({})
  })
})

describe('resolveSeedConfig', () => {
  it('leaves every omitted option unset: no value of its own', () => {
    expect(resolveSeedConfig({})).toStrictEqual({
      schema: null,
      seed: null,
      locale: null,
      count: null,
      nullRate: null,
      dates: null,
      output: null,
      url: null,
      reset: false,
      client: null,
      models: {},
    })
  })

  it('completes a date window with one edge to a year', () => {
    const resolved = resolveSeedConfig({ dates: { from: '2024-06-01T00:00:00.000Z' } })
    expect(resolved.dates?.from).toStrictEqual(new Date('2024-06-01T00:00:00.000Z'))
    expect(resolved.dates?.to).toBeInstanceOf(Date)
    const until = resolveSeedConfig({ dates: { to: '2025-01-01T00:00:00.000Z' } })
    expect(until.dates?.to).toStrictEqual(new Date('2025-01-01T00:00:00.000Z'))
    expect((until.dates?.to.getTime() ?? 0) - (until.dates?.from.getTime() ?? 0)).toBe(
      365 * 24 * 60 * 60 * 1000,
    )
  })

  it('keeps what is given, turning one locale into a list and date strings into dates', () => {
    expect(
      resolveSeedConfig({
        schema: 'db/schema.prisma',
        seed: 9,
        locale: 'ja',
        count: 3,
        nullRate: 0.5,
        dates: { from: '2020-01-01', to: new Date('2020-12-31T00:00:00.000Z') },
        output: 'seed.sql',
        url: 'file:./dev.db',
        reset: true,
        models: { User: { count: 1 } },
      }),
    ).toStrictEqual({
      schema: 'db/schema.prisma',
      seed: 9,
      locale: ['ja'],
      count: 3,
      nullRate: 0.5,
      dates: {
        from: new Date('2020-01-01T00:00:00.000Z'),
        to: new Date('2020-12-31T00:00:00.000Z'),
      },
      output: 'seed.sql',
      url: 'file:./dev.db',
      reset: true,
      client: null,
      models: { User: { count: 1 } },
    })
    expect(resolveSeedConfig({ locale: ['ja', 'en'] }).locale).toStrictEqual(['ja', 'en'])
  })
})
