import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import { effectCode } from './effect.js'

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

describe('effectCode', () => {
  it('emits every model schema, without the relation schemas', () => {
    expect(effectCode(dmmf, true, true, false)).toBe(`import { Schema } from 'effect'

export const UserSchema = Schema.Struct({
  /**
   * Primary key.
   */
  id: Schema.Number,
  name: Schema.String,
  role: Schema.Literal('USER', 'ADMIN'),
})

export type User = typeof UserSchema.Type

export const BlogPostSchema = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  authorId: Schema.Number,
})

export type BlogPost = typeof BlogPostSchema.Type`)
  })

  it('appends the relation schemas after a blank line', () => {
    expect(effectCode(dmmf, true, true, true)).toBe(`import { Schema } from 'effect'

export const UserSchema = Schema.Struct({
  /**
   * Primary key.
   */
  id: Schema.Number,
  name: Schema.String,
  role: Schema.Literal('USER', 'ADMIN'),
})

export type User = typeof UserSchema.Type

export const BlogPostSchema = Schema.Struct({
  id: Schema.Number,
  title: Schema.String,
  authorId: Schema.Number,
})

export type BlogPost = typeof BlogPostSchema.Type

export const UserRelationsSchema = Schema.Struct({...UserSchema.fields,posts:Schema.Array(BlogPostSchema),})

export type UserRelations = typeof UserRelationsSchema.Type

export const BlogPostRelationsSchema = Schema.Struct({...BlogPostSchema.fields,author:UserSchema,})

export type BlogPostRelations = typeof BlogPostRelationsSchema.Type`)
  })

  it('emits no relation block for a schema without models', () => {
    expect(effectCode(emptyDmmf, true, true, true)).toBe(`import { Schema } from 'effect'

`)
  })
})
