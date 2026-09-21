import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import {
  activeRecordLocaleFiles,
  activeRecordModels,
  activeRecordProblems,
} from './activerecord.js'

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

describe('activeRecordModels', () => {
  it('generates belongs_to and has_many for a one-to-many relation', () => {
    const user = makeModel({
      name: 'User',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({ name: 'name', type: 'String' }),
        makeField({
          name: 'posts',
          type: 'Post',
          kind: 'object',
          isList: true,
          relationName: 'PostToUser',
        }),
      ],
    })
    const post = makeModel({
      name: 'Post',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({ name: 'title', type: 'String' }),
        makeField({ name: 'userId', type: 'String', isReadOnly: true }),
        makeField({
          name: 'user',
          type: 'User',
          kind: 'object',
          relationName: 'PostToUser',
          relationFromFields: ['userId'],
          relationToFields: ['id'],
        }),
      ],
    })

    expect(activeRecordModels([user], [user, post])).toBe(`class User < ApplicationRecord
  self.table_name = "User"

  attribute :id, default: -> { SecureRandom.uuid }

  validates :name, presence: true

  has_many :posts, foreign_key: "userId", inverse_of: :user, dependent: :restrict_with_error
end`)

    expect(activeRecordModels([post], [user, post])).toBe(`class Post < ApplicationRecord
  self.table_name = "Post"

  attribute :id, default: -> { SecureRandom.uuid }

  validates :title, presence: true

  belongs_to :user, foreign_key: "userId", inverse_of: :posts
end`)
  })

  it('generates has_one for a one-to-one relation', () => {
    const user = makeModel({
      name: 'User',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({
          name: 'profile',
          type: 'Profile',
          kind: 'object',
          isRequired: false,
          relationName: 'ProfileToUser',
        }),
      ],
    })
    const profile = makeModel({
      name: 'Profile',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({ name: 'userId', type: 'String', isUnique: true, isReadOnly: true }),
        makeField({
          name: 'user',
          type: 'User',
          kind: 'object',
          relationName: 'ProfileToUser',
          relationFromFields: ['userId'],
          relationToFields: ['id'],
        }),
      ],
    })

    expect(activeRecordModels([user], [user, profile])).toBe(`class User < ApplicationRecord
  self.table_name = "User"

  attribute :id, default: -> { SecureRandom.uuid }

  has_one :profile, foreign_key: "userId", inverse_of: :user, dependent: :restrict_with_error
end`)
  })

  it('marks belongs_to as optional when the relation field is optional', () => {
    const user = makeModel({
      name: 'User',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
      ],
    })
    const post = makeModel({
      name: 'Post',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({ name: 'userId', type: 'String', isRequired: false, isReadOnly: true }),
        makeField({
          name: 'user',
          type: 'User',
          kind: 'object',
          isRequired: false,
          relationName: 'PostToUser',
          relationFromFields: ['userId'],
          relationToFields: ['id'],
        }),
      ],
    })

    expect(activeRecordModels([post], [user, post])).toBe(`class Post < ApplicationRecord
  self.table_name = "Post"

  attribute :id, default: -> { SecureRandom.uuid }

  belongs_to :user, foreign_key: "userId", optional: true
end`)
  })

  it('generates enum with string values', () => {
    const enums: DMMF.DatamodelEnum[] = [
      {
        name: 'Role',
        values: [
          { name: 'ADMIN', dbName: null },
          { name: 'USER', dbName: null },
        ],
        dbName: null,
      },
    ]
    const user = makeModel({
      name: 'User',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({ name: 'role', type: 'Role', kind: 'enum' }),
      ],
    })

    expect(activeRecordModels([user], [user], enums)).toBe(`class User < ApplicationRecord
  self.table_name = "User"

  attribute :id, default: -> { SecureRandom.uuid }

  enum :role, { admin: "ADMIN", user: "USER" }, validate: true
end`)
  })

  it('generates composite primary key with self.primary_key array', () => {
    const like = makeModel({
      name: 'Like',
      primaryKey: { name: null, fields: ['userId', 'postId'] },
      fields: [
        makeField({ name: 'userId', type: 'String', isReadOnly: true }),
        makeField({ name: 'postId', type: 'String', isReadOnly: true }),
        makeField({
          name: 'user',
          type: 'User',
          kind: 'object',
          relationName: 'LikeToUser',
          relationFromFields: ['userId'],
          relationToFields: ['id'],
        }),
      ],
    })
    const user = makeModel({
      name: 'User',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({
          name: 'likes',
          type: 'Like',
          kind: 'object',
          isList: true,
          relationName: 'LikeToUser',
        }),
      ],
    })

    expect(activeRecordModels([like], [like, user])).toBe(`class Like < ApplicationRecord
  self.table_name = "Like"
  self.primary_key = %w[userId postId]

  belongs_to :user, foreign_key: "userId", inverse_of: :likes
end`)
  })

  it('sets self.primary_key when the primary key column is not id', () => {
    const user = makeModel({
      name: 'User',
      fields: [
        makeField({
          name: 'userId',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({ name: 'name', type: 'String' }),
      ],
    })

    expect(activeRecordModels([user])).toBe(`class User < ApplicationRecord
  self.table_name = "User"
  self.primary_key = "userId"

  attribute :userId, default: -> { SecureRandom.uuid }

  validates :name, presence: true
end`)
  })

  it('generates has_and_belongs_to_many for an implicit many-to-many relation', () => {
    const post = makeModel({
      name: 'Post',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({
          name: 'tags',
          type: 'Tag',
          kind: 'object',
          isList: true,
          relationName: 'PostToTag',
        }),
      ],
    })
    const tag = makeModel({
      name: 'Tag',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({
          name: 'posts',
          type: 'Post',
          kind: 'object',
          isList: true,
          relationName: 'PostToTag',
        }),
      ],
    })

    expect(activeRecordModels([post], [post, tag])).toBe(`class Post < ApplicationRecord
  self.table_name = "Post"

  attribute :id, default: -> { SecureRandom.uuid }

  has_and_belongs_to_many :tags, join_table: "_PostToTag", foreign_key: "A", association_foreign_key: "B"
end`)

    expect(activeRecordModels([tag], [post, tag])).toBe(`class Tag < ApplicationRecord
  self.table_name = "Tag"

  attribute :id, default: -> { SecureRandom.uuid }

  has_and_belongs_to_many :posts, join_table: "_PostToTag", foreign_key: "B", association_foreign_key: "A"
end`)
  })

  it('uses the relation name for the join table of a named implicit many-to-many relation', () => {
    const post = makeModel({
      name: 'Post',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({
          name: 'tags',
          type: 'Tag',
          kind: 'object',
          isList: true,
          relationName: 'PostTags',
        }),
      ],
    })
    const tag = makeModel({
      name: 'Tag',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({
          name: 'posts',
          type: 'Post',
          kind: 'object',
          isList: true,
          relationName: 'PostTags',
        }),
      ],
    })

    expect(activeRecordModels([post], [post, tag])).toBe(`class Post < ApplicationRecord
  self.table_name = "Post"

  attribute :id, default: -> { SecureRandom.uuid }

  has_and_belongs_to_many :tags, join_table: "_PostTags", foreign_key: "A", association_foreign_key: "B"
end`)
  })

  it('uses @map and @@map database names for table, foreign key, and primary key options', () => {
    const user = makeModel({
      name: 'User',
      dbName: 'users',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({
          name: 'posts',
          type: 'Post',
          kind: 'object',
          isList: true,
          relationName: 'PostToUser',
        }),
      ],
    })
    const post = makeModel({
      name: 'Post',
      dbName: 'posts',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({ name: 'userId', type: 'String', dbName: 'user_id', isReadOnly: true }),
        makeField({
          name: 'user',
          type: 'User',
          kind: 'object',
          relationName: 'PostToUser',
          relationFromFields: ['userId'],
          relationToFields: ['id'],
        }),
      ],
    })

    expect(activeRecordModels([user], [user, post])).toBe(`class User < ApplicationRecord
  attribute :id, default: -> { SecureRandom.uuid }

  has_many :posts, dependent: :restrict_with_error
end`)

    expect(activeRecordModels([post], [user, post])).toBe(`class Post < ApplicationRecord
  attribute :id, default: -> { SecureRandom.uuid }

  belongs_to :user, inverse_of: :posts
end`)
  })

  it('adds primary_key option when belongs_to references a non-id column', () => {
    const user = makeModel({
      name: 'User',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({ name: 'email', type: 'String', isUnique: true }),
      ],
    })
    const post = makeModel({
      name: 'Post',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({ name: 'userEmail', type: 'String', isReadOnly: true }),
        makeField({
          name: 'user',
          type: 'User',
          kind: 'object',
          relationName: 'PostToUser',
          relationFromFields: ['userEmail'],
          relationToFields: ['email'],
        }),
      ],
    })

    expect(activeRecordModels([post], [user, post])).toBe(`class Post < ApplicationRecord
  self.table_name = "Post"

  attribute :id, default: -> { SecureRandom.uuid }

  belongs_to :user, foreign_key: "userEmail", primary_key: "email"
end`)
  })

  it('leaves the documentation in the schema', () => {
    const user = makeModel({
      name: 'User',
      documentation: 'Application user account.',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
      ],
    })

    expect(activeRecordModels([user])).toBe(`class User < ApplicationRecord
  self.table_name = "User"

  attribute :id, default: -> { SecureRandom.uuid }
end`)
  })

  it('writes the conventional pair with no options, but the plural inverse Rails does not infer', () => {
    const user = makeModel({
      name: 'User',
      dbName: 'users',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'profile',
          type: 'Profile',
          kind: 'object',
          isRequired: false,
          relationName: 'ProfileToUser',
        }),
        makeField({
          name: 'todos',
          type: 'Todo',
          kind: 'object',
          isList: true,
          relationName: 'TodoToUser',
        }),
      ],
    })
    const profile = makeModel({
      name: 'Profile',
      dbName: 'profiles',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'userId',
          type: 'Int',
          dbName: 'user_id',
          isUnique: true,
          isReadOnly: true,
        }),
        makeField({
          name: 'user',
          type: 'User',
          kind: 'object',
          relationName: 'ProfileToUser',
          relationFromFields: ['userId'],
          relationToFields: ['id'],
        }),
      ],
    })
    const todo = makeModel({
      name: 'Todo',
      dbName: 'todos',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'userId', type: 'Int', dbName: 'user_id', isReadOnly: true }),
        makeField({
          name: 'user',
          type: 'User',
          kind: 'object',
          relationName: 'TodoToUser',
          relationFromFields: ['userId'],
          relationToFields: ['id'],
        }),
      ],
    })
    const all = [user, profile, todo]

    expect(activeRecordModels([user], all)).toBe(`class User < ApplicationRecord
  has_one :profile, dependent: :restrict_with_error
  has_many :todos, dependent: :restrict_with_error
end`)
    expect(activeRecordModels([profile], all)).toBe(`class Profile < ApplicationRecord
  validates :user_id, uniqueness: true

  belongs_to :user
end`)
    expect(activeRecordModels([todo], all)).toBe(`class Todo < ApplicationRecord
  belongs_to :user, inverse_of: :todos
end`)
  })

  it('keeps inverse_of when the belongs_to is named otherwise than its class', () => {
    const user = makeModel({
      name: 'User',
      dbName: 'users',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'posts',
          type: 'Post',
          kind: 'object',
          isList: true,
          relationName: 'PostToUser',
        }),
      ],
    })
    const post = makeModel({
      name: 'Post',
      dbName: 'posts',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'authorId',
          type: 'Int',
          dbName: 'author_id',
          isReadOnly: true,
        }),
        makeField({
          name: 'author',
          type: 'User',
          kind: 'object',
          relationName: 'PostToUser',
          relationFromFields: ['authorId'],
          relationToFields: ['id'],
        }),
      ],
    })

    expect(activeRecordModels([post], [user, post])).toBe(`class Post < ApplicationRecord
  belongs_to :author, class_name: "User", inverse_of: :posts
end`)
    expect(activeRecordModels([user], [user, post])).toBe(`class User < ApplicationRecord
  has_many :posts, foreign_key: "author_id", inverse_of: :author, dependent: :restrict_with_error
end`)
  })

  it('generates two belongs_to for a self-referencing relation', () => {
    const user = makeModel({
      name: 'User',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({
          name: 'followers',
          type: 'Follow',
          kind: 'object',
          isList: true,
          relationName: 'Follower',
        }),
        makeField({
          name: 'following',
          type: 'Follow',
          kind: 'object',
          isList: true,
          relationName: 'Following',
        }),
      ],
    })
    const follow = makeModel({
      name: 'Follow',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({ name: 'followerId', type: 'String', isReadOnly: true }),
        makeField({ name: 'followingId', type: 'String', isReadOnly: true }),
        makeField({
          name: 'follower',
          type: 'User',
          kind: 'object',
          relationName: 'Following',
          relationFromFields: ['followerId'],
          relationToFields: ['id'],
        }),
        makeField({
          name: 'following',
          type: 'User',
          kind: 'object',
          relationName: 'Follower',
          relationFromFields: ['followingId'],
          relationToFields: ['id'],
        }),
      ],
    })

    expect(activeRecordModels([follow], [user, follow])).toBe(`class Follow < ApplicationRecord
  self.table_name = "Follow"

  attribute :id, default: -> { SecureRandom.uuid }

  belongs_to :follower, class_name: "User", foreign_key: "followerId", inverse_of: :following
  belongs_to :following, class_name: "User", foreign_key: "followingId", inverse_of: :followers
end`)

    expect(activeRecordModels([user], [user, follow])).toBe(`class User < ApplicationRecord
  self.table_name = "User"

  attribute :id, default: -> { SecureRandom.uuid }

  has_many :followers, class_name: "Follow", foreign_key: "followingId", inverse_of: :following,
                       dependent: :restrict_with_error
  has_many :following, class_name: "Follow", foreign_key: "followerId", inverse_of: :follower,
                       dependent: :restrict_with_error
end`)
  })

  it('uses @map database names for enum symbol and enum values', () => {
    const enums: DMMF.DatamodelEnum[] = [
      {
        name: 'Role',
        values: [
          { name: 'ADMIN', dbName: 'admin' },
          { name: 'USER', dbName: 'user' },
        ],
        dbName: null,
      },
    ]
    const user = makeModel({
      name: 'User',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({ name: 'role', type: 'Role', kind: 'enum', dbName: 'user_role' }),
      ],
    })

    expect(activeRecordModels([user], [user], enums)).toBe(`class User < ApplicationRecord
  self.table_name = "User"

  attribute :id, default: -> { SecureRandom.uuid }

  enum :user_role, { admin: "admin", user: "user" }, validate: true
end`)
  })

  it('combines primary_key and optional options on belongs_to', () => {
    const user = makeModel({
      name: 'User',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({ name: 'email', type: 'String', isUnique: true }),
      ],
    })
    const post = makeModel({
      name: 'Post',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({ name: 'userEmail', type: 'String', isRequired: false, isReadOnly: true }),
        makeField({
          name: 'user',
          type: 'User',
          kind: 'object',
          isRequired: false,
          relationName: 'PostToUser',
          relationFromFields: ['userEmail'],
          relationToFields: ['email'],
        }),
      ],
    })

    expect(activeRecordModels([post], [user, post])).toBe(`class Post < ApplicationRecord
  self.table_name = "Post"

  attribute :id, default: -> { SecureRandom.uuid }

  belongs_to :user, foreign_key: "userEmail", primary_key: "email", optional: true
end`)
  })

  it('sets self.primary_key from an @map-ped id column', () => {
    const user = makeModel({
      name: 'User',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          dbName: 'user_id',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({ name: 'name', type: 'String' }),
      ],
    })

    expect(activeRecordModels([user])).toBe(`class User < ApplicationRecord
  self.table_name = "User"
  self.primary_key = "user_id"

  attribute :user_id, default: -> { SecureRandom.uuid }

  validates :name, presence: true
end`)
  })

  it('converts camelCase association names to snake_case symbols', () => {
    const agent = makeModel({
      name: 'Agent',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({
          name: 'missionAssignments',
          type: 'MissionAssignment',
          kind: 'object',
          isList: true,
          relationName: 'AgentToMissionAssignment',
        }),
      ],
    })
    const assignment = makeModel({
      name: 'MissionAssignment',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({ name: 'agentId', type: 'String', isReadOnly: true }),
        makeField({
          name: 'agent',
          type: 'Agent',
          kind: 'object',
          relationName: 'AgentToMissionAssignment',
          relationFromFields: ['agentId'],
          relationToFields: ['id'],
        }),
      ],
    })

    expect(activeRecordModels([agent], [agent, assignment])).toBe(`class Agent < ApplicationRecord
  self.table_name = "Agent"

  attribute :id, default: -> { SecureRandom.uuid }

  has_many :mission_assignments, foreign_key: "agentId", inverse_of: :agent, dependent: :restrict_with_error
end`)
  })

  it('names the inverse of each side of a self-referencing tree', () => {
    const category = makeModel({
      name: 'Category',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'parentId', type: 'Int', isRequired: false, isReadOnly: true }),
        makeField({
          name: 'parent',
          type: 'Category',
          kind: 'object',
          isRequired: false,
          relationName: 'tree',
          relationFromFields: ['parentId'],
          relationToFields: ['id'],
        }),
        makeField({
          name: 'children',
          type: 'Category',
          kind: 'object',
          isList: true,
          relationName: 'tree',
        }),
      ],
    })

    expect(activeRecordModels([category])).toBe(`class Category < ApplicationRecord
  self.table_name = "Category"

  belongs_to :parent, class_name: "Category", foreign_key: "parentId", optional: true, inverse_of: :children
  has_many :children, class_name: "Category", foreign_key: "parentId", inverse_of: :parent, dependent: :nullify
end`)
  })
})

