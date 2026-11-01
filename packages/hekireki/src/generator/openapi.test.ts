import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'
import { parse } from 'yaml'

import { openapiContent, openapiDocument } from './openapi.js'

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

const DATAMODEL: DMMF.Datamodel = {
  models: [
    {
      name: 'User',
      dbName: 'users',
      schema: null,
      documentation: 'Application user.',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'name', type: 'String', isRequired: false }),
        makeField({ name: 'role', type: 'Role', kind: 'enum' }),
        makeField({
          name: 'createdAt',
          type: 'DateTime',
          dbName: 'created_at',
          hasDefaultValue: true,
          default: { name: 'now', args: [] },
        }),
        makeField({ name: 'posts', type: 'Post', kind: 'object', isList: true, isRequired: false }),
        makeField({
          name: 'tags',
          type: 'Tag',
          kind: 'object',
          isList: true,
          isRequired: false,
          relationName: 'TagToUser',
        }),
      ],
      uniqueFields: [],
      uniqueIndexes: [],
      primaryKey: null,
      isGenerated: false,
    },
    {
      name: 'Post',
      dbName: 'posts',
      schema: null,
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'title', type: 'String', documentation: 'Title: the headline' }),
        makeField({
          name: 'status',
          type: 'String',
          hasDefaultValue: true,
          default: 'pending',
        }),
        makeField({ name: 'authorId', type: 'Int', dbName: 'author_id' }),
        makeField({
          name: 'author',
          type: 'User',
          kind: 'object',
          relationFromFields: ['authorId'],
          relationToFields: ['id'],
        }),
      ],
      uniqueFields: [],
      uniqueIndexes: [],
      primaryKey: null,
      isGenerated: false,
    },
    {
      name: 'Tag',
      dbName: null,
      schema: null,
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'users',
          type: 'User',
          kind: 'object',
          isList: true,
          isRequired: false,
          relationName: 'TagToUser',
        }),
      ],
      uniqueFields: [],
      uniqueIndexes: [],
      primaryKey: null,
      isGenerated: false,
    },
  ],
  enums: [
    {
      name: 'Role',
      dbName: null,
      values: [
        { name: 'ADMIN', dbName: null },
        { name: 'VIEWER', dbName: null },
      ],
    },
  ],
  types: [],
  indexes: [],
}

const CONFIG = { title: 'Blog', version: '2.0.0', paths: false }

describe('openapiDocument', () => {
  it('puts the tables under components.schemas in declaration order, join tables last', () => {
    const document = openapiDocument(DATAMODEL, CONFIG)
    expect(document.openapi).toBe('3.1.0')
    expect(document.info).toStrictEqual({ title: 'Blog', version: '2.0.0' })
    expect(Object.keys(document.components.schemas)).toStrictEqual([
      'users',
      'posts',
      'Tag',
      '_TagToUser',
    ])
    expect(document).not.toHaveProperty('paths')
  })

  it('puts the CRUD of each table before the components, with the input schemas, when asked', () => {
    const document = openapiDocument(DATAMODEL, { ...CONFIG, paths: true })
    expect(Object.keys(document)).toStrictEqual(['openapi', 'info', 'paths', 'components'])
    expect(Object.keys(document.paths ?? {})).toStrictEqual([
      '/users',
      '/users/{id}',
      '/posts',
      '/posts/{id}',
      '/tags',
      '/tags/{id}',
    ])
    expect(Object.keys(document.components.schemas)).toStrictEqual([
      'users',
      'users_create',
      'users_update',
      'posts',
      'posts_create',
      'posts_update',
      'Tag',
      'Tag_create',
      'Tag_update',
      '_TagToUser',
    ])
  })
})

describe('openapiContent', () => {
  it('writes the document as Atlas writes it', () => {
    expect(openapiContent(DATAMODEL, { ...CONFIG, format: 'yaml' })).toBe(`openapi: 3.1.0
info:
  title: Blog
  version: 2.0.0
components:
  schemas:
    users:
      type: object
      properties:
        id:
          type: integer
        name:
          type: [string, "null"]
        role:
          type: string
          enum:
            - ADMIN
            - VIEWER
        created_at:
          type: string
          format: date-time
      required:
        - id
        - role
        - created_at
      description: |
        Application user.
    posts:
      type: object
      properties:
        id:
          type: integer
        title:
          type: string
          description: "Title: the headline"
        status:
          type: string
          default: "pending"
        author_id:
          type: integer
      required:
        - id
        - title
        - status
        - author_id
      description: |
        FK posts_author_id_fkey: (author_id) -> users
    Tag:
      type: object
      properties:
        id:
          type: integer
      required:
        - id
    _TagToUser:
      type: object
      properties:
        A:
          type: integer
        B:
          type: integer
      required:
        - A
        - B
      description: |
        FK _TagToUser_A_fkey: (A) -> Tag
        FK _TagToUser_B_fkey: (B) -> users
`)
  })

  it('writes the same document as JSON, two spaces a level', () => {
    const json = openapiContent(DATAMODEL, { ...CONFIG, format: 'json' })
    expect(json.endsWith('\n')).toBe(true)
    expect(json.startsWith('{\n  "openapi": "3.1.0",\n')).toBe(true)
    expect(JSON.parse(json)).toStrictEqual(openapiDocument(DATAMODEL, CONFIG))
  })

  it.each([false, true])('writes YAML a reader turns back into the JSON (paths: %s)', (paths) => {
    const config = { ...CONFIG, paths }
    expect(parse(openapiContent(DATAMODEL, { ...config, format: 'yaml' }))).toStrictEqual(
      JSON.parse(openapiContent(DATAMODEL, { ...config, format: 'json' })),
    )
  })

  it('writes a path item as YAML with quoted status codes and paths', () => {
    const text = openapiContent(DATAMODEL, { ...CONFIG, paths: true, format: 'yaml' })
    expect(text).toContain(`  "/posts/{id}":
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: integer
    get:
      tags:
        - Post
      summary: Get a post
      operationId: getPost
      responses:
        "200":
          description: The post.
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/posts"
        "404":
          description: No post has this key.
`)
  })

  it('tells two models apart that would share a resource name', () => {
    const tag = DATAMODEL.models.find((model) => model.name === 'Tag')
    if (tag === undefined) throw new Error('the datamodel has no Tag')
    const twin: DMMF.Model = { ...tag, name: 'Tags', dbName: 'tags_2' }
    const document = openapiDocument(
      { ...DATAMODEL, models: [...DATAMODEL.models, twin] },
      { ...CONFIG, paths: true },
    )
    expect(Object.keys(document.paths ?? {}).filter((p) => p.startsWith('/tags'))).toStrictEqual([
      '/tags',
      '/tags/{id}',
      '/tags1',
      '/tags1/{id}',
    ])
  })
})
