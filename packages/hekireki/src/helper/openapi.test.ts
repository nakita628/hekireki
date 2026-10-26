import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import {
  makeOpenApiColumn,
  makeOpenApiInput,
  makeOpenApiJoinTables,
  makeOpenApiPaths,
  makeOpenApiTable,
} from './openapi.js'

function makeModel(overrides: Partial<DMMF.Model> & { name: string }): DMMF.Model {
  return {
    dbName: null,
    fields: [],
    uniqueFields: [],
    uniqueIndexes: [],
    primaryKey: null,
    isGenerated: false,
    schema: null,
    ...overrides,
  }
}

function makeField(overrides: Partial<DMMF.Field> & { name: string; type: string }): DMMF.Field {
  return {
    kind: 'scalar',
    isList: false,
    isRequired: true,
    isUnique: false,
    isId: false,
    isReadOnly: false,
    isGenerated: false,
    isUpdatedAt: false,
    hasDefaultValue: false,
    ...overrides,
  }
}

const ROLE: DMMF.DatamodelEnum = {
  name: 'Role',
  dbName: null,
  values: [
    { name: 'ADMIN', dbName: null },
    { name: 'LINK_ONLY', dbName: 'link_only' },
  ],
}

describe('makeOpenApiColumn', () => {
  it.each([
    ['Int', { type: 'integer' }],
    ['BigInt', { type: 'integer' }],
    ['Boolean', { type: 'boolean' }],
    ['DateTime', { type: 'string', format: 'date-time' }],
    ['String', { type: 'string' }],
    ['Float', { type: 'string' }],
    ['Decimal', { type: 'string' }],
    ['Json', { type: 'string' }],
    ['Bytes', { type: 'string' }],
  ])('reads a %s as Atlas reads the column, %j', (type, expected) => {
    expect(makeOpenApiColumn(makeField({ name: 'value', type }), [])).toStrictEqual(expected)
  })

  it('reads an enum as a string over the values the database stores', () => {
    expect(
      makeOpenApiColumn(makeField({ name: 'role', type: 'Role', kind: 'enum' }), [ROLE]),
    ).toStrictEqual({ type: 'string', enum: ['ADMIN', 'link_only'] })
  })

  it.each([
    ['String', { type: ['string', 'null'] }],
    ['Int', { type: ['integer', 'null'] }],
    ['DateTime', { type: ['string', 'null'], format: 'date-time' }],
  ])('lets an optional %s be null', (type, expected) => {
    expect(
      makeOpenApiColumn(makeField({ name: 'value', type, isRequired: false }), []),
    ).toStrictEqual(expected)
  })

  it('makes a list a nullable array, as Prisma Migrate makes the column', () => {
    expect(
      makeOpenApiColumn(makeField({ name: 'tags', type: 'String', isList: true }), []),
    ).toStrictEqual({ type: ['array', 'null'], items: { type: 'string' } })
  })

  it.each([
    ['String', 'pending', 'pending'],
    ['Int', 0, 0],
    ['Boolean', false, false],
    ['Decimal', 0, 0],
    ['BigInt', String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER],
  ])('shows a literal %s default %j as %j', (type, dflt, expected) => {
    expect(
      makeOpenApiColumn(makeField({ name: 'v', type, hasDefaultValue: true, default: dflt }), []),
    ).toHaveProperty('default', expected)
  })

  it('shows an enum default by the value the database stores', () => {
    expect(
      makeOpenApiColumn(
        makeField({
          name: 'role',
          type: 'Role',
          kind: 'enum',
          hasDefaultValue: true,
          default: 'LINK_ONLY',
        }),
        [ROLE],
      ),
    ).toHaveProperty('default', 'link_only')
  })

  it.each([
    ['autoincrement()', 'Int', { name: 'autoincrement', args: [] }],
    ['now()', 'DateTime', { name: 'now', args: [] }],
    ['uuid()', 'String', { name: 'uuid', args: [7] }],
    ['dbgenerated()', 'String', { name: 'dbgenerated', args: ['gen_random_uuid()'] }],
    ['a list', 'String', ['a', 'b']],
    ['a Json literal', 'Json', '{}'],
    ['Bytes', 'Bytes', 'AA=='],
    ['a BigInt JSON would round', 'BigInt', '9007199254740993'],
  ])('shows no default for %s, which the schema has no value for', (_what, type, dflt) => {
    const field = makeField({
      name: 'v',
      type,
      hasDefaultValue: true,
      default: dflt,
      isList: Array.isArray(dflt),
    })
    expect(makeOpenApiColumn(field, [])).not.toHaveProperty('default')
  })

  it('puts the type first, then the default, then the description', () => {
    expect(
      Object.keys(
        makeOpenApiColumn(
          makeField({
            name: 'status',
            type: 'String',
            hasDefaultValue: true,
            default: 'pending',
            documentation: 'Order status',
          }),
          [],
        ),
      ),
    ).toStrictEqual(['type', 'default', 'description'])
  })

  it('describes the column with the prose of its comment, not the validation lines', () => {
    expect(
      makeOpenApiColumn(
        makeField({
          name: 'email',
          type: 'String',
          documentation: 'Unique login email\n@z.email()\n@v.pipe(v.string(), v.email())',
        }),
        [],
      ),
    ).toStrictEqual({ type: 'string', description: 'Unique login email' })
  })

  it('describes nothing when the comment is validation lines only', () => {
    expect(
      makeOpenApiColumn(
        makeField({ name: 'email', type: 'String', documentation: '@z.email()' }),
        [],
      ),
    ).toStrictEqual({ type: 'string' })
  })
})