describe('timestamps', () => {
  it('aliases created_at and updated_at to Prisma-named columns', () => {
    const post = makeModel({
      name: 'Post',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'createdAt',
          type: 'DateTime',
          hasDefaultValue: true,
          default: { name: 'now', args: [] },
        }),
        makeField({ name: 'updatedAt', type: 'DateTime', isUpdatedAt: true }),
      ],
    })

    expect(activeRecordModels([post])).toBe(`class Post < ApplicationRecord
  self.table_name = "Post"

  alias_attribute :created_at, :createdAt
  alias_attribute :updated_at, :updatedAt
end`)
  })

  it('aliases updated_at to an @updatedAt column of any name', () => {
    const post = makeModel({
      name: 'Post',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'touchedAt', type: 'DateTime', isUpdatedAt: true, dbName: 'touched_at' }),
      ],
    })

    expect(activeRecordModels([post])).toBe(`class Post < ApplicationRecord
  self.table_name = "Post"

  alias_attribute :updated_at, :touched_at
end`)
  })

  it('needs no alias when the columns already carry the Rails names', () => {
    const post = makeModel({
      name: 'Post',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'createdAt',
          type: 'DateTime',
          dbName: 'created_at',
          hasDefaultValue: true,
          default: { name: 'now', args: [] },
        }),
        makeField({ name: 'updatedAt', type: 'DateTime', dbName: 'updated_at', isUpdatedAt: true }),
      ],
    })

    expect(activeRecordModels([post])).toBe(`class Post < ApplicationRecord
  self.table_name = "Post"
end`)
  })

  it('lists the aliases after the attribute defaults', () => {
    const post = makeModel({
      name: 'Post',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({ name: 'updatedAt', type: 'DateTime', isUpdatedAt: true }),
      ],
    })

    expect(activeRecordModels([post])).toBe(`class Post < ApplicationRecord
  self.table_name = "Post"

  attribute :id, default: -> { SecureRandom.uuid }
  alias_attribute :updated_at, :updatedAt
end`)
  })
})

