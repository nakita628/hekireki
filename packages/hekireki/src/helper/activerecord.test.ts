import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import { activeRecordModels } from './activerecord.js'

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
  self.table_name = "user"

  attribute :id, default: -> { SecureRandom.uuid }

  has_many :posts, class_name: "Post", foreign_key: "userId"
end`)

    expect(activeRecordModels([post], [user, post])).toBe(`class Post < ApplicationRecord
  self.table_name = "post"

  attribute :id, default: -> { SecureRandom.uuid }

  belongs_to :user, class_name: "User", foreign_key: "userId"
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
  self.table_name = "user"

  attribute :id, default: -> { SecureRandom.uuid }

  has_one :profile, class_name: "Profile", foreign_key: "userId"
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
  self.table_name = "post"

  attribute :id, default: -> { SecureRandom.uuid }

  belongs_to :user, class_name: "User", foreign_key: "userId", optional: true
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
  self.table_name = "user"

  attribute :id, default: -> { SecureRandom.uuid }

  enum :role, { ADMIN: "ADMIN", USER: "USER" }
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
  self.table_name = "like"
  self.primary_key = ["userId", "postId"]

  belongs_to :user, class_name: "User", foreign_key: "userId"
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
  self.table_name = "user"
  self.primary_key = "userId"

  attribute :userId, default: -> { SecureRandom.uuid }
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
  self.table_name = "post"

  attribute :id, default: -> { SecureRandom.uuid }

  has_and_belongs_to_many :tags, class_name: "Tag", join_table: "_PostToTag", foreign_key: "A", association_foreign_key: "B"
end`)

    expect(activeRecordModels([tag], [post, tag])).toBe(`class Tag < ApplicationRecord
  self.table_name = "tag"

  attribute :id, default: -> { SecureRandom.uuid }

  has_and_belongs_to_many :posts, class_name: "Post", join_table: "_PostToTag", foreign_key: "B", association_foreign_key: "A"
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
  self.table_name = "post"

  attribute :id, default: -> { SecureRandom.uuid }

  has_and_belongs_to_many :tags, class_name: "Tag", join_table: "_PostTags", foreign_key: "A", association_foreign_key: "B"
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
  self.table_name = "users"

  attribute :id, default: -> { SecureRandom.uuid }

  has_many :posts, class_name: "Post", foreign_key: "user_id"
end`)

    expect(activeRecordModels([post], [user, post])).toBe(`class Post < ApplicationRecord
  self.table_name = "posts"

  attribute :id, default: -> { SecureRandom.uuid }

  belongs_to :user, class_name: "User", foreign_key: "user_id"
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
  self.table_name = "post"

  attribute :id, default: -> { SecureRandom.uuid }

  belongs_to :user, class_name: "User", foreign_key: "userEmail", primary_key: "email"
end`)
  })

  it('renders model documentation as Ruby comments', () => {
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

    expect(activeRecordModels([user])).toBe(`# Application user account.
class User < ApplicationRecord
  self.table_name = "user"

  attribute :id, default: -> { SecureRandom.uuid }
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
  self.table_name = "follow"

  attribute :id, default: -> { SecureRandom.uuid }

  belongs_to :follower, class_name: "User", foreign_key: "followerId"
  belongs_to :following, class_name: "User", foreign_key: "followingId"
end`)

    expect(activeRecordModels([user], [user, follow])).toBe(`class User < ApplicationRecord
  self.table_name = "user"

  attribute :id, default: -> { SecureRandom.uuid }

  has_many :followers, class_name: "Follow", foreign_key: "followingId"
  has_many :following, class_name: "Follow", foreign_key: "followerId"
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
  self.table_name = "user"

  attribute :id, default: -> { SecureRandom.uuid }

  enum :user_role, { ADMIN: "admin", USER: "user" }
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
  self.table_name = "post"

  attribute :id, default: -> { SecureRandom.uuid }

  belongs_to :user, class_name: "User", foreign_key: "userEmail", primary_key: "email", optional: true
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
  self.table_name = "user"
  self.primary_key = "user_id"

  attribute :user_id, default: -> { SecureRandom.uuid }
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
  self.table_name = "agent"

  attribute :id, default: -> { SecureRandom.uuid }

  has_many :mission_assignments, class_name: "MissionAssignment", foreign_key: "agentId"
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
  self.table_name = "event"

  attribute :id, default: -> { SecureRandom.uuid_v7 }
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
  self.table_name = "ticket"

  attribute :id, default: -> { ULID.generate }
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
  self.table_name = "keyword"
  self.inheritance_column = nil

  attribute :id, default: -> { SecureRandom.uuid }
end`)
  })
})
