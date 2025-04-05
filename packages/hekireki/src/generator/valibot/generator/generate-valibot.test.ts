import { describe, expect, it } from 'vitest'
import { generateValibot } from './generate-valibot'
import type { Model } from '../../../common/type'
import type { Config } from '..'

const modelData: Model[] = [
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
        documentation:
          'Unique identifier for the user.\n@z.string().uuid()\n@v.pipe(v.string(), v.uuid())',
      },
      {
        name: 'username',
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
          'Username of the user.\n@z.string().min(3)\n@v.pipe(v.string(), v.minLength(3))',
      },
      {
        name: 'email',
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
          'Email address of the user.\n@z.string().email()\n@v.pipe(v.string(), v.email())',
      },
      {
        name: 'password',
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
          'Password for the user.\n@z.string().min(8).max(100)\n@v.pipe(v.string(), v.minLength(8), v.maxLength(100))',
      },
      {
        name: 'createdAt',
        kind: 'scalar',
        isList: false,
        isRequired: true,
        isUnique: false,
        isId: false,
        isReadOnly: false,
        hasDefaultValue: false,
        type: 'DateTime',
        nativeType: null,
        isGenerated: false,
        isUpdatedAt: false,
        documentation: 'Timestamp when the user was created.\n@z.date()\n@v.date()',
      },
      {
        name: 'updatedAt',
        kind: 'scalar',
        isList: false,
        isRequired: true,
        isUnique: false,
        isId: false,
        isReadOnly: false,
        hasDefaultValue: false,
        type: 'DateTime',
        nativeType: null,
        isGenerated: false,
        isUpdatedAt: false,
        documentation: 'Timestamp when the user was last updated.\n@z.date()\n@v.date()',
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
      },
      {
        name: 'likes',
        kind: 'object',
        isList: true,
        isRequired: true,
        isUnique: false,
        isId: false,
        isReadOnly: false,
        hasDefaultValue: false,
        type: 'Like',
        nativeType: null,
        relationName: 'LikeToUser',
        relationFromFields: [],
        relationToFields: [],
        isGenerated: false,
        isUpdatedAt: false,
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
        documentation:
          'Unique identifier for the post.\n@z.string().uuid()\n@v.pipe(v.string(), v.uuid())',
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
        documentation:
          'ID of the user who created the post.\n@z.string().uuid()\n@v.pipe(v.string(), v.uuid())',
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
        documentation:
          'Content of the post.\n@z.string().max(500)\n@v.pipe(v.string(), v.maxLength(500))',
      },
      {
        name: 'createdAt',
        kind: 'scalar',
        isList: false,
        isRequired: true,
        isUnique: false,
        isId: false,
        isReadOnly: false,
        hasDefaultValue: true,
        type: 'DateTime',
        nativeType: null,
        default: {
          name: 'now',
          args: [],
        },
        isGenerated: false,
        isUpdatedAt: false,
        documentation: 'Timestamp when the post was created.\n@z.date()\n@v.date()',
      },
      {
        name: 'updatedAt',
        kind: 'scalar',
        isList: false,
        isRequired: true,
        isUnique: false,
        isId: false,
        isReadOnly: false,
        hasDefaultValue: true,
        type: 'DateTime',
        nativeType: null,
        default: {
          name: 'now',
          args: [],
        },
        isGenerated: false,
        isUpdatedAt: true,
        documentation: 'Timestamp when the post was last updated.\n@z.date()\n@v.date()',
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
        relationOnDelete: 'Cascade',
        isGenerated: false,
        isUpdatedAt: false,
        documentation: 'Relation with the User model.',
      },
      {
        name: 'likes',
        kind: 'object',
        isList: true,
        isRequired: true,
        isUnique: false,
        isId: false,
        isReadOnly: false,
        hasDefaultValue: false,
        type: 'Like',
        nativeType: null,
        relationName: 'LikeToPost',
        relationFromFields: [],
        relationToFields: [],
        isGenerated: false,
        isUpdatedAt: false,
      },
    ],
    primaryKey: null,
    uniqueFields: [],
    uniqueIndexes: [],
    isGenerated: false,
    documentation: '@relation User.id Post.userId one-to-many',
  },
  {
    name: 'Like',
    dbName: null,
    schema: null,
    fields: [
      {
        name: 'id',
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
          'Unique identifier for the like.\n@z.string().uuid()\n@v.pipe(v.string(), v.uuid())',
      },
      {
        name: 'postId',
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
        documentation:
          'ID of the post that is liked.\n@z.string().uuid()\n@v.pipe(v.string(), v.uuid())',
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
        documentation:
          'ID of the user who liked the post.\n@z.string().uuid()\n@v.pipe(v.string(), v.uuid())',
      },
      {
        name: 'createdAt',
        kind: 'scalar',
        isList: false,
        isRequired: true,
        isUnique: false,
        isId: false,
        isReadOnly: false,
        hasDefaultValue: true,
        type: 'DateTime',
        nativeType: null,
        default: {
          name: 'now',
          args: [],
        },
        isGenerated: false,
        isUpdatedAt: false,
        documentation: 'Timestamp when the like was created.\n@z.date()\n@v.date()',
      },
      {
        name: 'post',
        kind: 'object',
        isList: false,
        isRequired: true,
        isUnique: false,
        isId: false,
        isReadOnly: false,
        hasDefaultValue: false,
        type: 'Post',
        nativeType: null,
        relationName: 'LikeToPost',
        relationFromFields: ['postId'],
        relationToFields: ['id'],
        relationOnDelete: 'Cascade',
        isGenerated: false,
        isUpdatedAt: false,
        documentation: 'Relation with the Post model.',
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
        relationName: 'LikeToUser',
        relationFromFields: ['userId'],
        relationToFields: ['id'],
        relationOnDelete: 'Cascade',
        isGenerated: false,
        isUpdatedAt: false,
        documentation: 'Relation with the User model.',
      },
    ],
    primaryKey: null,
    uniqueFields: [['userId', 'postId']],
    uniqueIndexes: [
      {
        name: null,
        fields: ['userId', 'postId'],
      },
    ],
    isGenerated: false,
    documentation:
      '@relation Post.id Like.postId one-to-many\n@relation User.id Like.userId one-to-many',
  },
] as Model[]