describe('uuid v7 primary key', () => {
  it('generates a SecureRandom.uuid_v7 attribute default', () => {
    const event = makeModel({
      name: 'Event',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [7] },
        }),
        makeField({ name: 'name', type: 'String' }),
      ],
    })

    expect(activeRecordModels([event])).toBe(`class Event < ApplicationRecord
  self.table_name = "Event"

  attribute :id, default: -> { SecureRandom.uuid_v7 }

  validates :name, presence: true
end`)
  })
})

describe('ulid primary key', () => {
  it('generates a ULID.generate attribute default', () => {
    const ticket = makeModel({
      name: 'Ticket',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'ulid', args: [] },
        }),
        makeField({ name: 'label', type: 'String' }),
      ],
    })

    expect(activeRecordModels([ticket])).toBe(`class Ticket < ApplicationRecord
  self.table_name = "Ticket"

  attribute :id, default: -> { ULID.generate }

  validates :label, presence: true
end`)
  })
})

describe('cuid and nanoid primary keys', () => {
  it('generates each id with its gem', () => {
    const fields = (name: string, args: (string | number)[]) => [
      makeField({
        name: 'id',
        type: 'String',
        isId: true,
        hasDefaultValue: true,
        default: { name, args },
      }),
    ]
    const models = [
      makeModel({ name: 'Legacy', fields: fields('cuid', []) }),
      makeModel({ name: 'Badge', fields: fields('cuid', [2]) }),
      makeModel({ name: 'Coupon', fields: fields('nanoid', [10]) }),
      makeModel({ name: 'Voucher', fields: fields('nanoid', []) }),
    ]

    expect(activeRecordModels(models)).toBe(`class Legacy < ApplicationRecord
  self.table_name = "Legacy"

  attribute :id, default: -> { Cuid.generate }
end

class Badge < ApplicationRecord
  self.table_name = "Badge"

  attribute :id, default: -> { Cuid2.call }
end

class Coupon < ApplicationRecord
  self.table_name = "Coupon"

  attribute :id, default: -> { Nanoid.generate(size: 10) }
end

class Voucher < ApplicationRecord
  self.table_name = "Voucher"

  attribute :id, default: -> { Nanoid.generate }
end`)
  })
})

