import { describe, expect, it } from 'vite-plus/test'

import {
  columnName,
  keyFields,
  makeColumnValues,
  makeEnumReadValues,
  makeEnumWriteValues,
  tableColumns,
  tableName,
} from './model.js'

function field(
  overrides: { readonly name: string } & Partial<{
    readonly dbName: string | null
    readonly kind: string
    readonly type: string
    readonly isList: boolean
    readonly isId: boolean
    readonly isUnique: boolean
  }>,
) {
  return {
    dbName: null,
    kind: 'scalar',
    type: 'String',
    isList: false,
    isId: false,
    isUnique: false,
    ...overrides,
  }
}

function model(
  overrides: { readonly name: string } & Partial<{
    readonly dbName: string | null
    readonly primaryKey: readonly string[] | null
    readonly fields: readonly ReturnType<typeof field>[]
  }>,
) {
  return { dbName: null, primaryKey: null, fields: [], ...overrides }
}

const ROLE = [
  {
    name: 'Role',
    values: [
      { name: 'ADMIN', dbName: 'admin' },
      { name: 'VIEWER', dbName: null },
    ],
  },
]

describe('tableColumns', () => {
  it('keeps the scalar and enum fields and drops the relations', () => {
    const columns = tableColumns({
      model: model({
        name: 'User',
        fields: [
          field({ name: 'id' }),
          field({ name: 'role', kind: 'enum', type: 'Role' }),
          field({ name: 'posts', kind: 'object', type: 'Post', isList: true }),
        ],
      }),
    })
    expect(columns.map((column) => column.name)).toStrictEqual(['id', 'role'])
  })
})

describe('columnName', () => {
  it('prefers the @map name and falls back to the field name', () => {
    expect(columnName({ field: { name: 'createdAt', dbName: 'created_at' } })).toBe('created_at')
    expect(columnName({ field: { name: 'createdAt', dbName: null } })).toBe('createdAt')
  })
})

describe('tableName', () => {
  it('prefers the @@map name and falls back to the model name', () => {
    expect(tableName({ model: model({ name: 'User', dbName: 'users' }) })).toBe('users')
    expect(tableName({ model: model({ name: 'User' }) })).toBe('User')
  })
})

// Without a key Studio cannot address a row, so the table opens read-only rather than guessing.
describe('keyFields', () => {
  it('takes a composite @@id whole', () => {
    expect(
      keyFields({
        model: model({
          name: 'Membership',
          primaryKey: ['tenantId', 'userId'],
          fields: [field({ name: 'tenantId', isId: true }), field({ name: 'userId' })],
        }),
      }),
    ).toStrictEqual(['tenantId', 'userId'])
  })

  it('falls back to the single @id field', () => {
    expect(
      keyFields({
        model: model({
          name: 'User',
          primaryKey: [],
          fields: [field({ name: 'email', isUnique: true }), field({ name: 'id', isId: true })],
        }),
      }),
    ).toStrictEqual(['id'])
  })

  it('falls back to the first @unique scalar when there is no id at all', () => {
    expect(
      keyFields({
        model: model({
          name: 'User',
          fields: [
            field({ name: 'posts', kind: 'object', type: 'Post', isUnique: true }),
            field({ name: 'email', isUnique: true }),
            field({ name: 'handle', isUnique: true }),
          ],
        }),
      }),
    ).toStrictEqual(['email'])
  })

  it('says a model has no key rather than picking an arbitrary column', () => {
    expect(
      keyFields({ model: model({ name: 'Log', fields: [field({ name: 'message' })] }) }),
    ).toStrictEqual([])
  })
})

// `PUBLIC` written into a column that stores `public` is a type error on PostgreSQL and a silent
// truncation on MySQL, so a `@map`ped member is translated on the way in and back on the way out.
describe('enum member translation', () => {
  const withRole = model({
    name: 'Post',
    fields: [
      field({ name: 'id', isId: true }),
      field({ name: 'role', dbName: 'role_name', kind: 'enum', type: 'Role' }),
    ],
  })

  it('maps a Prisma member name to its stored value on the way in', () => {
    const values = makeEnumWriteValues({ model: withRole, enums: ROLE })
    expect([...(values.get('role') ?? [])]).toStrictEqual([
      ['ADMIN', 'admin'],
      ['VIEWER', 'VIEWER'],
    ])
  })

  it('maps a stored value back to its Prisma name on the way out, keyed by column', () => {
    const values = makeEnumReadValues({ model: withRole, enums: ROLE })
    expect([...(values.get('role_name') ?? [])]).toStrictEqual([
      ['admin', 'ADMIN'],
      ['VIEWER', 'VIEWER'],
    ])
  })

  it('leaves an enum the schema does not declare with no translation at all', () => {
    expect([
      ...(makeEnumWriteValues({ model: withRole, enums: [] }).get('role') ?? []),
    ]).toStrictEqual([])
  })
})

describe('makeColumnValues', () => {
  const withRole = model({
    name: 'Post',
    fields: [
      field({ name: 'id', isId: true, type: 'Int' }),
      field({ name: 'title', dbName: 'post_title' }),
      field({ name: 'role', kind: 'enum', type: 'Role' }),
      field({ name: 'author', kind: 'object', type: 'User' }),
    ],
  })

  it('keys the row by column name and translates a mapped enum member', () => {
    expect(
      makeColumnValues({
        model: withRole,
        dialect: 'postgresql',
        row: { title: 'Hello', role: 'ADMIN' },
        enums: ROLE,
      }),
    ).toStrictEqual({ post_title: 'Hello', role: 'admin' })
  })

  it('drops a key that names no column of the table, relations included', () => {
    expect(
      makeColumnValues({
        model: withRole,
        dialect: 'postgresql',
        row: { title: 'Hello', author: 'nope', nothing: 1 },
        enums: ROLE,
      }),
    ).toStrictEqual({ post_title: 'Hello' })
  })

  it('leaves a non-string cell alone, with no enum table to consult', () => {
    expect(
      makeColumnValues({ model: withRole, dialect: 'sqlite', row: { id: 7, title: null } }),
    ).toStrictEqual({ id: 7, post_title: null })
  })
})