describe('makeOpenApiTable', () => {
  const user = makeModel({
    name: 'User',
    dbName: 'users',
    documentation: "Application user.\n@p.ConfigDict(extra='forbid')",
    fields: [
      makeField({ name: 'id', type: 'Int', isId: true }),
      makeField({ name: 'name', type: 'String', isRequired: false }),
      makeField({ name: 'createdAt', type: 'DateTime', dbName: 'created_at' }),
      makeField({ name: 'posts', type: 'Post', kind: 'object', isList: true, isRequired: false }),
    ],
  })
  const post = makeModel({
    name: 'Post',
    dbName: 'posts',
    fields: [
      makeField({ name: 'id', type: 'Int', isId: true }),
      makeField({ name: 'authorId', type: 'Int', dbName: 'author_id' }),
      makeField({
        name: 'author',
        type: 'User',
        kind: 'object',
        relationFromFields: ['authorId'],
        relationToFields: ['id'],
      }),
      makeField({ name: 'parentId', type: 'Int', dbName: 'parent_id', isRequired: false }),
      makeField({
        name: 'parent',
        type: 'Post',
        kind: 'object',
        isRequired: false,
        relationFromFields: ['parentId'],
        relationToFields: ['id'],
      }),
    ],
  })

  it('lists the columns by their database names, the NOT NULL ones in required', () => {
    expect(makeOpenApiTable(user, [user, post], [])).toStrictEqual({
      type: 'object',
      properties: {
        id: { type: 'integer' },
        name: { type: ['string', 'null'] },
        created_at: { type: 'string', format: 'date-time' },
      },
      required: ['id', 'created_at'],
      description: 'Application user.\n',
    })
  })

  it('describes each foreign key on a line of its own after the prose', () => {
    expect(makeOpenApiTable(post, [user, post], [])).toHaveProperty(
      'description',
      'FK posts_author_id_fkey: (author_id) -> users\nFK posts_parent_id_fkey: (parent_id) -> posts\n',
    )
  })

  it('names a composite foreign key by every column', () => {
    const item = makeModel({
      name: 'Item',
      fields: [
        makeField({ name: 'a', type: 'Int' }),
        makeField({ name: 'b', type: 'Int' }),
        makeField({
          name: 'pair',
          type: 'Pair',
          kind: 'object',
          relationFromFields: ['a', 'b'],
          relationToFields: ['x', 'y'],
        }),
      ],
    })
    const pair = makeModel({ name: 'Pair' })
    expect(makeOpenApiTable(item, [item, pair], [])).toHaveProperty(
      'description',
      'FK Item_a_b_fkey: (a, b) -> Pair\n',
    )
  })

  it('writes neither required nor description when there is nothing for them', () => {
    const note = makeModel({
      name: 'Note',
      fields: [makeField({ name: 'body', type: 'String', isRequired: false })],
    })
    expect(makeOpenApiTable(note, [note], [])).toStrictEqual({
      type: 'object',
      properties: { body: { type: ['string', 'null'] } },
    })
  })
})