describe('single-table inheritance guard', () => {
  it('disables the inheritance column when a scalar column is named type', () => {
    const keyword = makeModel({
      name: 'Keyword',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({ name: 'type', type: 'String' }),
      ],
    })

    expect(activeRecordModels([keyword])).toBe(`class Keyword < ApplicationRecord
  self.table_name = "Keyword"
  self.inheritance_column = nil

  attribute :id, default: -> { SecureRandom.uuid }

  validates :type, presence: true
end`)
  })
})

describe('literal defaults', () => {
  it('writes each scalar default as a Ruby value', () => {
    const torture = makeModel({
      name: 'Torture',
      fields: [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'flag', type: 'Boolean', hasDefaultValue: true, default: false }),
        makeField({ name: 'negInt', type: 'Int', hasDefaultValue: true, default: -42 }),
        makeField({ name: 'ratio', type: 'Float', hasDefaultValue: true, default: -2.5 }),
        makeField({
          name: 'big',
          type: 'BigInt',
          hasDefaultValue: true,
          default: '9007199254740993',
        }),
        makeField({
          name: 'precise',
          type: 'Decimal',
          hasDefaultValue: true,
          default: '12345.6789',
        }),
        makeField({
          name: 'quoted',
          type: 'String',
          hasDefaultValue: true,
          default: 'it\'s a "quote", a \\ backslash and #{not} interpolated',
        }),
        makeField({
          name: 'born',
          type: 'DateTime',
          hasDefaultValue: true,
          default: '2020-02-29T23:59:59.999+00:00',
        }),
        makeField({
          name: 'doc',
          type: 'Json',
          hasDefaultValue: true,
          default: '{"a":1,"b":[true,null,"x"]}',
        }),
        makeField({ name: 'raw', type: 'Bytes', hasDefaultValue: true, default: 'AQID' }),
        makeField({
          name: 'stamp',
          type: 'DateTime',
          hasDefaultValue: true,
          default: { name: 'now', args: [] },
        }),
        makeField({
          name: 'code',
          type: 'String',
          hasDefaultValue: true,
          default: { name: 'dbgenerated', args: ['md5(random()::text)'] },
        }),
      ],
    })

    expect(activeRecordModels([torture])).toBe(`class Torture < ApplicationRecord
  self.table_name = "Torture"

  attribute :flag, default: false
  attribute :negInt, default: -42
  attribute :ratio, default: -2.5
  attribute :big, default: 9_007_199_254_740_993
  attribute :precise, default: BigDecimal("12345.6789")
  attribute :quoted, default: "it's a \\"quote\\", a \\\\ backslash and \\#{not} interpolated"
  attribute :born, default: Time.iso8601("2020-02-29T23:59:59.999+00:00")
  attribute :doc, default: -> { JSON.parse("{\\"a\\":1,\\"b\\":[true,null,\\"x\\"]}") }
end`)
  })

  it('hands a list default out of a lambda, an empty one when the schema has none', () => {
    const inventory = makeModel({
      name: 'Inventory',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'tags',
          type: 'String',
          isList: true,
          hasDefaultValue: true,
          default: [],
        }),
        makeField({
          name: 'codes',
          type: 'Int',
          isList: true,
          hasDefaultValue: true,
          default: [1, 2, 3],
        }),
        makeField({
          name: 'labels',
          type: 'String',
          isList: true,
          hasDefaultValue: true,
          default: ['a', 'b'],
        }),
        makeField({ name: 'weights', type: 'Float', isList: true }),
        makeField({ name: 'audiences', type: 'Visibility', kind: 'enum', isList: true }),
      ],
    })

    expect(activeRecordModels([inventory])).toBe(`class Inventory < ApplicationRecord
  self.table_name = "Inventory"

  attribute :tags, default: -> { [] }
  attribute :codes, default: -> { [ 1, 2, 3 ] }
  attribute :labels, default: -> { %w[a b] }
  attribute :weights, default: -> { [] }
  attribute :audiences, default: -> { [] }
end`)
  })

  it('names the enum default by its key, and prefixes a key Ruby already defines', () => {
    const enums: DMMF.DatamodelEnum[] = [
      {
        name: 'Visibility',
        values: [
          { name: 'PUBLIC', dbName: 'public' },
          { name: 'LINK_ONLY', dbName: 'link_only' },
        ],
        dbName: null,
      },
    ]
    const board = makeModel({
      name: 'Board',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'visibility',
          type: 'Visibility',
          kind: 'enum',
          hasDefaultValue: true,
          default: 'LINK_ONLY',
        }),
        makeField({
          name: 'fallback',
          type: 'Visibility',
          kind: 'enum',
          isRequired: false,
          hasDefaultValue: true,
          default: 'PUBLIC',
        }),
      ],
    })

    expect(activeRecordModels([board], [board], enums)).toBe(`class Board < ApplicationRecord
  self.table_name = "Board"

  enum :visibility, { public: "public", link_only: "link_only" }, default: :link_only, prefix: true, validate: true
  enum :fallback, { public: "public", link_only: "link_only" }, default: :public, prefix: true,
                                                                validate: { allow_nil: true }
end`)
  })
})

