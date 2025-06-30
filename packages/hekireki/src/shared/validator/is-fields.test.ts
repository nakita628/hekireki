import { describe, expect, it } from 'vitest'
import { isFields } from './is-fields'

// Test run
// pnpm vitest run ./src/shared/validator/is-fields.test.ts

describe('isFields', () => {
  it.concurrent('isFields Test', () => {
    const result = isFields([
      [
        {
          documentation: '',
          modelName: 'User',
          fieldName: 'id',
          comment: ['Primary key', '@v.pipe(v.string(), v.uuid())'],
          validation: 'uuid()',
        },
        {
          documentation: '',
          modelName: 'User',
          fieldName: 'name',
          comment: ['Display name', '@v.pipe(v.string(), v.minLength(1), v.maxLength(50))'],
          validation: 'string().min(1).max(50)',
        },
        {
          documentation: '',
          modelName: 'User',
          fieldName: 'posts',
          comment: ['One-to-many relation to Post'],
          validation: null,
        },
      ],
      [
        {
          documentation: '@relation User.id Post.userId one-to-many',
          modelName: 'Post',
          fieldName: 'id',
          comment: ['Primary key', '@v.pipe(v.string(), v.uuid())'],
          validation: 'uuid()',
        },
        {
          documentation: '@relation User.id Post.userId one-to-many',
          modelName: 'Post',
          fieldName: 'title',
          comment: ['Article title', '@v.pipe(v.string(), v.minLength(1), v.maxLength(100))'],
          validation: 'string().min(1).max(100)',
        },
        {
          documentation: '@relation User.id Post.userId one-to-many',
          modelName: 'Post',
          fieldName: 'content',
          comment: ['Body content (no length limit)', '@v.string()'],
          validation: 'string()',
        },
        {
          documentation: '@relation User.id Post.userId one-to-many',
          modelName: 'Post',
          fieldName: 'userId',
          comment: ['Foreign key referencing User.id', '@v.pipe(v.string(), v.uuid())'],
          validation: 'uuid()',
        },
        {
          documentation: '@relation User.id Post.userId one-to-many',
          modelName: 'Post',
          fieldName: 'user',
          comment: ['Prisma relation definition'],
          validation: null,
        },
      ],
    ])
    const expected = [
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'id',
        comment: ['Primary key', '@v.pipe(v.string(), v.uuid())'],
        validation: 'uuid()',
      },
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'name',
        comment: ['Display name', '@v.pipe(v.string(), v.minLength(1), v.maxLength(50))'],
        validation: 'string().min(1).max(50)',
      },
      {
        documentation: '@relation User.id Post.userId one-to-many',
        modelName: 'Post',
        fieldName: 'id',
        comment: ['Primary key', '@v.pipe(v.string(), v.uuid())'],
        validation: 'uuid()',
      },
      {
        documentation: '@relation User.id Post.userId one-to-many',
        modelName: 'Post',
        fieldName: 'title',
        comment: ['Article title', '@v.pipe(v.string(), v.minLength(1), v.maxLength(100))'],
        validation: 'string().min(1).max(100)',
      },
      {
        documentation: '@relation User.id Post.userId one-to-many',
        modelName: 'Post',
        fieldName: 'content',
        comment: ['Body content (no length limit)', '@v.string()'],
        validation: 'string()',
      },
      {
        documentation: '@relation User.id Post.userId one-to-many',
        modelName: 'Post',
        fieldName: 'userId',
        comment: ['Foreign key referencing User.id', '@v.pipe(v.string(), v.uuid())'],
        validation: 'uuid()',
      },
    ]
    expect(result).toStrictEqual(expected)
  })
})
