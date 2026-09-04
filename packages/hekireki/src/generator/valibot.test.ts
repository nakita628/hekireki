import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import { valibotCode } from './valibot.js'

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

describe('valibotCode', () => {
  it('emits every model schema, without the relation schemas', () => {
    expect(valibotCode(dmmf, true, true, false)).toBe(`import * as v from 'valibot'

export const UserSchema = v.object({
  /**
   * Primary key.
   */
  id: v.number(),
  name: v.string(),
  role: v.picklist(['USER', 'ADMIN'])
})

export type User = v.InferOutput<typeof UserSchema>

export const BlogPostSchema = v.object({
  id: v.number(),
  title: v.string(),
  authorId: v.number()
})

export type BlogPost = v.InferOutput<typeof BlogPostSchema>`)
  })

  it('appends the relation schemas after a blank line', () => {
    expect(valibotCode(dmmf, true, true, true)).toBe(`import * as v from 'valibot'

export const UserSchema = v.object({
  /**
   * Primary key.
   */
  id: v.number(),
  name: v.string(),
  role: v.picklist(['USER', 'ADMIN'])
})

export type User = v.InferOutput<typeof UserSchema>

export const BlogPostSchema = v.object({
  id: v.number(),
  title: v.string(),
  authorId: v.number()
})

export type BlogPost = v.InferOutput<typeof BlogPostSchema>

export const UserRelationsSchema = v.object({
  ...UserSchema.entries,
  posts: v.array(BlogPostSchema),
})

export type UserRelations = v.InferOutput<typeof UserRelationsSchema>

export const BlogPostRelationsSchema = v.object({
  ...BlogPostSchema.entries,
  author: UserSchema,
})

export type BlogPostRelations = v.InferOutput<typeof BlogPostRelationsSchema>`)
  })

  it('emits no relation block for a schema without models', () => {
    expect(valibotCode(emptyDmmf, true, true, true)).toBe(`import * as v from 'valibot'

`)
  })
})