describe('validations', () => {
  it('validates presence, length and uniqueness from the column definitions', () => {
    const profile = makeModel({
      name: 'Profile',
      uniqueFields: [['nickname', 'accountId']],
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'accountId', type: 'String', isUnique: true, isReadOnly: true }),
        makeField({
          name: 'account',
          type: 'Account',
          kind: 'object',
          relationName: 'AccountToProfile',
          relationFromFields: ['accountId'],
          relationToFields: ['id'],
        }),
        makeField({ name: 'email', type: 'String', isUnique: true }),
        makeField({
          name: 'nickname',
          type: 'String',
          nativeType: ['VarChar', ['64']],
          hasDefaultValue: true,
          default: 'anonymous',
        }),
        makeField({ name: 'bio', type: 'String', isRequired: false, nativeType: ['Text', []] }),
        makeField({ name: 'handle', type: 'String', isRequired: false, isUnique: true }),
        makeField({ name: 'code', type: 'String', nativeType: ['Char', ['3']] }),
        makeField({ name: 'age', type: 'Int', isRequired: false }),
        makeField({ name: 'score', type: 'Float' }),
        makeField({ name: 'verified', type: 'Boolean' }),
        makeField({ name: 'meta', type: 'Json' }),
        makeField({ name: 'avatar', type: 'Bytes' }),
        makeField({ name: 'pinned', type: 'Boolean', hasDefaultValue: true, default: false }),
        makeField({ name: 'tags', type: 'String', isList: true }),
        makeField({ name: 'createdAt', type: 'DateTime' }),
        makeField({ name: 'updatedAt', type: 'DateTime', isUpdatedAt: true }),
      ],
    })

    expect(activeRecordModels([profile])).toBe(`class Profile < ApplicationRecord
  self.table_name = "Profile"

  attribute :nickname, default: "anonymous"
  attribute :pinned, default: false
  attribute :tags, default: -> { [] }
  alias_attribute :created_at, :createdAt
  alias_attribute :updated_at, :updatedAt

  validates :accountId, uniqueness: true
  validates :email, presence: true, uniqueness: true
  validates :nickname, length: { maximum: 64 }, uniqueness: { scope: :accountId }
  validates :handle, uniqueness: { allow_nil: true }
  validates :code, presence: true, length: { maximum: 3 }
  validates :score, presence: true
  validates :verified, inclusion: { in: [ true, false ] }
  validates :meta, exclusion: { in: [ nil ] }
  validates :avatar, exclusion: { in: [ nil ] }

  belongs_to :account, foreign_key: "accountId"
end`)
  })

  it('scopes a wider @@unique on the remaining columns and skips composite key parts', () => {
    const stock = makeModel({
      name: 'Stock',
      primaryKey: { name: null, fields: ['x', 'y'] },
      uniqueFields: [['country', 'code', 'shelf']],
      fields: [
        makeField({ name: 'x', type: 'Int' }),
        makeField({ name: 'y', type: 'Int' }),
        makeField({ name: 'country', type: 'String', dbName: 'country_code' }),
        makeField({ name: 'code', type: 'String' }),
        makeField({ name: 'shelf', type: 'String', dbName: 'shelf_no' }),
      ],
    })

    expect(activeRecordModels([stock])).toBe(`class Stock < ApplicationRecord
  self.table_name = "Stock"
  self.primary_key = %w[x y]

  validates :country_code, presence: true, uniqueness: { scope: %i[code shelf_no] }
  validates :code, presence: true
  validates :shelf_no, presence: true
end`)
  })
})