describe('makeOpenApiJoinTables', () => {
  it('writes the join table of an implicit many-to-many with A and B of the key types', () => {
    const post = makeModel({
      name: 'Post',
      dbName: 'posts',
      fields: [
        makeField({ name: 'id', type: 'String', isId: true }),
        makeField({
          name: 'tags',
          type: 'Tag',
          kind: 'object',
          isList: true,
          isRequired: false,
          relationName: 'PostToTag',
        }),
      ],
    })
    const tag = makeModel({
      name: 'Tag',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'posts',
          type: 'Post',
          kind: 'object',
          isList: true,
          isRequired: false,
          relationName: 'PostToTag',
        }),
      ],
    })
    expect(makeOpenApiJoinTables([post, tag], [])).toStrictEqual([
      [
        '_PostToTag',
        {
          type: 'object',
          properties: { A: { type: 'string' }, B: { type: 'integer' } },
          required: ['A', 'B'],
          description: 'FK _PostToTag_A_fkey: (A) -> posts\nFK _PostToTag_B_fkey: (B) -> Tag\n',
        },
      ],
    ])
  })

  it('writes nothing for a schema without one', () => {
    expect(makeOpenApiJoinTables([makeModel({ name: 'User' })], [])).toStrictEqual([])
  })
})

describe('makeOpenApiInput', () => {
  const post = makeModel({
    name: 'Post',
    dbName: 'posts',
    fields: [
      makeField({
        name: 'id',
        type: 'Int',
        isId: true,
        hasDefaultValue: true,
        default: { name: 'autoincrement', args: [] },
      }),
      makeField({ name: 'title', type: 'String', documentation: 'Article title\n@z.string()' }),
      makeField({ name: 'content', type: 'String', isRequired: false }),
      makeField({ name: 'published', type: 'Boolean', hasDefaultValue: true, default: false }),
      makeField({ name: 'tags', type: 'String', isList: true }),
      makeField({ name: 'authorId', type: 'Int', dbName: 'author_id' }),
      makeField({ name: 'updatedAt', type: 'DateTime', dbName: 'updated_at', isUpdatedAt: true }),
      makeField({ name: 'author', type: 'User', kind: 'object', relationFromFields: ['authorId'] }),
    ],
  })

  it('requires of a create the NOT NULL columns without a default, @updatedAt aside', () => {
    expect(makeOpenApiInput(post, [], 'create')).toStrictEqual({
      type: 'object',
      properties: {
        id: { type: 'integer' },
        title: { type: 'string', description: 'Article title' },
        content: { type: ['string', 'null'] },
        published: { type: 'boolean', default: false },
        tags: { type: ['array', 'null'], items: { type: 'string' } },
        author_id: { type: 'integer' },
        updated_at: { type: 'string', format: 'date-time' },
      },
      required: ['title', 'author_id'],
    })
  })

  it('requires nothing of an update', () => {
    const input = makeOpenApiInput(post, [], 'update')
    expect(input).not.toHaveProperty('required')
    expect(input.properties).toStrictEqual(makeOpenApiInput(post, [], 'create').properties)
  })
})

