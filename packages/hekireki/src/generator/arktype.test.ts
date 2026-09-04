import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import { arktypeCode } from './arktype.js'

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

describe('arktypeCode', () => {
  it('emits every model schema, without the relation schemas', () => {
    expect(arktypeCode(dmmf, true, true, false)).toBe(`import { type } from 'arktype'

export const UserSchema = type({
  /**
   * Primary key.
   */
  id: "number",
  name: "string",
  role: "'USER' | 'ADMIN'",
})

export type User = typeof UserSchema.infer

export const BlogPostSchema = type({
  id: "number",
  title: "string",
  authorId: "number",
})

export type BlogPost = typeof BlogPostSchema.infer`)
  })

  it('appends the relation schemas after a blank line', () => {
    expect(arktypeCode(dmmf, true, true, true)).toBe(`import { type } from 'arktype'

export const UserSchema = type({
  /**
   * Primary key.
   */
  id: "number",
  name: "string",
  role: "'USER' | 'ADMIN'",
})

export type User = typeof UserSchema.infer

export const BlogPostSchema = type({
  id: "number",
  title: "string",
  authorId: "number",
})

export type BlogPost = typeof BlogPostSchema.infer

export const UserRelationsSchema = type({...UserSchema.t,posts:BlogPostSchema.array(),})

export type UserRelations = typeof UserRelationsSchema.infer

export const BlogPostRelationsSchema = type({...BlogPostSchema.t,author:UserSchema,})

export type BlogPostRelations = typeof BlogPostRelationsSchema.infer`)
  })

  it('emits no relation block for a schema without models', () => {
    expect(arktypeCode(emptyDmmf, true, true, true)).toBe(`import { type } from 'arktype'

`)
  })
})