describe('a whole model from its constraints', () => {
  it('writes the Todo of the README', () => {
    const todo = makeModel({
      name: 'Todo',
      dbName: 'todos',
      fields: [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'title', type: 'String', nativeType: ['VarChar', ['255']] }),
        makeField({ name: 'completed', type: 'Boolean', hasDefaultValue: true, default: false }),
        makeField({
          name: 'createdAt',
          type: 'DateTime',
          dbName: 'created_at',
          hasDefaultValue: true,
          default: { name: 'now', args: [] },
        }),
        makeField({ name: 'updatedAt', type: 'DateTime', dbName: 'updated_at', isUpdatedAt: true }),
      ],
    })

    expect(activeRecordModels([todo])).toBe(`class Todo < ApplicationRecord
  attribute :completed, default: false

  validates :title, presence: true, length: { maximum: 255 }
end`)
  })
})

describe('dependent', () => {
  it('follows the foreign key action of each relation', () => {
    const parent = makeModel({
      name: 'Parent',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'cascades',
          type: 'Child',
          kind: 'object',
          isList: true,
          relationName: 'cascade',
        }),
        makeField({
          name: 'nulls',
          type: 'Child',
          kind: 'object',
          isList: true,
          relationName: 'setnull',
        }),
        makeField({
          name: 'noacts',
          type: 'Child',
          kind: 'object',
          isList: true,
          relationName: 'noaction',
        }),
        makeField({
          name: 'defaults',
          type: 'Child',
          kind: 'object',
          isList: true,
          relationName: 'setdefault',
        }),
        makeField({
          name: 'unspecified',
          type: 'Child',
          kind: 'object',
          isList: true,
          relationName: 'implicit',
        }),
        makeField({
          name: 'optionals',
          type: 'Child',
          kind: 'object',
          isList: true,
          relationName: 'optional',
        }),
      ],
    })
    const relation = (name: string, relationName: string, extra: Partial<DMMF.Field> = {}) =>
      makeField({
        name,
        type: 'Parent',
        kind: 'object',
        relationName,
        relationFromFields: [`${name}Id`],
        relationToFields: ['id'],
        ...extra,
      })
    const child = makeModel({
      name: 'Child',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'cascadeId', type: 'Int', isReadOnly: true }),
        relation('cascade', 'cascade', { relationOnDelete: 'Cascade' }),
        makeField({ name: 'setNullId', type: 'Int', isRequired: false, isReadOnly: true }),
        relation('setNull', 'setnull', { isRequired: false, relationOnDelete: 'SetNull' }),
        makeField({ name: 'noActionId', type: 'Int', isReadOnly: true }),
        relation('noAction', 'noaction', { relationOnDelete: 'NoAction' }),
        makeField({ name: 'setDefaultId', type: 'Int', isReadOnly: true }),
        relation('setDefault', 'setdefault', { relationOnDelete: 'SetDefault' }),
        makeField({ name: 'implicitId', type: 'Int', isReadOnly: true }),
        relation('implicit', 'implicit'),
        makeField({ name: 'optionalId', type: 'Int', isRequired: false, isReadOnly: true }),
        relation('optional', 'optional', { isRequired: false }),
      ],
    })

    expect(activeRecordModels([parent], [parent, child])).toBe(`class Parent < ApplicationRecord
  self.table_name = "Parent"

  has_many :cascades, class_name: "Child", foreign_key: "cascadeId", inverse_of: :cascade, dependent: :destroy
  has_many :nulls, class_name: "Child", foreign_key: "setNullId", inverse_of: :set_null, dependent: :nullify
  has_many :noacts, class_name: "Child", foreign_key: "noActionId", inverse_of: :no_action,
                    dependent: :restrict_with_error
  has_many :defaults, class_name: "Child", foreign_key: "setDefaultId", inverse_of: :set_default
  has_many :unspecified, class_name: "Child", foreign_key: "implicitId", inverse_of: :implicit,
                         dependent: :restrict_with_error
  has_many :optionals, class_name: "Child", foreign_key: "optionalId", inverse_of: :optional, dependent: :nullify
end`)
  })
})

describe('implicit order', () => {
  it('orders a random primary key by the created timestamp', () => {
    const fields = (def: DMMF.FieldDefault) => [
      makeField({ name: 'id', type: 'String', isId: true, hasDefaultValue: true, default: def }),
      makeField({
        name: 'createdAt',
        type: 'DateTime',
        dbName: 'created_at',
        hasDefaultValue: true,
        default: { name: 'now', args: [] },
      }),
    ]
    const v4 = makeModel({ name: 'V4', fields: fields({ name: 'uuid', args: [4] }) })
    const v7 = makeModel({ name: 'V7', fields: fields({ name: 'uuid', args: [7] }) })
    const bare = makeModel({
      name: 'Bare',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'cuid', args: [] },
        }),
      ],
    })

    expect(activeRecordModels([v4])).toContain('self.implicit_order_column = "created_at"')
    expect(activeRecordModels([v7])).not.toContain('implicit_order_column')
    expect(activeRecordModels([bare])).not.toContain('implicit_order_column')
  })
})

describe('line length', () => {
  it('moves the keywords down when the first one would not fit', () => {
    const enums: DMMF.DatamodelEnum[] = [
      {
        name: 'Status',
        values: [
          { name: 'ACTIVE', dbName: null },
          { name: 'INACTIVE', dbName: null },
          { name: 'PENDING_REVIEW', dbName: null },
        ],
        dbName: null,
      },
    ]
    const profile = makeModel({
      name: 'Profile',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'mood', type: 'Status', kind: 'enum', isRequired: false }),
        makeField({
          name: 'visibility',
          type: 'Status',
          kind: 'enum',
          hasDefaultValue: true,
          default: 'PENDING_REVIEW',
        }),
      ],
    })

    expect(activeRecordModels([profile], [profile], enums)).toBe(`class Profile < ApplicationRecord
  self.table_name = "Profile"

  enum :mood, { active: "ACTIVE", inactive: "INACTIVE", pending_review: "PENDING_REVIEW" },
       validate: { allow_nil: true }
  enum :visibility, { active: "ACTIVE", inactive: "INACTIVE", pending_review: "PENDING_REVIEW" },
       default: :pending_review, prefix: true, validate: true
end`)
  })
})

