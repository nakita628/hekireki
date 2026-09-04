import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import { zodCode } from './zod.js'

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

describe('zodCode', () => {
  it('emits every model schema, without the relation schemas', () => {
    expect(zodCode(dmmf, true, true, false, '4')).toBe(`import * as z from 'zod'

export const UserSchema = z.object({
  /**
   * Primary key.
   */
  id: z.number(),
  name: z.string(),
  role: z.enum(['USER', 'ADMIN'])
})

export type User = z.infer<typeof UserSchema>

export const BlogPostSchema = z.object({
  id: z.number(),
  title: z.string(),
  authorId: z.number()
})

export type BlogPost = z.infer<typeof BlogPostSchema>`)
  })

  it('appends the relation schemas after a blank line', () => {
    expect(zodCode(dmmf, true, true, true, '4')).toBe(`import * as z from 'zod'

export const UserSchema = z.object({
  /**
   * Primary key.
   */
  id: z.number(),
  name: z.string(),
  role: z.enum(['USER', 'ADMIN'])
})

export type User = z.infer<typeof UserSchema>

export const BlogPostSchema = z.object({
  id: z.number(),
  title: z.string(),
  authorId: z.number()
})

export type BlogPost = z.infer<typeof BlogPostSchema>

export const UserRelationsSchema = z.object({
  ...UserSchema.shape,
  posts: z.array(BlogPostSchema),
})

export type UserRelations = z.infer<typeof UserRelationsSchema>

export const BlogPostRelationsSchema = z.object({
  ...BlogPostSchema.shape,
  author: UserSchema,
})

export type BlogPostRelations = z.infer<typeof BlogPostRelationsSchema>`)
  })

  it('emits no relation block for a schema without models', () => {
    expect(zodCode(emptyDmmf, true, true, true, '4')).toBe(`import * as z from 'zod'

`)
  })
})
