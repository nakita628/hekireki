import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import {
  activeRecordModelFiles,
  applicationRecordFile,
  prismaDateTimeFiles,
} from './activerecord.js'

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

const bare = [
  makeModel({ name: 'Bare', fields: [makeField({ name: 'id', type: 'Int', isId: true })] }),
]

describe('activeRecordModelFiles', () => {
  it('writes one snake_case .rb file per model, ending in a newline', () => {
    expect(activeRecordModelFiles(models, enums)).toStrictEqual([
      {
        fileName: 'user.rb',
        code: `class User < ApplicationRecord
  self.table_name = "User"

  enum :role, { user: "USER", admin: "ADMIN" }, validate: true

  validates :name, presence: true

  has_many :posts, class_name: "BlogPost", foreign_key: "authorId", inverse_of: :author, dependent: :restrict_with_error
end
`,
      },
      {
        fileName: 'blog_post.rb',
        code: `class BlogPost < ApplicationRecord
  self.table_name = "BlogPost"

  validates :title, presence: true

  belongs_to :author, class_name: "User", foreign_key: "authorId", inverse_of: :posts
end
`,
      },
    ])
  })

  it('keeps a model that has nothing but a primary key', () => {
    expect(activeRecordModelFiles(bare)).toStrictEqual([
      {
        fileName: 'bare.rb',
        code: `class Bare < ApplicationRecord
  self.table_name = "Bare"
end
`,
      },
    ])
  })

  it('carries the ApplicationRecord Rails itself would write', () => {
    expect(applicationRecordFile()).toStrictEqual({
      fileName: 'application_record.rb',
      code: `class ApplicationRecord < ActiveRecord::Base
  primary_abstract_class
end
`,
    })
  })

  it('writes the DateTime type the models are declared with on SQLite, in a file of its own', () => {
    const event = makeModel({
      name: 'Event',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'at', type: 'DateTime' }),
      ],
    })
    expect(prismaDateTimeFiles([event], 'sqlite')).toStrictEqual([
      {
        fileName: 'prisma_date_time.rb',
        code: `class PrismaDateTime < ActiveRecord::Type::DateTime
  def serialize(value)
    time = super
    time.respond_to?(:getutc) ? time.getutc.strftime("%Y-%m-%dT%H:%M:%S.%L+00:00") : time
  end
end
`,
      },
    ])
    expect(prismaDateTimeFiles([event], 'postgresql')).toStrictEqual([])
    expect(prismaDateTimeFiles(bare, 'sqlite')).toStrictEqual([])
  })

  it("writes the type SQL Server's DateTime and SmallDateTime columns are declared with", () => {
    const event = makeModel({
      name: 'Event',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'at', type: 'DateTime', nativeType: ['DateTime', []] }),
      ],
    })
    expect(prismaDateTimeFiles([event], 'sqlserver')).toStrictEqual([
      {
        fileName: 'prisma_date_time.rb',
        code: `class PrismaDateTime < ActiveRecord::Type::SQLServer::DateTime2
  attr_reader :sqlserver_type

  def initialize(sqlserver_type = "datetime")
    super(precision: 3)
    @sqlserver_type = sqlserver_type
  end
end
`,
      },
    ])
    const minute = makeModel({
      name: 'Event',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'at', type: 'DateTime', nativeType: ['SmallDateTime', []] }),
      ],
    })
    expect(prismaDateTimeFiles([minute], 'sqlserver')).toStrictEqual(
      prismaDateTimeFiles([event], 'sqlserver'),
    )
    const plain = makeModel({
      name: 'Event',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'at', type: 'DateTime' }),
      ],
    })
    expect(prismaDateTimeFiles([plain], 'sqlserver')).toStrictEqual([])
  })

  it('declares the DateTime columns with that type on SQLite', () => {
    const event = makeModel({
      name: 'Event',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'at', type: 'DateTime' }),
      ],
    })
    expect(activeRecordModelFiles([event], [], 'sqlite')).toStrictEqual([
      {
        fileName: 'event.rb',
        code: `class Event < ApplicationRecord
  self.table_name = "Event"

  attribute :at, PrismaDateTime.new

  validates :at, presence: true
end
`,
      },
    ])
  })

  it('emits nothing for a schema without models', () => {
    expect(activeRecordModelFiles([], enums)).toStrictEqual([])
  })
})