describe('@ar. annotations', () => {
  it('turns each validator call into an option of the field, replacing what the schema implied', () => {
    const enums: DMMF.DatamodelEnum[] = [
      { name: 'Role', values: [{ name: 'ADMIN', dbName: null }], dbName: null },
    ]
    const todo = makeModel({
      name: 'Todo',
      documentation: 'A thing to do.\n@ar.validates :title, :note, presence: true, on: :create',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'title',
          type: 'String',
          nativeType: ['VarChar', ['255']],
          documentation:
            '@ar.presence(message: "Title is required")\n@ar.length(maximum: 255, message: "Title must be 255 characters or less")',
        }),
        makeField({
          name: 'email',
          type: 'String',
          isUnique: true,
          documentation: '@ar.format(with: URI::MailTo::EMAIL_REGEXP)',
        }),
        makeField({
          name: 'note',
          type: 'String',
          isRequired: false,
          documentation: '@ar.presence',
        }),
        makeField({
          name: 'age',
          type: 'Int',
          isRequired: false,
          documentation: 'In years.\n@ar.numericality(only_integer: true, greater_than: 0)',
        }),
        makeField({
          name: 'role',
          type: 'Role',
          kind: 'enum',
          documentation: '@ar.inclusion(in: %w[ADMIN])',
        }),
      ],
    })

    expect(activeRecordModels([todo], [todo], enums)).toBe(`class Todo < ApplicationRecord
  self.table_name = "Todo"

  enum :role, { admin: "ADMIN" }, validate: true

  validates :title, presence: { message: "Title is required" },
                    length: { maximum: 255, message: "Title must be 255 characters or less" }
  validates :email, presence: true, uniqueness: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :note, presence: true
  validates :age, numericality: { only_integer: true, greater_than: 0 }
  validates :role, inclusion: { in: %w[ADMIN] }
  validates :title, :note, presence: true, on: :create
end`)
    expect(activeRecordModels([todo], [todo], enums)).not.toContain('A thing to do.')
  })
})

describe('translated messages', () => {
  const todo = makeModel({
    name: 'Todo',
    documentation: 'A thing to do.\n@ar.name(ja: "やること", en: "Todo")',
    fields: [
      makeField({ name: 'id', type: 'Int', isId: true }),
      makeField({
        name: 'title',
        type: 'String',
        documentation: [
          '@ar.name(ja: "タイトル", en: "Title")',
          '@ar.presence(message: { ja: "を入力してください", en: "is required" })',
          '',
          '@ar.length(maximum: 255, too_long: { ja: "%{count}文字以内で入力してください", en: "must be %{count} characters or less" })',
        ].join('\n'),
      }),
      makeField({
        name: 'note',
        type: 'String',
        isRequired: false,
        documentation: '@ar.length(message: { ja: "の長さが不正です" }, in: 1..10)',
      }),
    ],
  })

  it('keeps only the Ruby options in the model', () => {
    expect(activeRecordModels([todo])).toBe(`class Todo < ApplicationRecord
  self.table_name = "Todo"

  validates :title, presence: true, length: { maximum: 255 }
  validates :note, length: { in: 1..10 }
end`)
  })

  it('writes models/<model>/<locale>.yml, one per language, under the keys Rails reads', () => {
    expect(activeRecordLocaleFiles([todo])).toStrictEqual([
      {
        fileName: 'models/todo/en.yml',
        code: `en:
  activerecord:
    models:
      todo: "Todo"
    attributes:
      todo:
        title: "Title"
    errors:
      models:
        todo:
          attributes:
            title:
              blank: "is required"
              too_long: "must be %{count} characters or less"
`,
      },
      {
        fileName: 'models/todo/ja.yml',
        code: `ja:
  activerecord:
    models:
      todo: "やること"
    attributes:
      todo:
        title: "タイトル"
    errors:
      models:
        todo:
          attributes:
            title:
              blank: "を入力してください"
              too_long: "%{count}文字以内で入力してください"
            note:
              too_long: "の長さが不正です"
              too_short: "の長さが不正です"
              wrong_length: "の長さが不正です"
`,
      },
    ])
  })

  it('writes nothing when no call carries a translation', () => {
    const bare = makeModel({
      name: 'Bare',
      fields: [makeField({ name: 'id', type: 'Int', isId: true, documentation: '@ar.presence' })],
    })
    expect(activeRecordLocaleFiles([bare])).toStrictEqual([])
  })

  // The guide's layout keeps each model's names and messages in its own
  // directory: a second model never joins the first's file, a locale only one
  // of them names is only that one's file, and a model with nothing
  // translated has no directory at all.
  it('gives each model its own directory with only the locales it names', () => {
    const tag = makeModel({
      name: 'Tag',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'label', type: 'String', documentation: '@ar.name(ja: "ラベル")' }),
      ],
    })
    const bare = makeModel({
      name: 'Bare',
      fields: [makeField({ name: 'id', type: 'Int', isId: true, documentation: '@ar.presence' })],
    })
    const files = activeRecordLocaleFiles([todo, bare, tag])
    expect(files.map((f) => f.fileName)).toStrictEqual([
      'models/todo/en.yml',
      'models/todo/ja.yml',
      'models/tag/ja.yml',
    ])
    expect(files[2]?.code).toBe(`ja:
  activerecord:
    attributes:
      tag:
        label: "ラベル"
`)
    expect(files[1]?.code).not.toContain('tag')
  })
})

