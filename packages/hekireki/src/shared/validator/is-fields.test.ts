import { describe, expect, it } from 'vitest'
import { isFieldsValidation } from './is-fields'

const isZodFieldsValidationTestCases = [
  {
    modelFields: [
      [
        {
          documentation: '',
          modelName: 'User',
          fieldName: 'id',
          comment: ['Unique identifier for the user.', '@v.pipe(v.string(), v.uuid())'],
          validation: 'string().uuid()',
        },
        {
          documentation: '',
          modelName: 'User',
          fieldName: 'username',
          comment: ['Username of the user.', '@v.pipe(v.string(), v.minLength(3))'],
          validation: 'string().min(3)',
        },
        {
          documentation: '',
          modelName: 'User',
          fieldName: 'email',
          comment: ['Email address of the user.', '@v.pipe(v.string(), v.email())'],
          validation: 'string().email()',
        },
        {
          documentation: '',
          modelName: 'User',
          fieldName: 'password',
          comment: [
            'Password for the user.',
            '@v.pipe(v.string(), v.minLength(8), v.maxLength(100))',
          ],
          validation: 'string().min(8).max(100)',
        },
        {
          documentation: '',
          modelName: 'User',
          fieldName: 'createdAt',
          comment: ['Timestamp when the user was created.', '@v.date()'],
          validation: 'date()',
        },
        {
          documentation: '',
          modelName: 'User',
          fieldName: 'updatedAt',
          comment: ['Timestamp when the user was last updated.', '@v.date()'],
          validation: 'date()',
        },
        {
          documentation: '',
          modelName: 'User',
          fieldName: 'posts',
          comment: [],
          validation: null,
        },
        {
          documentation: '',
          modelName: 'User',
          fieldName: 'likes',
          comment: [],
          validation: null,
        },
      ],
      [
        {
          documentation: '@relation User.id Post.userId one-to-many',
          modelName: 'Post',
          fieldName: 'id',
          comment: ['Unique identifier for the post.', '@v.pipe(v.string(), v.uuid())'],
          validation: 'string().uuid()',
        },
        {
          documentation: '@relation User.id Post.userId one-to-many',
          modelName: 'Post',
          fieldName: 'userId',
          comment: ['ID of the user who created the post.', '@v.pipe(v.string(), v.uuid())'],
          validation: 'string().uuid()',
        },
        {
          documentation: '@relation User.id Post.userId one-to-many',
          modelName: 'Post',
          fieldName: 'content',
          comment: ['Content of the post.', '@v.pipe(v.string(), v.maxLength(500))'],
          validation: 'string().max(500)',
        },
        {
          documentation: '@relation User.id Post.userId one-to-many',
          modelName: 'Post',
          fieldName: 'createdAt',
          comment: ['Timestamp when the post was created.', '@v.date()'],
          validation: 'date()',
        },
        {
          documentation: '@relation User.id Post.userId one-to-many',
          modelName: 'Post',
          fieldName: 'updatedAt',
          comment: ['Timestamp when the post was last updated.', '@v.date()'],
          validation: 'date()',
        },
        {
          documentation: '@relation User.id Post.userId one-to-many',
          modelName: 'Post',
          fieldName: 'user',
          comment: ['Relation with the User model.'],
          validation: null,
        },
        {
          documentation: '@relation User.id Post.userId one-to-many',
          modelName: 'Post',
          fieldName: 'likes',
          comment: [],
          validation: null,
        },
      ],
      [
        {
          documentation:
            '@relation Post.id Like.postId one-to-many\n@relation User.id Like.userId one-to-many',
          modelName: 'Like',
          fieldName: 'id',
          comment: ['Unique identifier for the like.', '@v.pipe(v.string(), v.uuid())'],
          validation: 'string().uuid()',
        },
        {
          documentation:
            '@relation Post.id Like.postId one-to-many\n@relation User.id Like.userId one-to-many',
          modelName: 'Like',
          fieldName: 'postId',
          comment: ['ID of the post that is liked.', '@v.pipe(v.string(), v.uuid())'],
          validation: 'string().uuid()',
        },
        {
          documentation:
            '@relation Post.id Like.postId one-to-many\n@relation User.id Like.userId one-to-many',
          modelName: 'Like',
          fieldName: 'userId',
          comment: ['ID of the user who liked the post.', '@v.pipe(v.string(), v.uuid())'],
          validation: 'string().uuid()',
        },
        {
          documentation:
            '@relation Post.id Like.postId one-to-many\n@relation User.id Like.userId one-to-many',
          modelName: 'Like',
          fieldName: 'createdAt',
          comment: ['Timestamp when the like was created.', '@v.date()'],
          validation: 'date()',
        },
        {
          documentation:
            '@relation Post.id Like.postId one-to-many\n@relation User.id Like.userId one-to-many',
          modelName: 'Like',
          fieldName: 'post',
          comment: ['Relation with the Post model.'],
          validation: null,
        },
        {
          documentation:
            '@relation Post.id Like.postId one-to-many\n@relation User.id Like.userId one-to-many',
          modelName: 'Like',
          fieldName: 'user',
          comment: ['Relation with the User model.'],
          validation: null,
        },
      ],
    ],
    expected: [
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'id',
        comment: ['Unique identifier for the user.', '@v.pipe(v.string(), v.uuid())'],
        validation: 'string().uuid()',
      },
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'username',
        comment: ['Username of the user.', '@v.pipe(v.string(), v.minLength(3))'],
        validation: 'string().min(3)',
      },
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'email',
        comment: ['Email address of the user.', '@v.pipe(v.string(), v.email())'],
        validation: 'string().email()',
      },
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'password',
        comment: [
          'Password for the user.',
          '@v.pipe(v.string(), v.minLength(8), v.maxLength(100))',
        ],
        validation: 'string().min(8).max(100)',
      },
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'createdAt',
        comment: ['Timestamp when the user was created.', '@v.date()'],
        validation: 'date()',
      },
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'updatedAt',
        comment: ['Timestamp when the user was last updated.', '@v.date()'],
        validation: 'date()',
      },
      {
        documentation: '@relation User.id Post.userId one-to-many',
        modelName: 'Post',
        fieldName: 'id',
        comment: ['Unique identifier for the post.', '@v.pipe(v.string(), v.uuid())'],
        validation: 'string().uuid()',
      },
      {
        documentation: '@relation User.id Post.userId one-to-many',
        modelName: 'Post',
        fieldName: 'userId',
        comment: ['ID of the user who created the post.', '@v.pipe(v.string(), v.uuid())'],
        validation: 'string().uuid()',
      },
      {
        documentation: '@relation User.id Post.userId one-to-many',
        modelName: 'Post',
        fieldName: 'content',
        comment: ['Content of the post.', '@v.pipe(v.string(), v.maxLength(500))'],
        validation: 'string().max(500)',
      },
      {
        documentation: '@relation User.id Post.userId one-to-many',
        modelName: 'Post',
        fieldName: 'createdAt',
        comment: ['Timestamp when the post was created.', '@v.date()'],
        validation: 'date()',
      },
      {
        documentation: '@relation User.id Post.userId one-to-many',
        modelName: 'Post',
        fieldName: 'updatedAt',
        comment: ['Timestamp when the post was last updated.', '@v.date()'],
        validation: 'date()',
      },
      {
        documentation:
          '@relation Post.id Like.postId one-to-many\n@relation User.id Like.userId one-to-many',
        modelName: 'Like',
        fieldName: 'id',
        comment: ['Unique identifier for the like.', '@v.pipe(v.string(), v.uuid())'],
        validation: 'string().uuid()',
      },
      {
        documentation:
          '@relation Post.id Like.postId one-to-many\n@relation User.id Like.userId one-to-many',
        modelName: 'Like',
        fieldName: 'postId',
        comment: ['ID of the post that is liked.', '@v.pipe(v.string(), v.uuid())'],
        validation: 'string().uuid()',
      },
      {
        documentation:
          '@relation Post.id Like.postId one-to-many\n@relation User.id Like.userId one-to-many',
        modelName: 'Like',
        fieldName: 'userId',
        comment: ['ID of the user who liked the post.', '@v.pipe(v.string(), v.uuid())'],
        validation: 'string().uuid()',
      },
      {
        documentation:
          '@relation Post.id Like.postId one-to-many\n@relation User.id Like.userId one-to-many',
        modelName: 'Like',
        fieldName: 'createdAt',
        comment: ['Timestamp when the like was created.', '@v.date()'],
        validation: 'date()',
      },
    ],
  },
]

describe('Zod Fields Validation', () => {
  it.each(isZodFieldsValidationTestCases)(
    'isZodFieldsValidation($modelFields) -> $expected',
    ({ modelFields, expected }) => {
      const result = isFieldsValidation(modelFields)
      expect(result).toEqual(expected)
    },
  )
})
