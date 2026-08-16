import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import { atlasSchema } from './atlas.js'

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

function makeDatamodel(
  models: DMMF.Model[],
  enums: DMMF.DatamodelEnum[] = [],
  indexes: DMMF.Index[] = [],
): DMMF.Datamodel {
  return { models, enums, types: [], indexes }
}

describe('atlasSchema', () => {
  it('should generate a postgresql schema with tables, FK, and schema block', () => {
    const datamodel = makeDatamodel(
      [
        makeModel({
          name: 'User',
          fields: [
            makeField({
              name: 'id',
              type: 'Int',
              isId: true,
              hasDefaultValue: true,
              default: { name: 'autoincrement', args: [] },
            }),
            makeField({ name: 'email', type: 'String', isUnique: true }),
            makeField({ name: 'name', type: 'String', isRequired: false }),
            makeField({
              name: 'createdAt',
              type: 'DateTime',
              dbName: 'created_at',
              hasDefaultValue: true,
              default: { name: 'now', args: [] },
            }),
            makeField({
              name: 'posts',
              type: 'Post',
              kind: 'object',
              isList: true,
              isRequired: false,
              relationName: 'PostToUser',
            }),
          ],
        }),
        makeModel({
          name: 'Post',
          fields: [
            makeField({
              name: 'id',
              type: 'Int',
              isId: true,
              hasDefaultValue: true,
              default: { name: 'autoincrement', args: [] },
            }),
            makeField({ name: 'title', type: 'String' }),
            makeField({
              name: 'published',
              type: 'Boolean',
              hasDefaultValue: true,
              default: false,
            }),
            makeField({ name: 'authorId', type: 'Int' }),
            makeField({
              name: 'author',
              type: 'User',
              kind: 'object',
              relationName: 'PostToUser',
              relationFromFields: ['authorId'],
              relationToFields: ['id'],
            }),
          ],
        }),
      ],
      [],
      [
        { model: 'User', type: 'id', isDefinedOnField: true, fields: [{ name: 'id' }] },
        { model: 'User', type: 'unique', isDefinedOnField: true, fields: [{ name: 'email' }] },
        { model: 'Post', type: 'id', isDefinedOnField: true, fields: [{ name: 'id' }] },
      ],
    )
    expect(atlasSchema(datamodel, 'postgresql', {})).toBe(
      `table "User" {
  schema = schema.public
  column "id" {
    null = false
    type = serial
  }
  column "email" {
    null = false
    type = text
  }
  column "name" {
    null = true
    type = text
  }
  column "created_at" {
    null    = false
    type    = timestamp(3)
    default = sql("CURRENT_TIMESTAMP")
  }
  primary_key {
    columns = [column.id]
  }
  index "User_email_key" {
    unique  = true
    columns = [column.email]
  }
}

table "Post" {
  schema = schema.public
  column "id" {
    null = false
    type = serial
  }
  column "title" {
    null = false
    type = text
  }
  column "published" {
    null    = false
    type    = boolean
    default = false
  }
  column "authorId" {
    null = false
    type = integer
  }
  primary_key {
    columns = [column.id]
  }
  foreign_key "Post_authorId_fkey" {
    columns     = [column.authorId]
    ref_columns = [table.User.column.id]
    on_update   = CASCADE
    on_delete   = RESTRICT
  }
}

schema "public" {}
`,
    )
  })

  it('should place enum blocks first and implicit m2m join tables after models', () => {
    const datamodel = makeDatamodel(
      [
        makeModel({
          name: 'Post',
          fields: [
            makeField({ name: 'id', type: 'String', isId: true }),
            makeField({
              name: 'status',
              type: 'Status',
              kind: 'enum',
              hasDefaultValue: true,
              default: 'ACTIVE',
            }),
            makeField({
              name: 'tags',
              type: 'Tag',
              kind: 'object',
              isList: true,
              isRequired: false,
              relationName: 'PostToTag',
              relationFromFields: [],
              relationToFields: [],
            }),
          ],
        }),
        makeModel({
          name: 'Tag',
          fields: [
            makeField({ name: 'id', type: 'String', isId: true }),
            makeField({
              name: 'posts',
              type: 'Post',
              kind: 'object',
              isList: true,
              isRequired: false,
              relationName: 'PostToTag',
              relationFromFields: [],
              relationToFields: [],
            }),
          ],
        }),
      ],
      [
        {
          name: 'Status',
          dbName: null,
          values: [
            { name: 'ACTIVE', dbName: null },
            { name: 'INACTIVE', dbName: null },
          ],
        },
      ],
      [
        { model: 'Post', type: 'id', isDefinedOnField: true, fields: [{ name: 'id' }] },
        { model: 'Tag', type: 'id', isDefinedOnField: true, fields: [{ name: 'id' }] },
      ],
    )
    expect(atlasSchema(datamodel, 'postgresql', {})).toBe(
      `enum "Status" {
  schema = schema.public
  values = ["ACTIVE", "INACTIVE"]
}

table "Post" {
  schema = schema.public
  column "id" {
    null = false
    type = text
  }
  column "status" {
    null    = false
    type    = enum.Status
    default = "ACTIVE"
  }
  primary_key {
    columns = [column.id]
  }
}

table "Tag" {
  schema = schema.public
  column "id" {
    null = false
    type = text
  }
  primary_key {
    columns = [column.id]
  }
}

table "_PostToTag" {
  schema = schema.public
  column "A" {
    null = false
    type = text
  }
  column "B" {
    null = false
    type = text
  }
  primary_key {
    columns = [column.A, column.B]
  }
  foreign_key "_PostToTag_A_fkey" {
    columns     = [column.A]
    ref_columns = [table.Post.column.id]
    on_update   = CASCADE
    on_delete   = CASCADE
  }
  foreign_key "_PostToTag_B_fkey" {
    columns     = [column.B]
    ref_columns = [table.Tag.column.id]
    on_update   = CASCADE
    on_delete   = CASCADE
  }
  index "_PostToTag_B_index" {
    columns = [column.B]
  }
}

schema "public" {}
`,
    )
  })

  it('should inline enums and use auto_increment on mysql', () => {
    const datamodel = makeDatamodel(
      [
        makeModel({
          name: 'User',
          fields: [
            makeField({
              name: 'id',
              type: 'Int',
              isId: true,
              hasDefaultValue: true,
              default: { name: 'autoincrement', args: [] },
            }),
            makeField({ name: 'name', type: 'String' }),
            makeField({ name: 'status', type: 'Status', kind: 'enum' }),
          ],
        }),
      ],
      [
        {
          name: 'Status',
          dbName: null,
          values: [
            { name: 'ACTIVE', dbName: 'active' },
            { name: 'INACTIVE', dbName: 'inactive' },
          ],
        },
      ],
      [{ model: 'User', type: 'id', isDefinedOnField: true, fields: [{ name: 'id' }] }],
    )
    expect(atlasSchema(datamodel, 'mysql', {})).toBe(
      `table "User" {
  schema = schema.public
  column "id" {
    null           = false
    type           = int
    auto_increment = true
  }
  column "name" {
    null = false
    type = varchar(191)
  }
  column "status" {
    null = false
    type = enum("active", "inactive")
  }
  primary_key {
    columns = [column.id]
  }
}

schema "public" {}
`,
    )
  })

  it('should default to the main schema on sqlite', () => {
    const datamodel = makeDatamodel(
      [
        makeModel({
          name: 'User',
          fields: [
            makeField({
              name: 'id',
              type: 'Int',
              isId: true,
              hasDefaultValue: true,
              default: { name: 'autoincrement', args: [] },
            }),
            makeField({ name: 'profile', type: 'Json', isRequired: false }),
          ],
        }),
      ],
      [],
      [{ model: 'User', type: 'id', isDefinedOnField: true, fields: [{ name: 'id' }] }],
    )
    expect(atlasSchema(datamodel, 'sqlite', {})).toBe(
      `table "User" {
  schema = schema.main
  column "id" {
    null           = false
    type           = integer
    auto_increment = true
  }
  column "profile" {
    null = true
    type = jsonb
  }
  primary_key {
    columns = [column.id]
  }
}

schema "main" {}
`,
    )
  })

  it('should treat cockroachdb as postgresql', () => {
    const datamodel = makeDatamodel(
      [
        makeModel({
          name: 'Event',
          fields: [makeField({ name: 'id', type: 'String', isId: true })],
        }),
      ],
      [],
      [{ model: 'Event', type: 'id', isDefinedOnField: true, fields: [{ name: 'id' }] }],
    )
    expect(atlasSchema(datamodel, 'cockroachdb', {})).toBe(
      `table "Event" {
  schema = schema.public
  column "id" {
    null = false
    type = text
  }
  primary_key {
    columns = [column.id]
  }
}

schema "public" {}
`,
    )
  })

  it('should honor schemaName and comment config with @@schema models', () => {
    const datamodel = makeDatamodel(
      [
        makeModel({
          name: 'User',
          documentation: 'Users table',
          schema: 'auth',
          fields: [
            makeField({ name: 'id', type: 'String', isId: true }),
            makeField({
              name: 'email',
              type: 'String',
              documentation: '@z.string().email()\nemail address',
            }),
          ],
        }),
      ],
      [],
      [{ model: 'User', type: 'id', isDefinedOnField: true, fields: [{ name: 'id' }] }],
    )
    expect(atlasSchema(datamodel, 'postgresql', { schemaName: 'app', comment: true })).toBe(
      `table "User" {
  schema  = schema.auth
  comment = "Users table"
  column "id" {
    null = false
    type = text
  }
  column "email" {
    null    = false
    type    = text
    comment = "email address"
  }
  primary_key {
    columns = [column.id]
  }
}

schema "app" {}

schema "auth" {}
`,
    )
  })
})