describe('@ar. problems', () => {
  const todo = (documentation: string) =>
    makeModel({
      name: 'Todo',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'title', type: 'String', documentation }),
      ],
    })

  it('accepts the description above the calls, blanks and other annotations between them', () => {
    const model = todo(
      [
        'やることの内容。必須で、140 文字以内。',
        '@ar.name(ja: "タイトル", en: "Title")',
        '@ar.presence(message: { ja: "を入力してください", en: "can\'t be blank" })',
        '',
        '@z.min(1)',
        '@ar.length(maximum: 140,too_long: { ja: "は%{count}文字以内で入力してください", en: "is too long (maximum is %{count} characters)" })',
      ].join('\n'),
    )
    expect(activeRecordProblems([model])).toStrictEqual([])
    expect(activeRecordModels([model])).toContain(
      'validates :title, presence: true, length: { maximum: 140 }',
    )
  })

  it('refuses a description written after a call', () => {
    expect(activeRecordProblems([todo('@ar.presence\nThe title.')])).toStrictEqual([
      'field Todo.title: the line "The title." comes after an @ar. call; write the description above them',
    ])
  })

  it('refuses a call that does not close on its line and one that is not a call', () => {
    expect(activeRecordProblems([todo('@ar.length(maximum: 140,')])).toStrictEqual([
      'field Todo.title: the @ar. call "length(maximum: 140," does not close its parentheses on its line; an @ar. call is one /// line',
    ])
    expect(activeRecordProblems([todo('@ar.presence: true')])).toStrictEqual([
      'field Todo.title: the @ar. call "presence: true" is not name or name(arguments)',
    ])
  })

  it('refuses a call written over several /// lines', () => {
    const model = todo(
      [
        '@ar.length(',
        '  maximum: 140,',
        '  too_long: { ja: "は%{count}文字以内で入力してください" }',
        ')',
      ].join('\n'),
    )
    expect(activeRecordProblems([model])).toStrictEqual([
      'field Todo.title: the @ar. call "length(" does not close its parentheses on its line; an @ar. call is one /// line',
      'field Todo.title: the line "maximum: 140," comes after an @ar. call; write the description above them',
      'field Todo.title: the line "too_long: { ja: "は%{count}文字以内で入力してください" }" comes after an @ar. call; write the description above them',
      'field Todo.title: the line ")" comes after an @ar. call; write the description above them',
    ])
  })

  it('names the model for a problem on its own comment', () => {
    const model = makeModel({
      name: 'Todo',
      documentation: '@ar.validates :title, presence: true\nA thing to do.',
      fields: [makeField({ name: 'id', type: 'Int', isId: true })],
    })
    expect(activeRecordProblems([model])).toStrictEqual([
      'model Todo: the line "A thing to do." comes after an @ar. call; write the description above them',
    ])
  })

  it('keeps a model name call out of the class body', () => {
    const model = makeModel({
      name: 'Todo',
      documentation: 'A thing to do.\n@ar.name(ja: "やること", en: "Todo")',
      fields: [makeField({ name: 'id', type: 'Int', isId: true })],
    })
    expect(activeRecordProblems([model])).toStrictEqual([])
    expect(activeRecordModels([model])).toBe(`class Todo < ApplicationRecord
  self.table_name = "Todo"
end`)
    expect(activeRecordLocaleFiles([model])[0]?.code).toContain('todo: "Todo"')
  })
})

describe('message keys', () => {
  it('writes a numericality or comparison message under each key its options can raise', () => {
    const order = makeModel({
      name: 'Order',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'quantity',
          type: 'Int',
          documentation:
            '@ar.numericality(only_integer: true, greater_than: 0, message: { ja: "は1以上の整数で入力してください" })',
        }),
        makeField({
          name: 'shipsAt',
          type: 'DateTime',
          documentation:
            '@ar.comparison(greater_than_or_equal_to: :created_at, message: { ja: "は注文日以降にしてください" })',
        }),
        makeField({
          name: 'terms',
          type: 'Boolean',
          documentation: '@ar.acceptance(message: { ja: "に同意してください" })',
        }),
      ],
    })
    expect(activeRecordModels([order])).toContain(
      'validates :quantity, presence: true, numericality: { only_integer: true, greater_than: 0 }',
    )
    expect(activeRecordLocaleFiles([order])[0]?.code).toBe(`ja:
  activerecord:
    errors:
      models:
        order:
          attributes:
            quantity:
              not_a_number: "は1以上の整数で入力してください"
              not_an_integer: "は1以上の整数で入力してください"
              greater_than: "は1以上の整数で入力してください"
            shipsAt:
              greater_than_or_equal_to: "は注文日以降にしてください"
            terms:
              accepted: "に同意してください"
`)
  })
})

describe('plural forms', () => {
  it('writes one/other under a message that interpolates count, and under a model name', () => {
    const todo = makeModel({
      name: 'Todo',
      documentation: '@ar.name(en: { one: "Todo", other: "Todos" }, ja: "やること")',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'title',
          type: 'String',
          documentation:
            '@ar.length(maximum: 140, too_long: { en: { one: "is too long (maximum is 1 character)", other: "is too long (maximum is %{count} characters)" }, ja: "は%{count}文字以内で入力してください" })',
        }),
      ],
    })

    expect(activeRecordModels([todo])).toContain(
      'validates :title, presence: true, length: { maximum: 140 }',
    )
    expect(activeRecordLocaleFiles([todo])).toStrictEqual([
      {
        fileName: 'models/todo/en.yml',
        code: `en:
  activerecord:
    models:
      todo:
        one: "Todo"
        other: "Todos"
    errors:
      models:
        todo:
          attributes:
            title:
              too_long:
                one: "is too long (maximum is 1 character)"
                other: "is too long (maximum is %{count} characters)"
`,
      },
      {
        fileName: 'models/todo/ja.yml',
        code: `ja:
  activerecord:
    models:
      todo: "やること"
    errors:
      models:
        todo:
          attributes:
            title:
              too_long: "は%{count}文字以内で入力してください"
`,
      },
    ])
  })

  it('leaves a hash that is not plural forms to Ruby', () => {
    const todo = makeModel({
      name: 'Todo',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'title', type: 'String', documentation: '@ar.length(in: { min: 1 })' }),
      ],
    })
    expect(activeRecordModels([todo])).toContain(
      'validates :title, presence: true, length: { in: { min: 1 } }',
    )
    expect(activeRecordLocaleFiles([todo])).toStrictEqual([])
  })
})