describe('makeOpenApiPaths', () => {
  const item = makeModel({
    name: 'OrderItem',
    dbName: 'order_items',
    fields: [
      makeField({ name: 'id', type: 'Int', isId: true }),
      makeField({ name: 'sku', type: 'String' }),
    ],
  })

  it('writes the collection and the row under the resource, named for the model', () => {
    const paths = makeOpenApiPaths(item, [], 'order-items')
    expect(paths.map(([path]) => path)).toStrictEqual(['/order-items', '/order-items/{id}'])
    const [, collection = {}] = paths[0] ?? []
    const [, row = {}] = paths[1] ?? []
    expect(Object.keys(collection)).toStrictEqual(['get', 'post'])
    expect(Object.keys(row)).toStrictEqual(['parameters', 'get', 'patch', 'delete'])
    expect(row.parameters).toStrictEqual([
      { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
    ])
    expect(collection.get).toMatchObject({
      tags: ['OrderItem'],
      summary: 'List order items',
      operationId: 'listOrderItems',
      responses: { '200': { description: 'The order items.' } },
    })
    expect(collection.post).toStrictEqual({
      tags: ['OrderItem'],
      summary: 'Create an order item',
      operationId: 'createOrderItem',
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/order_items_create' } },
        },
      },
      responses: {
        '201': {
          description: 'The order item made.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/order_items' } },
          },
        },
      },
    })
    expect(row.get).toMatchObject({ summary: 'Get an order item', operationId: 'getOrderItem' })
    expect(row.patch).toMatchObject({
      summary: 'Update an order item',
      operationId: 'updateOrderItem',
    })
    expect(row.patch).toHaveProperty(
      ['requestBody', 'content', 'application/json', 'schema', '$ref'],
      '#/components/schemas/order_items_update',
    )
    expect(row.delete).toMatchObject({
      summary: 'Delete an order item',
      operationId: 'deleteOrderItem',
      responses: {
        '204': { description: 'The order item is deleted.' },
        '404': { description: 'No order item has this key.' },
      },
    })
  })

  it('says "a" before a consonant', () => {
    const tag = makeModel({
      name: 'Tag',
      fields: [makeField({ name: 'id', type: 'Int', isId: true })],
    })
    const [, collection = {}] = makeOpenApiPaths(tag, [], 'tags')[0] ?? []
    expect(collection.post).toMatchObject({ summary: 'Create a tag', operationId: 'createTag' })
  })

  it('addresses a row of a composite primary key by one parameter per field, in its order', () => {
    const follow = makeModel({
      name: 'Follow',
      dbName: 'follows',
      primaryKey: { name: null, fields: ['followerId', 'followingId'] },
      fields: [
        makeField({ name: 'followerId', type: 'String', dbName: 'follower_id' }),
        makeField({ name: 'followingId', type: 'String', dbName: 'following_id' }),
      ],
    })
    const paths = makeOpenApiPaths(follow, [], 'follows')
    expect(paths.map(([path]) => path)).toStrictEqual([
      '/follows',
      '/follows/{followerId}/{followingId}',
    ])
    expect(paths[1]?.[1].parameters).toStrictEqual([
      { name: 'followerId', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'followingId', in: 'path', required: true, schema: { type: 'string' } },
    ])
  })

  it('falls back to the first @@unique of a model without a primary key', () => {
    const setting = makeModel({
      name: 'Setting',
      uniqueFields: [['scope', 'key']],
      fields: [
        makeField({ name: 'scope', type: 'String' }),
        makeField({ name: 'key', type: 'String' }),
        makeField({ name: 'value', type: 'String' }),
      ],
    })
    expect(makeOpenApiPaths(setting, [], 'settings').map(([path]) => path)).toStrictEqual([
      '/settings',
      '/settings/{scope}/{key}',
    ])
  })

  it('writes only the collection of a model with no key at all', () => {
    const log = makeModel({ name: 'Log', fields: [makeField({ name: 'line', type: 'String' })] })
    expect(makeOpenApiPaths(log, [], 'logs').map(([path]) => path)).toStrictEqual(['/logs'])
  })
})
