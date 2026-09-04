import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import { typeboxCode } from './typebox.js'

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

const enums: DMMF.DatamodelEnum[] = [
  {
    name: 'Role',
    values: [
      { name: 'USER', dbName: null },
      { name: 'ADMIN', dbName: null },
    ],
    dbName: null,
  },
]

const models = [
  makeModel({
    name: 'User',
    documentation: 'A person.',
    fields: [
      makeField({ name: 'id', type: 'Int', isId: true, documentation: 'Primary key.' }),
      makeField({ name: 'name', type: 'String' }),
      makeField({ name: 'role', type: 'Role', kind: 'enum' }),
      makeField({
        name: 'posts',
        type: 'BlogPost',
        kind: 'object',
        isList: true,
        isRequired: false,
        relationName: 'BlogPostToUser',
      }),
    ],
  }),
  makeModel({
    name: 'BlogPost',
    fields: [
      makeField({ name: 'id', type: 'Int', isId: true }),
      makeField({ name: 'title', type: 'String' }),
      makeField({ name: 'authorId', type: 'Int', isReadOnly: true }),
      makeField({
        name: 'author',
        type: 'User',
        kind: 'object',
        relationName: 'BlogPostToUser',
        relationFromFields: ['authorId'],
        relationToFields: ['id'],
      }),
    ],
  }),
]

const datamodel: DMMF.Datamodel = { models, enums, types: [], indexes: [] }
const dmmf = { datamodel, schema: {}, mappings: {} } as unknown as DMMF.Document
const emptyDmmf = {
  datamodel: { models: [], enums: [], types: [], indexes: [] },
  schema: {},
  mappings: {},
} as unknown as DMMF.Document

describe('typeboxCode', () => {
  it('emits every model schema, without the relation schemas', () => {
    expect(typeboxCode(dmmf, true, true, false))
      .toBe(`import { type Static, Type } from '@sinclair/typebox'

export const UserSchema = Type.Object({
  /**
   * Primary key.
   */
  id: Type.Integer(),
  name: Type.String(),
  role: Type.Union([Type.Literal('USER'), Type.Literal('ADMIN')]),
})

export type User = Static<typeof UserSchema>

export const BlogPostSchema = Type.Object({
  id: Type.Integer(),
  title: Type.String(),
  authorId: Type.Integer(),
})

export type BlogPost = Static<typeof BlogPostSchema>`)
  })

  it('appends the relation schemas after a blank line', () => {
    expect(typeboxCode(dmmf, true, true, true))
      .toBe(`import { type Static, Type } from '@sinclair/typebox'

export const UserSchema = Type.Object({
  /**
   * Primary key.
   */
  id: Type.Integer(),
  name: Type.String(),
  role: Type.Union([Type.Literal('USER'), Type.Literal('ADMIN')]),
})

export type User = Static<typeof UserSchema>

export const BlogPostSchema = Type.Object({
  id: Type.Integer(),
  title: Type.String(),
  authorId: Type.Integer(),
})

export type BlogPost = Static<typeof BlogPostSchema>

export const UserRelationsSchema = Type.Object({
  ...UserSchema.properties,
  posts: Type.Array(BlogPostSchema),
})

export type UserRelations = Static<typeof UserRelationsSchema>

export const BlogPostRelationsSchema = Type.Object({
  ...BlogPostSchema.properties,
  author: UserSchema,
})

export type BlogPostRelations = Static<typeof BlogPostRelationsSchema>`)
  })

  it('emits no relation block for a schema without models', () => {
    expect(typeboxCode(emptyDmmf, true, true, true))
      .toBe(`import { type Static, Type } from '@sinclair/typebox'

`)
  })
})
