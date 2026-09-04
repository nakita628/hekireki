import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import { ajvCode } from './ajv.js'

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

describe('ajvCode', () => {
  it('emits every model schema, without the relation schemas', () => {
    expect(ajvCode(dmmf, true, true, false))
      .toBe(`import type { FromSchema } from 'json-schema-to-ts'

export const UserSchema = {
  type: 'object' as const,
  properties: {
    /**
     * Primary key.
     */
    id: { type: 'integer' as const },
    name: { type: 'string' as const },
    role: { enum: ['USER', 'ADMIN'] as const },
  },
  required: ['id', 'name', 'role'] as const,
  additionalProperties: false,
} as const

export type User = FromSchema<typeof UserSchema>

export const BlogPostSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'integer' as const },
    title: { type: 'string' as const },
    authorId: { type: 'integer' as const },
  },
  required: ['id', 'title', 'authorId'] as const,
  additionalProperties: false,
} as const

export type BlogPost = FromSchema<typeof BlogPostSchema>`)
  })

  it('appends the relation schemas after a blank line', () => {
    expect(ajvCode(dmmf, true, true, true))
      .toBe(`import type { FromSchema } from 'json-schema-to-ts'

export const UserSchema = {
  type: 'object' as const,
  properties: {
    /**
     * Primary key.
     */
    id: { type: 'integer' as const },
    name: { type: 'string' as const },
    role: { enum: ['USER', 'ADMIN'] as const },
  },
  required: ['id', 'name', 'role'] as const,
  additionalProperties: false,
} as const

export type User = FromSchema<typeof UserSchema>

export const BlogPostSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'integer' as const },
    title: { type: 'string' as const },
    authorId: { type: 'integer' as const },
  },
  required: ['id', 'title', 'authorId'] as const,
  additionalProperties: false,
} as const

export type BlogPost = FromSchema<typeof BlogPostSchema>

export const UserRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...UserSchema.properties,
    posts: { type: 'array' as const, items: BlogPostSchema },
  },
  additionalProperties: false,
} as const

export type UserRelations = FromSchema<typeof UserRelationsSchema>

export const BlogPostRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...BlogPostSchema.properties,
    author: UserSchema,
  },
  additionalProperties: false,
} as const

export type BlogPostRelations = FromSchema<typeof BlogPostRelationsSchema>`)
  })

  it('emits no relation block for a schema without models', () => {
    expect(ajvCode(emptyDmmf, true, true, true))
      .toBe(`import type { FromSchema } from 'json-schema-to-ts'

`)
  })
})
