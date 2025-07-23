import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vitest'
import { zod } from '.'

// Test run
// pnpm vitest run ./src/generator/zod/generator/zod.test.ts

const testModels: DMMF.Model[] = [
  {
    name: 'User',
    dbName: null,
    schema: null,
    fields: [
      {
        name: 'id',
        kind: 'scalar',
        isList: false,
        isRequired: true,
        isUnique: false,
        isId: true,
        isReadOnly: false,
        hasDefaultValue: true,
        type: 'String',
        nativeType: null,
        default: {
          name: 'uuid',
          args: [4],
        },
        isGenerated: false,
        isUpdatedAt: false,
        documentation: 'Primary key\n@z.uuid()\n@v.pipe(v.string(), v.uuid())',
      },
      {
        name: 'name',
        kind: 'scalar',
        isList: false,
        isRequired: true,
        isUnique: false,
        isId: false,
        isReadOnly: false,
        hasDefaultValue: false,
        type: 'String',
        nativeType: null,
        isGenerated: false,
        isUpdatedAt: false,
        documentation:
          'Display name\n@z.string().min(1).max(50)\n@v.pipe(v.string(), v.minLength(1), v.maxLength(50))',
      },
      {
        name: 'posts',
        kind: 'object',
        isList: true,
        isRequired: true,
        isUnique: false,
        isId: false,
        isReadOnly: false,
        hasDefaultValue: false,
        type: 'Post',
        nativeType: null,
        relationName: 'PostToUser',
        relationFromFields: [],
        relationToFields: [],
        isGenerated: false,
        isUpdatedAt: false,
        documentation: 'One-to-many relation to Post',
      },
    ],
    primaryKey: null,
    uniqueFields: [],
    uniqueIndexes: [],
    isGenerated: false,
  },
  {
    name: 'Post',
    dbName: null,
    schema: null,
    fields: [
      {
        name: 'id',
        kind: 'scalar',
        isList: false,
        isRequired: true,
        isUnique: false,
        isId: true,
        isReadOnly: false,
        hasDefaultValue: true,
        type: 'String',
        nativeType: null,
        default: {
          name: 'uuid',
          args: [4],
        },
        isGenerated: false,
        isUpdatedAt: false,
        documentation: 'Primary key\n@z.uuid()\n@v.pipe(v.string(), v.uuid())',
      },
      {
        name: 'title',
        kind: 'scalar',
        isList: false,
        isRequired: true,
        isUnique: false,
        isId: false,
        isReadOnly: false,
        hasDefaultValue: false,
        type: 'String',
        nativeType: null,
        isGenerated: false,
        isUpdatedAt: false,
        documentation:
          'Article title\n@z.string().min(1).max(100)\n@v.pipe(v.string(), v.minLength(1), v.maxLength(100))',
      },
      {
        name: 'content',
        kind: 'scalar',
        isList: false,
        isRequired: true,
        isUnique: false,
        isId: false,
        isReadOnly: false,
        hasDefaultValue: false,
        type: 'String',
        nativeType: null,
        isGenerated: false,
        isUpdatedAt: false,
        documentation: 'Body content (no length limit)\n@z.string()\n@v.string()',
      },
      {
        name: 'userId',
        kind: 'scalar',
        isList: false,
        isRequired: true,
        isUnique: false,
        isId: false,
        isReadOnly: true,
        hasDefaultValue: false,
        type: 'String',
        nativeType: null,
        isGenerated: false,
        isUpdatedAt: false,
        documentation: 'Foreign key referencing User.id\n@z.uuid()\n@v.pipe(v.string(), v.uuid())',
      },
      {
        name: 'user',
        kind: 'object',
        isList: false,
        isRequired: true,
        isUnique: false,
        isId: false,
        isReadOnly: false,
        hasDefaultValue: false,
        type: 'User',
        nativeType: null,
        relationName: 'PostToUser',
        relationFromFields: ['userId'],
        relationToFields: ['id'],
        isGenerated: false,
        isUpdatedAt: false,
        documentation: 'Prisma relation definition',
      },
    ],
    primaryKey: null,
    uniqueFields: [],
    uniqueIndexes: [],
    isGenerated: false,
    documentation: '@relation User.id Post.userId one-to-many',
  },
]

describe('zod', () => {
  it.concurrent('zod type true comment true', () => {
    const result = zod(testModels, true, true)
    const expected = `import * as z from 'zod'

export const UserSchema = z.object({
  /**
   * Primary key
   */
  id: z.uuid(),
  /**
   * Display name
   */
  name: z.string().min(1).max(50)
})

export type User = z.infer<typeof UserSchema>

export const PostSchema = z.object({
  /**
   * Primary key
   */
  id: z.uuid(),
  /**
   * Article title
   */
  title: z.string().min(1).max(100),
  /**
   * Body content (no length limit)
   */
  content: z.string(),
  /**
   * Foreign key referencing User.id
   */
  userId: z.uuid()
})

export type Post = z.infer<typeof PostSchema>`
    expect(result).toBe(expected)
  })
})
