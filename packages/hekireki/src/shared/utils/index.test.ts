import { describe, expect, it } from 'vitest'
import { capitalize, groupByModel, isFields, snakeCase } from '.'

// Test run
// pnpm vitest run ./src/shared/utils/index.test.ts

describe('utils', () => {
  // capitalize
  describe('capitalize', () => {
    it.concurrent(`capitalize('test') -> 'Test'`, () => {
      const result = capitalize('test')
      const expected = 'Test'
      expect(result).toBe(expected)
    })
    it.concurrent(`capitalize('Test') -> 'Test'`, () => {
      const result = capitalize('Test')
      const expected = 'Test'
      expect(result).toBe(expected)
    })
  })

  // snakeCase
  describe('snakeCase', () => {
    it('converts PascalCase to snake_case and pluralizes', () => {
      expect(snakeCase('TodoTag')).toBe('todo_tag')
      expect(snakeCase('User')).toBe('user')
      expect(snakeCase('Category')).toBe('category')
    })

    it('converts camelCase to snake_case and pluralizes', () => {
      expect(snakeCase('todoTag')).toBe('todo_tag')
      expect(snakeCase('userProfile')).toBe('user_profile')
    })

    it('handles single lowercase word', () => {
      expect(snakeCase('tag')).toBe('tag')
    })

    it('handles empty string', () => {
      expect(snakeCase('')).toBe('')
    })
  })

  // groupByModel
  describe('groupByModel', () => {
    it('groupByModel', () => {
      const result = groupByModel([
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
      ])
      const expected = {
        User: [
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
        ],
        Post: [
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
        ],
      }
      expect(result).toStrictEqual(expected)
    })
  })

  // isFields
  describe('isFields', () => {
    it.concurrent('isFields', () => {
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
})