const generateValibotTestCases: {
  models: Model[]
  config: Config
  expected: string
}[] = [
  {
    models: modelData,
    config: {
      schemaName: 'PascalCase',
      typeName: 'PascalCase',
      comment: true,
    },
    expected: `import * as v from 'valibot'


export const UserSchema = v.object({
  /**
   * Unique identifier for the user.
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * Username of the user.
   */
  username: v.pipe(v.string(), v.minLength(3)),
  /**
   * Email address of the user.
   */
  email: v.pipe(v.string(), v.email()),
  /**
   * Password for the user.
   */
  password: v.pipe(v.string(), v.minLength(8), v.maxLength(100)),
  /**
   * Timestamp when the user was created.
   */
  createdAt: v.date(),
  /**
   * Timestamp when the user was last updated.
   */
  updatedAt: v.date()
})

export const PostSchema = v.object({
  /**
   * Unique identifier for the post.
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * ID of the user who created the post.
   */
  userId: v.pipe(v.string(), v.uuid()),
  /**
   * Content of the post.
   */
  content: v.pipe(v.string(), v.maxLength(500)),
  /**
   * Timestamp when the post was created.
   */
  createdAt: v.date(),
  /**
   * Timestamp when the post was last updated.
   */
  updatedAt: v.date()
})

export const LikeSchema = v.object({
  /**
   * Unique identifier for the like.
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * ID of the post that is liked.
   */
  postId: v.pipe(v.string(), v.uuid()),
  /**
   * ID of the user who liked the post.
   */
  userId: v.pipe(v.string(), v.uuid()),
  /**
   * Timestamp when the like was created.
   */
  createdAt: v.date()
})`,
  },
]

describe('isValibotDocumentValidation', () => {
  it.concurrent.each(generateValibotTestCases)(
    'generateValibot($models, $config) -> $expected',
    ({ models, config, expected }) => {
      const result = generateValibot(models, config)
      expect(result).toEqual(expected)
    },
  )
})
