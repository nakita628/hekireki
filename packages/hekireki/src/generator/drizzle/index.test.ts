import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import { drizzleSchema } from '../../helper/drizzle.js'

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

describe('drizzleSchema - PostgreSQL basics', () => {
  it('generates basic table with scalar types', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'User',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({ name: 'name', type: 'String' }),
              makeField({ name: 'email', type: 'String', isUnique: true }),
              makeField({ name: 'bio', type: 'String', isRequired: false }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'postgresql',
      [],
    )

    expect(result).toBe(
      [
        "import { integer, pgTable, text } from 'drizzle-orm/pg-core'",
        '',
        "export const user = pgTable('user', { id: integer('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull().unique(), bio: text('bio') })",
      ].join('\n'),
    )
  })

  it('generates @default values', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'Post',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({
                name: 'published',
                type: 'Boolean',
                hasDefaultValue: true,
                default: false,
              }),
              makeField({ name: 'views', type: 'Int', hasDefaultValue: true, default: 0 }),
              makeField({
                name: 'title',
                type: 'String',
                hasDefaultValue: true,
                default: 'Untitled',
              }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'postgresql',
      [],
    )

    expect(result).toBe(
      [
        "import { boolean, integer, pgTable, text } from 'drizzle-orm/pg-core'",
        '',
        "export const post = pgTable('post', { id: integer('id').primaryKey(), published: boolean('published').notNull().default(false), views: integer('views').notNull().default(0), title: text('title').notNull().default('Untitled') })",
      ].join('\n'),
    )
  })

  it('generates @updatedAt', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'Post',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({ name: 'updatedAt', type: 'DateTime', isUpdatedAt: true }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'postgresql',
      [],
    )

    expect(result).toBe(
      [
        "import { integer, pgTable, timestamp } from 'drizzle-orm/pg-core'",
        '',
        "export const post = pgTable('post', { id: integer('id').primaryKey(), updatedAt: timestamp('updatedAt').notNull().defaultNow().$onUpdate(() => new Date()) })",
      ].join('\n'),
    )
  })
})

describe('drizzleSchema - PostgreSQL native types', () => {
  it('generates @db.VarChar', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'User',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({ name: 'name', type: 'String', nativeType: ['VarChar', ['191']] }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'postgresql',
      [],
    )

    expect(result).toBe(
      [
        "import { integer, pgTable, varchar } from 'drizzle-orm/pg-core'",
        '',
        "export const user = pgTable('user', { id: integer('id').primaryKey(), name: varchar('name', { length: 191 }).notNull() })",
      ].join('\n'),
    )
  })

  it('generates @db.Uuid', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'User',
            fields: [
              makeField({ name: 'id', type: 'String', isId: true, nativeType: ['Uuid', []] }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'postgresql',
      [],
    )

    expect(result).toBe(
      [
        "import { pgTable, uuid } from 'drizzle-orm/pg-core'",
        '',
        "export const user = pgTable('user', { id: uuid('id').primaryKey() })",
      ].join('\n'),
    )
  })

  it('generates @db.Timestamptz', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'Event',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({
                name: 'createdAt',
                type: 'DateTime',
                nativeType: ['Timestamptz', ['3']],
              }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'postgresql',
      [],
    )

    expect(result).toBe(
      [
        "import { integer, pgTable, timestamp } from 'drizzle-orm/pg-core'",
        '',
        "export const event = pgTable('event', { id: integer('id').primaryKey(), createdAt: timestamp('createdAt', { withTimezone: true, precision: 3 }).notNull() })",
      ].join('\n'),
    )
  })

  it('generates @db.Decimal with precision and scale', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'Product',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({ name: 'price', type: 'Decimal', nativeType: ['Decimal', ['10', '2']] }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'postgresql',
      [],
    )

    expect(result).toBe(
      [
        "import { integer, numeric, pgTable } from 'drizzle-orm/pg-core'",
        '',
        "export const product = pgTable('product', { id: integer('id').primaryKey(), price: numeric('price', { precision: 10, scale: 2 }).notNull() })",
      ].join('\n'),
    )
  })
})

describe('drizzleSchema - PostgreSQL serial', () => {
  it('generates serial() for autoincrement PK', () => {
    const result = drizzleSchema(
      {
        models: [
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
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'postgresql',
      [],
    )

    expect(result).toBe(
      [
        "import { pgTable, serial } from 'drizzle-orm/pg-core'",
        '',
        "export const user = pgTable('user', { id: serial('id').primaryKey() })",
      ].join('\n'),
    )
  })
})

describe('drizzleSchema - MySQL basics', () => {
  it('generates MySQL table with correct types', () => {
    const result = drizzleSchema(
      {
        models: [
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
              makeField({ name: 'active', type: 'Boolean' }),
              makeField({ name: 'createdAt', type: 'DateTime' }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'mysql',
      [],
    )

    expect(result).toBe(
      [
        "import { boolean, datetime, int, mysqlTable, text } from 'drizzle-orm/mysql-core'",
        '',
        "export const user = mysqlTable('user', { id: int('id').primaryKey().autoincrement(), name: text('name').notNull(), active: boolean('active').notNull(), createdAt: datetime('createdAt', { fsp: 3 }).notNull() })",
      ].join('\n'),
    )
  })

  it('generates default(sql`CURRENT_TIMESTAMP(3)`) for MySQL @default(now())', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'Post',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({
                name: 'createdAt',
                type: 'DateTime',
                hasDefaultValue: true,
                default: { name: 'now', args: [] },
              }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'mysql',
      [],
    )

    expect(result).toBe(
      [
        "import { datetime, int, mysqlTable } from 'drizzle-orm/mysql-core'",
        "import { sql } from 'drizzle-orm'",
        '',
        "export const post = mysqlTable('post', { id: int('id').primaryKey(), createdAt: datetime('createdAt', { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`) })",
      ].join('\n'),
    )
  })

  it('generates MySQL inline enum', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'User',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({ name: 'role', type: 'Role', kind: 'enum' }),
            ],
          }),
        ],
        enums: [
          {
            name: 'Role',
            values: [
              { name: 'USER', dbName: null },
              { name: 'ADMIN', dbName: null },
            ],
            dbName: null,
          },
        ],
        types: [],
        indexes: [],
      },
      'mysql',
      [],
    )

    expect(result).toBe(
      [
        "import { int, mysqlEnum, mysqlTable } from 'drizzle-orm/mysql-core'",
        '',
        "export const user = mysqlTable('user', { id: int('id').primaryKey(), role: mysqlEnum('role', ['USER', 'ADMIN']).notNull() })",
      ].join('\n'),
    )
  })
})

describe('drizzleSchema - SQLite basics', () => {
  it('generates SQLite table with correct types', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'User',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({ name: 'name', type: 'String' }),
              makeField({ name: 'active', type: 'Boolean' }),
              makeField({ name: 'data', type: 'Json' }),
              makeField({ name: 'createdAt', type: 'DateTime' }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'sqlite',
      [],
    )

    expect(result).toBe(
      [
        "import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'",
        '',
        "export const user = sqliteTable('user', { id: integer('id').primaryKey(), name: text('name').notNull(), active: integer('active', { mode: 'boolean' }).notNull(), data: text('data', { mode: 'json' }).notNull(), createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull() })",
      ].join('\n'),
    )
  })

  it('generates SQLite autoincrement', () => {
    const result = drizzleSchema(
      {
        models: [
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
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'sqlite',
      [],
    )

    expect(result).toBe(
      [
        "import { integer, sqliteTable } from 'drizzle-orm/sqlite-core'",
        '',
        "export const user = sqliteTable('user', { id: integer('id').primaryKey({ autoIncrement: true }) })",
      ].join('\n'),
    )
  })

  it('generates SQLite text enum', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'User',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({ name: 'role', type: 'Role', kind: 'enum' }),
            ],
          }),
        ],
        enums: [
          {
            name: 'Role',
            values: [
              { name: 'USER', dbName: null },
              { name: 'ADMIN', dbName: null },
            ],
            dbName: null,
          },
        ],
        types: [],
        indexes: [],
      },
      'sqlite',
      [],
    )

    expect(result).toBe(
      [
        "import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'",
        '',
        "export const user = sqliteTable('user', { id: integer('id').primaryKey(), role: text('role', { enum: ['USER', 'ADMIN'] }).notNull() })",
      ].join('\n'),
    )
  })
})

describe('drizzleSchema - Composite @@id', () => {
  it('generates primaryKey for composite PK', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'PostTag',
            primaryKey: { name: null, fields: ['postId', 'tagId'] },
            fields: [
              makeField({ name: 'postId', type: 'Int' }),
              makeField({ name: 'tagId', type: 'Int' }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'postgresql',
      [],
    )

    expect(result).toBe(
      [
        "import { integer, pgTable, primaryKey } from 'drizzle-orm/pg-core'",
        '',
        "export const postTag = pgTable('post_tag', { postId: integer('postId').notNull(), tagId: integer('tagId').notNull() }, (table) => [primaryKey({ columns: [table.postId, table.tagId] })])",
      ].join('\n'),
    )
  })
})

describe('drizzleSchema - Composite @@unique', () => {
  it('generates unique().on() for composite unique', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'Account',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({ name: 'provider', type: 'String' }),
              makeField({ name: 'providerAccountId', type: 'String' }),
            ],
            uniqueFields: [['provider', 'providerAccountId']],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'postgresql',
      [],
    )

    expect(result).toBe(
      [
        "import { integer, pgTable, text, unique } from 'drizzle-orm/pg-core'",
        '',
        "export const account = pgTable('account', { id: integer('id').primaryKey(), provider: text('provider').notNull(), providerAccountId: text('providerAccountId').notNull() }, (table) => [unique().on(table.provider, table.providerAccountId)])",
      ].join('\n'),
    )
  })
})

describe('drizzleSchema - @@index', () => {
  it('generates index().on() for model indexes', () => {
    const indexes: DMMF.Index[] = [
      {
        model: 'Post',
        type: 'normal',
        isDefinedOnField: false,
        fields: [{ name: 'userId' }],
        dbName: 'post_user_id_idx',
      },
    ]

    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'Post',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({ name: 'userId', type: 'Int' }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes,
      },
      'postgresql',
      indexes,
    )

    expect(result).toBe(
      [
        "import { index, integer, pgTable } from 'drizzle-orm/pg-core'",
        '',
        "export const post = pgTable('post', { id: integer('id').primaryKey(), userId: integer('userId').notNull() }, (table) => [index('post_user_id_idx').on(table.userId)])",
      ].join('\n'),
    )
  })
})

describe('drizzleSchema - Enums', () => {
  it('generates pgEnum for PostgreSQL', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'User',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({ name: 'role', type: 'Role', kind: 'enum' }),
            ],
          }),
        ],
        enums: [
          {
            name: 'Role',
            values: [
              { name: 'USER', dbName: null },
              { name: 'ADMIN', dbName: null },
            ],
            dbName: null,
          },
        ],
        types: [],
        indexes: [],
      },
      'postgresql',
      [],
    )

    expect(result).toBe(
      [
        "import { integer, pgEnum, pgTable } from 'drizzle-orm/pg-core'",
        '',
        "export const user = pgTable('user', { id: integer('id').primaryKey(), role: pgEnum('Role', ['USER', 'ADMIN'])('role').notNull() })",
      ].join('\n'),
    )
  })
})

describe('drizzleSchema - Relations', () => {
  it('generates one-to-many relations', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'User',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
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
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({ name: 'userId', type: 'Int' }),
              makeField({
                name: 'user',
                type: 'User',
                kind: 'object',
                isRequired: true,
                relationName: 'PostToUser',
                relationFromFields: ['userId'],
                relationToFields: ['id'],
              }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'postgresql',
      [],
    )

    expect(result).toBe(
      [
        "import { integer, pgTable } from 'drizzle-orm/pg-core'",
        "import { relations } from 'drizzle-orm'",
        '',
        "export const user = pgTable('user', { id: integer('id').primaryKey() })",
        '',
        "export const post = pgTable('post', { id: integer('id').primaryKey(), userId: integer('userId').notNull().references(() => user.id) })",
        '',
        'export const userRelations = relations(user, ({ many }) => ({ posts: many(post) }))',
        '',
        'export const postRelations = relations(post, ({ one }) => ({ user: one(user, { fields: [post.userId], references: [user.id] }) }))',
      ].join('\n'),
    )
  })

  it('generates .references() with onDelete cascade', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'User',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
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
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({ name: 'authorId', type: 'Int' }),
              makeField({
                name: 'user',
                type: 'User',
                kind: 'object',
                isRequired: true,
                relationName: 'PostToUser',
                relationFromFields: ['authorId'],
                relationToFields: ['id'],
                relationOnDelete: 'Cascade',
              }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'postgresql',
      [],
    )

    expect(result).toBe(
      [
        "import { integer, pgTable } from 'drizzle-orm/pg-core'",
        "import { relations } from 'drizzle-orm'",
        '',
        "export const user = pgTable('user', { id: integer('id').primaryKey() })",
        '',
        "export const post = pgTable('post', { id: integer('id').primaryKey(), authorId: integer('authorId').notNull().references(() => user.id, { onDelete: 'cascade' }) })",
        '',
        'export const userRelations = relations(user, ({ many }) => ({ posts: many(post) }))',
        '',
        'export const postRelations = relations(post, ({ one }) => ({ user: one(user, { fields: [post.authorId], references: [user.id] }) }))',
      ].join('\n'),
    )
  })

  it('generates .references() with onDelete set null', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'User',
            fields: [makeField({ name: 'id', type: 'Int', isId: true })],
          }),
          makeModel({
            name: 'Post',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({ name: 'userId', type: 'Int', isRequired: false }),
              makeField({
                name: 'user',
                type: 'User',
                kind: 'object',
                isRequired: false,
                relationFromFields: ['userId'],
                relationToFields: ['id'],
                relationOnDelete: 'SetNull',
              }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'postgresql',
      [],
    )

    expect(result).toBe(
      [
        "import { integer, pgTable } from 'drizzle-orm/pg-core'",
        "import { relations } from 'drizzle-orm'",
        '',
        "export const user = pgTable('user', { id: integer('id').primaryKey() })",
        '',
        "export const post = pgTable('post', { id: integer('id').primaryKey(), userId: integer('userId').references(() => user.id, { onDelete: 'set null' }) })",
        '',
        'export const postRelations = relations(post, ({ one }) => ({ user: one(user, { fields: [post.userId], references: [user.id] }) }))',
      ].join('\n'),
    )
  })

  it('generates .references() without onDelete when not specified', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'User',
            fields: [makeField({ name: 'id', type: 'Int', isId: true })],
          }),
          makeModel({
            name: 'Post',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({ name: 'userId', type: 'Int' }),
              makeField({
                name: 'user',
                type: 'User',
                kind: 'object',
                isRequired: true,
                relationFromFields: ['userId'],
                relationToFields: ['id'],
              }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'postgresql',
      [],
    )

    expect(result).toContain('.references(() => user.id)')
    expect(result).not.toContain('onDelete')
  })
})

describe('drizzleSchema - Self-referencing relations', () => {
  it('omits .references() for self-referencing FK (postgresql)', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'Post',
            fields: [
              makeField({ name: 'id', type: 'String', isId: true }),
              makeField({ name: 'content', type: 'String', isRequired: false }),
              makeField({ name: 'repostOfId', type: 'String', isRequired: false }),
              makeField({
                name: 'repostOf',
                type: 'Post',
                kind: 'object',
                isRequired: false,
                relationName: 'Repost',
                relationFromFields: ['repostOfId'],
                relationToFields: ['id'],
              }),
              makeField({
                name: 'reposts',
                type: 'Post',
                kind: 'object',
                isList: true,
                isRequired: false,
                relationName: 'Repost',
              }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'postgresql',
      [],
    )

    expect(result).toBe(
      [
        "import { pgTable, text } from 'drizzle-orm/pg-core'",
        "import { relations } from 'drizzle-orm'",
        '',
        "export const post = pgTable('post', { id: text('id').primaryKey(), content: text('content'), repostOfId: text('repostOfId') })",
        '',
        "export const postRelations = relations(post, ({ one, many }) => ({ repostOf: one(post, { fields: [post.repostOfId], references: [post.id], relationName: 'Repost' }), reposts: many(post, { relationName: 'Repost' }) }))",
      ].join('\n'),
    )
  })

  it('omits .references() for self-referencing FK (mysql)', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'Post',
            fields: [
              makeField({ name: 'id', type: 'String', isId: true }),
              makeField({ name: 'repostOfId', type: 'String', isRequired: false }),
              makeField({
                name: 'repostOf',
                type: 'Post',
                kind: 'object',
                isRequired: false,
                relationName: 'Repost',
                relationFromFields: ['repostOfId'],
                relationToFields: ['id'],
              }),
              makeField({
                name: 'reposts',
                type: 'Post',
                kind: 'object',
                isList: true,
                isRequired: false,
                relationName: 'Repost',
              }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'mysql',
      [],
    )

    expect(result).toBe(
      [
        "import { mysqlTable, text } from 'drizzle-orm/mysql-core'",
        "import { relations } from 'drizzle-orm'",
        '',
        "export const post = mysqlTable('post', { id: text('id').primaryKey(), repostOfId: text('repostOfId') })",
        '',
        "export const postRelations = relations(post, ({ one, many }) => ({ repostOf: one(post, { fields: [post.repostOfId], references: [post.id], relationName: 'Repost' }), reposts: many(post, { relationName: 'Repost' }) }))",
      ].join('\n'),
    )
  })

  it('omits .references() for self-referencing FK (sqlite)', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'Post',
            fields: [
              makeField({ name: 'id', type: 'String', isId: true }),
              makeField({ name: 'repostOfId', type: 'String', isRequired: false }),
              makeField({
                name: 'repostOf',
                type: 'Post',
                kind: 'object',
                isRequired: false,
                relationName: 'Repost',
                relationFromFields: ['repostOfId'],
                relationToFields: ['id'],
              }),
              makeField({
                name: 'reposts',
                type: 'Post',
                kind: 'object',
                isList: true,
                isRequired: false,
                relationName: 'Repost',
              }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'sqlite',
      [],
    )

    expect(result).toBe(
      [
        "import { sqliteTable, text } from 'drizzle-orm/sqlite-core'",
        "import { relations } from 'drizzle-orm'",
        '',
        "export const post = sqliteTable('post', { id: text('id').primaryKey(), repostOfId: text('repostOfId') })",
        '',
        "export const postRelations = relations(post, ({ one, many }) => ({ repostOf: one(post, { fields: [post.repostOfId], references: [post.id], relationName: 'Repost' }), reposts: many(post, { relationName: 'Repost' }) }))",
      ].join('\n'),
    )
  })

  it('omits .references() for self-referencing FK even with onDelete', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'Category',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({ name: 'name', type: 'String' }),
              makeField({ name: 'parentId', type: 'Int', isRequired: false }),
              makeField({
                name: 'parent',
                type: 'Category',
                kind: 'object',
                isRequired: false,
                relationName: 'CategoryTree',
                relationFromFields: ['parentId'],
                relationToFields: ['id'],
                relationOnDelete: 'SetNull',
              }),
              makeField({
                name: 'children',
                type: 'Category',
                kind: 'object',
                isList: true,
                isRequired: false,
                relationName: 'CategoryTree',
              }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'postgresql',
      [],
    )

    expect(result).toBe(
      [
        "import { integer, pgTable, text } from 'drizzle-orm/pg-core'",
        "import { relations } from 'drizzle-orm'",
        '',
        "export const category = pgTable('category', { id: integer('id').primaryKey(), name: text('name').notNull(), parentId: integer('parentId') })",
        '',
        "export const categoryRelations = relations(category, ({ one, many }) => ({ parent: one(category, { fields: [category.parentId], references: [category.id], relationName: 'CategoryTree' }), children: many(category, { relationName: 'CategoryTree' }) }))",
      ].join('\n'),
    )
  })

  it('keeps .references() for normal FK while omitting for self-referencing FK on same model', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'User',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({
                name: 'comments',
                type: 'Comment',
                kind: 'object',
                isList: true,
                isRequired: false,
                relationName: 'CommentToUser',
              }),
            ],
          }),
          makeModel({
            name: 'Comment',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({ name: 'text', type: 'String' }),
              makeField({ name: 'userId', type: 'Int' }),
              makeField({
                name: 'user',
                type: 'User',
                kind: 'object',
                isRequired: true,
                relationName: 'CommentToUser',
                relationFromFields: ['userId'],
                relationToFields: ['id'],
              }),
              makeField({ name: 'parentId', type: 'Int', isRequired: false }),
              makeField({
                name: 'parent',
                type: 'Comment',
                kind: 'object',
                isRequired: false,
                relationName: 'CommentThread',
                relationFromFields: ['parentId'],
                relationToFields: ['id'],
              }),
              makeField({
                name: 'replies',
                type: 'Comment',
                kind: 'object',
                isList: true,
                isRequired: false,
                relationName: 'CommentThread',
              }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'postgresql',
      [],
    )

    expect(result).toBe(
      [
        "import { integer, pgTable, text } from 'drizzle-orm/pg-core'",
        "import { relations } from 'drizzle-orm'",
        '',
        "export const user = pgTable('user', { id: integer('id').primaryKey() })",
        '',
        "export const comment = pgTable('comment', { id: integer('id').primaryKey(), text: text('text').notNull(), userId: integer('userId').notNull().references(() => user.id), parentId: integer('parentId') })",
        '',
        'export const userRelations = relations(user, ({ many }) => ({ comments: many(comment) }))',
        '',
        "export const commentRelations = relations(comment, ({ one, many }) => ({ user: one(user, { fields: [comment.userId], references: [user.id] }), parent: one(comment, { fields: [comment.parentId], references: [comment.id], relationName: 'CommentThread' }), replies: many(comment, { relationName: 'CommentThread' }) }))",
      ].join('\n'),
    )
  })
})

describe('drizzleSchema - @map/@@map', () => {
  it('uses custom column and table names', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'User',
            dbName: 'users',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({ name: 'firstName', type: 'String', dbName: 'first_name' }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'postgresql',
      [],
    )

    expect(result).toBe(
      [
        "import { integer, pgTable, text } from 'drizzle-orm/pg-core'",
        '',
        "export const user = pgTable('users', { id: integer('id').primaryKey(), firstName: text('first_name').notNull() })",
      ].join('\n'),
    )
  })
})

describe('drizzleSchema - Array fields', () => {
  it('generates .array() for PG list scalars', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'User',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({ name: 'tags', type: 'String', isList: true }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'postgresql',
      [],
    )

    expect(result).toBe(
      [
        "import { integer, pgTable, text } from 'drizzle-orm/pg-core'",
        '',
        "export const user = pgTable('user', { id: integer('id').primaryKey(), tags: text('tags').notNull().array() })",
      ].join('\n'),
    )
  })
})

describe('drizzleSchema - Default values', () => {
  it('generates defaultNow() for @default(now())', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'Post',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({
                name: 'createdAt',
                type: 'DateTime',
                hasDefaultValue: true,
                default: { name: 'now', args: [] },
              }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'postgresql',
      [],
    )

    expect(result).toBe(
      [
        "import { integer, pgTable, timestamp } from 'drizzle-orm/pg-core'",
        '',
        "export const post = pgTable('post', { id: integer('id').primaryKey(), createdAt: timestamp('createdAt').notNull().defaultNow() })",
      ].join('\n'),
    )
  })

  it('generates default(sql`(unixepoch() * 1000)`) for SQLite @default(now())', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'Post',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({
                name: 'createdAt',
                type: 'DateTime',
                hasDefaultValue: true,
                default: { name: 'now', args: [] },
              }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'sqlite',
      [],
    )

    expect(result).toBe(
      [
        "import { integer, sqliteTable } from 'drizzle-orm/sqlite-core'",
        "import { sql } from 'drizzle-orm'",
        '',
        "export const post = sqliteTable('post', { id: integer('id').primaryKey(), createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`) })",
      ].join('\n'),
    )
  })

  it('generates $defaultFn for uuid()', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
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
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'postgresql',
      [],
    )

    expect(result).toBe(
      [
        "import { pgTable, text } from 'drizzle-orm/pg-core'",
        '',
        "export const user = pgTable('user', { id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()) })",
      ].join('\n'),
    )
  })

  it('generates $defaultFn for cuid()', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'User',
            fields: [
              makeField({
                name: 'id',
                type: 'String',
                isId: true,
                hasDefaultValue: true,
                default: { name: 'cuid', args: [] },
              }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'postgresql',
      [],
    )

    expect(result).toBe(
      [
        "import { pgTable, text } from 'drizzle-orm/pg-core'",
        "import { createId } from '@paralleldrive/cuid2'",
        '',
        "export const user = pgTable('user', { id: text('id').primaryKey().$defaultFn(() => createId()) })",
      ].join('\n'),
    )
  })

  it('generates sql`` for dbgenerated()', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'User',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({
                name: 'createdAt',
                type: 'DateTime',
                hasDefaultValue: true,
                default: { name: 'dbgenerated', args: ['now()'] },
              }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'postgresql',
      [],
    )

    expect(result).toBe(
      [
        "import { integer, pgTable, timestamp } from 'drizzle-orm/pg-core'",
        "import { sql } from 'drizzle-orm'",
        '',
        "export const user = pgTable('user', { id: integer('id').primaryKey(), createdAt: timestamp('createdAt').notNull().default(sql`now()`) })",
      ].join('\n'),
    )
  })
})

describe('drizzleSchema - @@unique single field dedup', () => {
  it('does not duplicate unique constraint for @@unique([singleField])', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'Verification',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({ name: 'token', type: 'String', isUnique: true }),
            ],
            uniqueFields: [['token']],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'postgresql',
      [],
    )

    expect(result).toBe(
      [
        "import { integer, pgTable, text } from 'drizzle-orm/pg-core'",
        '',
        "export const verification = pgTable('verification', { id: integer('id').primaryKey(), token: text('token').notNull().unique() })",
      ].join('\n'),
    )
  })

  it('still generates composite unique for multi-field @@unique', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'Account',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({ name: 'provider', type: 'String' }),
              makeField({ name: 'providerAccountId', type: 'String' }),
            ],
            uniqueFields: [['provider', 'providerAccountId']],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'postgresql',
      [],
    )

    expect(result).toContain('unique().on(table.provider, table.providerAccountId)')
  })
})

describe('drizzleSchema - @@index name prefixed with table name', () => {
  it('prefixes fallback index name with table name', () => {
    const indexes: DMMF.Index[] = [
      {
        model: 'Post',
        type: 'normal',
        isDefinedOnField: false,
        fields: [{ name: 'userId' }],
        dbName: null,
      },
      {
        model: 'Comment',
        type: 'normal',
        isDefinedOnField: false,
        fields: [{ name: 'userId' }],
        dbName: null,
      },
    ]

    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'Post',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({ name: 'userId', type: 'Int' }),
            ],
          }),
          makeModel({
            name: 'Comment',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({ name: 'userId', type: 'Int' }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes,
      },
      'postgresql',
      indexes,
    )

    expect(result).toContain("index('idx_post_userId').on(table.userId)")
    expect(result).toContain("index('idx_comment_userId').on(table.userId)")
  })

  it('uses dbName when provided instead of generating', () => {
    const indexes: DMMF.Index[] = [
      {
        model: 'Post',
        type: 'normal',
        isDefinedOnField: false,
        fields: [{ name: 'userId' }],
        dbName: 'custom_idx',
      },
    ]

    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'Post',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({ name: 'userId', type: 'Int' }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes,
      },
      'postgresql',
      indexes,
    )

    expect(result).toContain("index('custom_idx').on(table.userId)")
  })
})

describe('drizzleSchema - @updatedAt generates default for INSERT', () => {
  it('generates defaultNow() + $onUpdate for PostgreSQL @updatedAt', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'Post',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({ name: 'updatedAt', type: 'DateTime', isUpdatedAt: true }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'postgresql',
      [],
    )

    expect(result).toBe(
      [
        "import { integer, pgTable, timestamp } from 'drizzle-orm/pg-core'",
        '',
        "export const post = pgTable('post', { id: integer('id').primaryKey(), updatedAt: timestamp('updatedAt').notNull().defaultNow().$onUpdate(() => new Date()) })",
      ].join('\n'),
    )
  })

  it('generates default(sql`(unixepoch() * 1000)`) + $onUpdate for SQLite @updatedAt', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'Post',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({ name: 'updatedAt', type: 'DateTime', isUpdatedAt: true }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'sqlite',
      [],
    )

    expect(result).toBe(
      [
        "import { integer, sqliteTable } from 'drizzle-orm/sqlite-core'",
        "import { sql } from 'drizzle-orm'",
        '',
        "export const post = sqliteTable('post', { id: integer('id').primaryKey(), updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`).$onUpdate(() => new Date()) })",
      ].join('\n'),
    )
  })

  it('generates default(sql`CURRENT_TIMESTAMP(3)`) + $onUpdate for MySQL @updatedAt', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'Post',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({ name: 'updatedAt', type: 'DateTime', isUpdatedAt: true }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'mysql',
      [],
    )

    expect(result).toBe(
      [
        "import { datetime, int, mysqlTable } from 'drizzle-orm/mysql-core'",
        "import { sql } from 'drizzle-orm'",
        '',
        "export const post = mysqlTable('post', { id: int('id').primaryKey(), updatedAt: datetime('updatedAt', { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`).$onUpdate(() => new Date()) })",
      ].join('\n'),
    )
  })

  it('does not double default when @updatedAt has explicit @default(now())', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'Post',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({
                name: 'updatedAt',
                type: 'DateTime',
                isUpdatedAt: true,
                hasDefaultValue: true,
                default: { name: 'now', args: [] },
              }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'postgresql',
      [],
    )

    expect(result).toBe(
      [
        "import { integer, pgTable, timestamp } from 'drizzle-orm/pg-core'",
        '',
        "export const post = pgTable('post', { id: integer('id').primaryKey(), updatedAt: timestamp('updatedAt').notNull().defaultNow().$onUpdate(() => new Date()) })",
      ].join('\n'),
    )
  })

  it('does not double default when SQLite @updatedAt has explicit @default(now())', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'Post',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({
                name: 'updatedAt',
                type: 'DateTime',
                isUpdatedAt: true,
                hasDefaultValue: true,
                default: { name: 'now', args: [] },
              }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'sqlite',
      [],
    )

    expect(result).toBe(
      [
        "import { integer, sqliteTable } from 'drizzle-orm/sqlite-core'",
        "import { sql } from 'drizzle-orm'",
        '',
        "export const post = sqliteTable('post', { id: integer('id').primaryKey(), updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`).$onUpdate(() => new Date()) })",
      ].join('\n'),
    )
  })
})

describe('drizzleSchema - MySQL native types with fsp', () => {
  it('generates @db.DateTime with fsp', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'Event',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({
                name: 'startAt',
                type: 'DateTime',
                nativeType: ['DateTime', ['6']],
              }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'mysql',
      [],
    )

    expect(result).toBe(
      [
        "import { datetime, int, mysqlTable } from 'drizzle-orm/mysql-core'",
        '',
        "export const event = mysqlTable('event', { id: int('id').primaryKey(), startAt: datetime('startAt', { fsp: 6 }).notNull() })",
      ].join('\n'),
    )
  })

  it('generates @db.DateTime without explicit fsp defaults to fsp: 3', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'Event',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({
                name: 'startAt',
                type: 'DateTime',
                nativeType: ['DateTime', []],
              }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'mysql',
      [],
    )

    expect(result).toBe(
      [
        "import { datetime, int, mysqlTable } from 'drizzle-orm/mysql-core'",
        '',
        "export const event = mysqlTable('event', { id: int('id').primaryKey(), startAt: datetime('startAt', { fsp: 3 }).notNull() })",
      ].join('\n'),
    )
  })

  it('generates @db.Timestamp with fsp', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'Event',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({
                name: 'startAt',
                type: 'DateTime',
                nativeType: ['Timestamp', ['3']],
              }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'mysql',
      [],
    )

    expect(result).toBe(
      [
        "import { int, mysqlTable, timestamp } from 'drizzle-orm/mysql-core'",
        '',
        "export const event = mysqlTable('event', { id: int('id').primaryKey(), startAt: timestamp('startAt', { fsp: 3 }).notNull() })",
      ].join('\n'),
    )
  })
})

describe('drizzleSchema - complex schema with all Bug fixes', () => {
  it('SQLite: FK + timestamp_ms + @updatedAt + @@unique dedup + @@index prefix', () => {
    const indexes: DMMF.Index[] = [
      { model: 'Post', type: 'normal', isDefinedOnField: false, fields: [{ name: 'userId' }] },
      { model: 'Comment', type: 'normal', isDefinedOnField: false, fields: [{ name: 'userId' }] },
    ]

    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'User',
            fields: [
              makeField({ name: 'id', type: 'String', isId: true }),
              makeField({ name: 'email', type: 'String', isUnique: true }),
              makeField({
                name: 'createdAt',
                type: 'DateTime',
                hasDefaultValue: true,
                default: { name: 'now', args: [] },
              }),
              makeField({ name: 'updatedAt', type: 'DateTime', isUpdatedAt: true }),
              makeField({
                name: 'posts',
                type: 'Post',
                kind: 'object',
                isList: true,
                isRequired: false,
              }),
            ],
            uniqueFields: [['email']],
          }),
          makeModel({
            name: 'Post',
            fields: [
              makeField({ name: 'id', type: 'String', isId: true }),
              makeField({ name: 'userId', type: 'String' }),
              makeField({
                name: 'user',
                type: 'User',
                kind: 'object',
                isRequired: true,
                relationFromFields: ['userId'],
                relationToFields: ['id'],
                relationOnDelete: 'Cascade',
              }),
            ],
          }),
          makeModel({
            name: 'Comment',
            fields: [
              makeField({ name: 'id', type: 'String', isId: true }),
              makeField({ name: 'userId', type: 'String' }),
              makeField({
                name: 'user',
                type: 'User',
                kind: 'object',
                isRequired: true,
                relationFromFields: ['userId'],
                relationToFields: ['id'],
                relationOnDelete: 'Cascade',
              }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes,
      },
      'sqlite',
      indexes,
    )

    expect(result).toBe(
      [
        "import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'",
        "import { relations, sql } from 'drizzle-orm'",
        '',
        "export const user = sqliteTable('user', { id: text('id').primaryKey(), email: text('email').notNull().unique(), createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`), updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`).$onUpdate(() => new Date()) })",
        '',
        "export const post = sqliteTable('post', { id: text('id').primaryKey(), userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }) }, (table) => [index('idx_post_userId').on(table.userId)])",
        '',
        "export const comment = sqliteTable('comment', { id: text('id').primaryKey(), userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }) }, (table) => [index('idx_comment_userId').on(table.userId)])",
        '',
        'export const userRelations = relations(user, ({ many }) => ({ posts: many(post) }))',
        '',
        'export const postRelations = relations(post, ({ one }) => ({ user: one(user, { fields: [post.userId], references: [user.id] }) }))',
        '',
        'export const commentRelations = relations(comment, ({ one }) => ({ user: one(user, { fields: [comment.userId], references: [user.id] }) }))',
      ].join('\n'),
    )
  })

  it('MySQL: FK + datetime fsp:3 + @updatedAt + @default(now())', () => {
    const result = drizzleSchema(
      {
        models: [
          makeModel({
            name: 'User',
            fields: [
              makeField({ name: 'id', type: 'String', isId: true }),
              makeField({ name: 'name', type: 'String' }),
              makeField({
                name: 'createdAt',
                type: 'DateTime',
                hasDefaultValue: true,
                default: { name: 'now', args: [] },
              }),
              makeField({ name: 'updatedAt', type: 'DateTime', isUpdatedAt: true }),
              makeField({
                name: 'posts',
                type: 'Post',
                kind: 'object',
                isList: true,
                isRequired: false,
              }),
            ],
          }),
          makeModel({
            name: 'Post',
            fields: [
              makeField({ name: 'id', type: 'String', isId: true }),
              makeField({ name: 'title', type: 'String' }),
              makeField({ name: 'userId', type: 'String' }),
              makeField({
                name: 'user',
                type: 'User',
                kind: 'object',
                isRequired: true,
                relationFromFields: ['userId'],
                relationToFields: ['id'],
                relationOnDelete: 'Cascade',
              }),
            ],
          }),
        ],
        enums: [],
        types: [],
        indexes: [],
      },
      'mysql',
      [],
    )

    expect(result).toBe(
      [
        "import { datetime, mysqlTable, text } from 'drizzle-orm/mysql-core'",
        "import { relations, sql } from 'drizzle-orm'",
        '',
        "export const user = mysqlTable('user', { id: text('id').primaryKey(), name: text('name').notNull(), createdAt: datetime('createdAt', { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`), updatedAt: datetime('updatedAt', { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`).$onUpdate(() => new Date()) })",
        '',
        "export const post = mysqlTable('post', { id: text('id').primaryKey(), title: text('title').notNull(), userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }) })",
        '',
        'export const userRelations = relations(user, ({ many }) => ({ posts: many(post) }))',
        '',
        'export const postRelations = relations(post, ({ one }) => ({ user: one(user, { fields: [post.userId], references: [user.id] }) }))',
      ].join('\n'),
    )
  })
})

describe('drizzleSchema - SNS full schema (self-referencing + composite PK + indexes + enum)', () => {
  // Full SNS schema: User, Post (self-ref repost), Like (@@id), Follow (@@id),
  // Comment, Notification, MediaObject, PostImage, UserPersonalInformation,
  // UserLoginPassword, UserEmail + ImageStatus enum
  // Provider: SQLite

  const snsIndexes: DMMF.Index[] = [
    {
      model: 'Post',
      type: 'normal',
      isDefinedOnField: false,
      fields: [{ name: 'userId' }, { name: 'createdAt' }],
      dbName: 'Post_userId_createdAt_idx',
    },
    {
      model: 'PostImage',
      type: 'normal',
      isDefinedOnField: false,
      fields: [{ name: 'postId' }, { name: 'sortOrder' }],
      dbName: 'PostImage_postId_sortOrder_idx',
    },
    {
      model: 'Like',
      type: 'normal',
      isDefinedOnField: false,
      fields: [{ name: 'postId' }],
      dbName: 'Like_postId_idx',
    },
    {
      model: 'Follow',
      type: 'normal',
      isDefinedOnField: false,
      fields: [{ name: 'followingId' }],
      dbName: 'Follow_followingId_idx',
    },
    {
      model: 'Follow',
      type: 'normal',
      isDefinedOnField: false,
      fields: [{ name: 'followerId' }],
      dbName: 'Follow_followerId_idx',
    },
    {
      model: 'Comment',
      type: 'normal',
      isDefinedOnField: false,
      fields: [{ name: 'postId' }, { name: 'createdAt' }],
      dbName: 'Comment_postId_createdAt_idx',
    },
    {
      model: 'Notification',
      type: 'normal',
      isDefinedOnField: false,
      fields: [{ name: 'userId' }, { name: 'read' }, { name: 'createdAt' }],
      dbName: 'Notification_userId_read_createdAt_idx',
    },
  ]

  const snsModels: DMMF.Model[] = [
    makeModel({
      name: 'User',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [] },
        }),
        makeField({
          name: 'createdAt',
          type: 'DateTime',
          hasDefaultValue: true,
          default: { name: 'now', args: [] },
        }),
        makeField({ name: 'deletedAt', type: 'DateTime', isRequired: false }),
        // relations
        makeField({
          name: 'personalInformation',
          type: 'UserPersonalInformation',
          kind: 'object',
          isRequired: false,
        }),
        makeField({
          name: 'loginPassword',
          type: 'UserLoginPassword',
          kind: 'object',
          isRequired: false,
        }),
        makeField({ name: 'email', type: 'UserEmail', kind: 'object', isRequired: false }),
        makeField({ name: 'posts', type: 'Post', kind: 'object', isList: true, isRequired: false }),
        makeField({ name: 'likes', type: 'Like', kind: 'object', isList: true, isRequired: false }),
        makeField({
          name: 'followers',
          type: 'Follow',
          kind: 'object',
          isList: true,
          isRequired: false,
          relationName: 'Following',
        }),
        makeField({
          name: 'following',
          type: 'Follow',
          kind: 'object',
          isList: true,
          isRequired: false,
          relationName: 'Follower',
        }),
        makeField({
          name: 'comments',
          type: 'Comment',
          kind: 'object',
          isList: true,
          isRequired: false,
        }),
        makeField({
          name: 'notifications',
          type: 'Notification',
          kind: 'object',
          isList: true,
          isRequired: false,
          relationName: 'NotificationTo',
        }),
        makeField({
          name: 'sentNotifications',
          type: 'Notification',
          kind: 'object',
          isList: true,
          isRequired: false,
          relationName: 'NotificationFrom',
        }),
        makeField({
          name: 'mediaObjects',
          type: 'MediaObject',
          kind: 'object',
          isList: true,
          isRequired: false,
        }),
      ],
    }),
    makeModel({
      name: 'UserPersonalInformation',
      dbName: 'user_personal_information',
      fields: [
        makeField({ name: 'userId', type: 'String', isId: true }),
        makeField({ name: 'username', type: 'String' }),
        makeField({ name: 'bio', type: 'String', isRequired: false }),
        makeField({ name: 'link', type: 'String', isRequired: false }),
        makeField({ name: 'profileImageId', type: 'String', isRequired: false, isUnique: true }),
        makeField({ name: 'coverImageId', type: 'String', isRequired: false, isUnique: true }),
        // relations
        makeField({
          name: 'user',
          type: 'User',
          kind: 'object',
          relationFromFields: ['userId'],
          relationToFields: ['id'],
          relationOnDelete: 'Cascade',
        }),
        makeField({
          name: 'profileImage',
          type: 'MediaObject',
          kind: 'object',
          isRequired: false,
          relationName: 'ProfileImage',
          relationFromFields: ['profileImageId'],
          relationToFields: ['id'],
        }),
        makeField({
          name: 'coverImage',
          type: 'MediaObject',
          kind: 'object',
          isRequired: false,
          relationName: 'CoverImage',
          relationFromFields: ['coverImageId'],
          relationToFields: ['id'],
        }),
      ],
    }),
    makeModel({
      name: 'UserLoginPassword',
      dbName: 'user_login_password',
      fields: [
        makeField({ name: 'userId', type: 'String', isId: true }),
        makeField({ name: 'hashedPassword', type: 'String' }),
        makeField({
          name: 'user',
          type: 'User',
          kind: 'object',
          relationFromFields: ['userId'],
          relationToFields: ['id'],
          relationOnDelete: 'Cascade',
        }),
      ],
    }),
    makeModel({
      name: 'UserEmail',
      dbName: 'user_email',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [] },
        }),
        makeField({ name: 'email', type: 'String', isUnique: true }),
        makeField({ name: 'userId', type: 'String', isUnique: true }),
        makeField({ name: 'verifiedAt', type: 'DateTime', isRequired: false }),
        makeField({
          name: 'user',
          type: 'User',
          kind: 'object',
          relationFromFields: ['userId'],
          relationToFields: ['id'],
          relationOnDelete: 'Cascade',
        }),
      ],
    }),
    makeModel({
      name: 'Post',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [] },
        }),
        makeField({ name: 'content', type: 'String', isRequired: false }),
        makeField({ name: 'userId', type: 'String' }),
        makeField({
          name: 'createdAt',
          type: 'DateTime',
          hasDefaultValue: true,
          default: { name: 'now', args: [] },
        }),
        makeField({ name: 'deletedAt', type: 'DateTime', isRequired: false }),
        makeField({ name: 'repostOfId', type: 'String', isRequired: false }),
        // Self-referencing relation
        makeField({
          name: 'repostOf',
          type: 'Post',
          kind: 'object',
          isRequired: false,
          relationName: 'Repost',
          relationFromFields: ['repostOfId'],
          relationToFields: ['id'],
        }),
        makeField({
          name: 'reposts',
          type: 'Post',
          kind: 'object',
          isList: true,
          isRequired: false,
          relationName: 'Repost',
        }),
        // Normal relations
        makeField({
          name: 'user',
          type: 'User',
          kind: 'object',
          relationFromFields: ['userId'],
          relationToFields: ['id'],
          relationOnDelete: 'Cascade',
        }),
        makeField({
          name: 'images',
          type: 'PostImage',
          kind: 'object',
          isList: true,
          isRequired: false,
        }),
        makeField({ name: 'likes', type: 'Like', kind: 'object', isList: true, isRequired: false }),
        makeField({
          name: 'comments',
          type: 'Comment',
          kind: 'object',
          isList: true,
          isRequired: false,
        }),
      ],
    }),
    makeModel({
      name: 'MediaObject',
      dbName: 'media_object',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [] },
        }),
        makeField({ name: 'r2Key', type: 'String', isUnique: true }),
        makeField({ name: 'contentType', type: 'String' }),
        makeField({ name: 'sizeBytes', type: 'Int', isRequired: false }),
        makeField({
          name: 'status',
          type: 'ImageStatus',
          kind: 'enum',
          hasDefaultValue: true,
          default: 'PENDING',
        }),
        makeField({ name: 'uploadedBy', type: 'String' }),
        makeField({
          name: 'createdAt',
          type: 'DateTime',
          hasDefaultValue: true,
          default: { name: 'now', args: [] },
        }),
        // relations
        makeField({
          name: 'uploader',
          type: 'User',
          kind: 'object',
          relationFromFields: ['uploadedBy'],
          relationToFields: ['id'],
        }),
        makeField({
          name: 'profileUser',
          type: 'UserPersonalInformation',
          kind: 'object',
          isRequired: false,
          relationName: 'ProfileImage',
        }),
        makeField({
          name: 'coverUser',
          type: 'UserPersonalInformation',
          kind: 'object',
          isRequired: false,
          relationName: 'CoverImage',
        }),
        makeField({
          name: 'postImages',
          type: 'PostImage',
          kind: 'object',
          isList: true,
          isRequired: false,
        }),
      ],
    }),
    makeModel({
      name: 'PostImage',
      dbName: 'post_image',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [] },
        }),
        makeField({ name: 'postId', type: 'String' }),
        makeField({ name: 'mediaId', type: 'String' }),
        makeField({ name: 'sortOrder', type: 'Int', hasDefaultValue: true, default: 0 }),
        makeField({
          name: 'post',
          type: 'Post',
          kind: 'object',
          relationFromFields: ['postId'],
          relationToFields: ['id'],
          relationOnDelete: 'Cascade',
        }),
        makeField({
          name: 'media',
          type: 'MediaObject',
          kind: 'object',
          relationFromFields: ['mediaId'],
          relationToFields: ['id'],
        }),
      ],
    }),
    makeModel({
      name: 'Like',
      primaryKey: { name: null, fields: ['userId', 'postId'] },
      fields: [
        makeField({ name: 'userId', type: 'String' }),
        makeField({ name: 'postId', type: 'String' }),
        makeField({
          name: 'createdAt',
          type: 'DateTime',
          hasDefaultValue: true,
          default: { name: 'now', args: [] },
        }),
        makeField({
          name: 'user',
          type: 'User',
          kind: 'object',
          relationFromFields: ['userId'],
          relationToFields: ['id'],
          relationOnDelete: 'Cascade',
        }),
        makeField({
          name: 'post',
          type: 'Post',
          kind: 'object',
          relationFromFields: ['postId'],
          relationToFields: ['id'],
          relationOnDelete: 'Cascade',
        }),
      ],
    }),
    makeModel({
      name: 'Follow',
      primaryKey: { name: null, fields: ['followerId', 'followingId'] },
      fields: [
        makeField({ name: 'followerId', type: 'String' }),
        makeField({ name: 'followingId', type: 'String' }),
        makeField({
          name: 'createdAt',
          type: 'DateTime',
          hasDefaultValue: true,
          default: { name: 'now', args: [] },
        }),
        makeField({
          name: 'follower',
          type: 'User',
          kind: 'object',
          relationName: 'Follower',
          relationFromFields: ['followerId'],
          relationToFields: ['id'],
          relationOnDelete: 'Cascade',
        }),
        makeField({
          name: 'following',
          type: 'User',
          kind: 'object',
          relationName: 'Following',
          relationFromFields: ['followingId'],
          relationToFields: ['id'],
          relationOnDelete: 'Cascade',
        }),
      ],
    }),
    makeModel({
      name: 'Comment',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [] },
        }),
        makeField({ name: 'body', type: 'String' }),
        makeField({ name: 'userId', type: 'String' }),
        makeField({ name: 'postId', type: 'String' }),
        makeField({
          name: 'createdAt',
          type: 'DateTime',
          hasDefaultValue: true,
          default: { name: 'now', args: [] },
        }),
        makeField({ name: 'deletedAt', type: 'DateTime', isRequired: false }),
        makeField({
          name: 'user',
          type: 'User',
          kind: 'object',
          relationFromFields: ['userId'],
          relationToFields: ['id'],
          relationOnDelete: 'Cascade',
        }),
        makeField({
          name: 'post',
          type: 'Post',
          kind: 'object',
          relationFromFields: ['postId'],
          relationToFields: ['id'],
          relationOnDelete: 'Cascade',
        }),
      ],
    }),
    makeModel({
      name: 'Notification',
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [] },
        }),
        makeField({ name: 'type', type: 'String' }),
        makeField({ name: 'read', type: 'Boolean', hasDefaultValue: true, default: false }),
        makeField({ name: 'fromUserId', type: 'String' }),
        makeField({ name: 'userId', type: 'String' }),
        makeField({ name: 'postId', type: 'String', isRequired: false }),
        makeField({ name: 'commentId', type: 'String', isRequired: false }),
        makeField({
          name: 'createdAt',
          type: 'DateTime',
          hasDefaultValue: true,
          default: { name: 'now', args: [] },
        }),
        makeField({
          name: 'from',
          type: 'User',
          kind: 'object',
          relationName: 'NotificationFrom',
          relationFromFields: ['fromUserId'],
          relationToFields: ['id'],
          relationOnDelete: 'Cascade',
        }),
        makeField({
          name: 'user',
          type: 'User',
          kind: 'object',
          relationName: 'NotificationTo',
          relationFromFields: ['userId'],
          relationToFields: ['id'],
          relationOnDelete: 'Cascade',
        }),
      ],
    }),
  ]

  const snsEnums: DMMF.DatamodelEnum[] = [
    {
      name: 'ImageStatus',
      values: [
        { name: 'PENDING', dbName: null },
        { name: 'ACTIVE', dbName: null },
        { name: 'DELETED', dbName: null },
      ],
      dbName: null,
    },
  ]

  it('generates correct SQLite schema for full SNS with self-referencing Post', () => {
    const result = drizzleSchema(
      { models: snsModels, enums: snsEnums, types: [], indexes: snsIndexes },
      'sqlite',
      snsIndexes,
    )

    expect(result).toBe(
      [
        // imports
        "import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'",
        "import { relations, sql } from 'drizzle-orm'",
        '',
        // User
        "export const user = sqliteTable('user', { id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()), createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`), deletedAt: integer('deletedAt', { mode: 'timestamp_ms' }) })",
        '',
        // UserPersonalInformation
        "export const userPersonalInformation = sqliteTable('user_personal_information', { userId: text('userId').primaryKey().references(() => user.id, { onDelete: 'cascade' }), username: text('username').notNull(), bio: text('bio'), link: text('link'), profileImageId: text('profileImageId').unique().references(() => mediaObject.id), coverImageId: text('coverImageId').unique().references(() => mediaObject.id) })",
        '',
        // UserLoginPassword
        "export const userLoginPassword = sqliteTable('user_login_password', { userId: text('userId').primaryKey().references(() => user.id, { onDelete: 'cascade' }), hashedPassword: text('hashedPassword').notNull() })",
        '',
        // UserEmail
        "export const userEmail = sqliteTable('user_email', { id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()), email: text('email').notNull().unique(), userId: text('userId').notNull().unique().references(() => user.id, { onDelete: 'cascade' }), verifiedAt: integer('verifiedAt', { mode: 'timestamp_ms' }) })",
        '',
        // Post — repostOfId must NOT have .references() (self-referencing)
        "export const post = sqliteTable('post', { id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()), content: text('content'), userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }), createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`), deletedAt: integer('deletedAt', { mode: 'timestamp_ms' }), repostOfId: text('repostOfId') }, (table) => [index('Post_userId_createdAt_idx').on(table.userId, table.createdAt)])",
        '',
        // MediaObject — enum as text with enum option
        "export const mediaObject = sqliteTable('media_object', { id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()), r2Key: text('r2Key').notNull().unique(), contentType: text('contentType').notNull(), sizeBytes: integer('sizeBytes'), status: text('status', { enum: ['PENDING', 'ACTIVE', 'DELETED'] }).notNull().default('PENDING'), uploadedBy: text('uploadedBy').notNull().references(() => user.id), createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`) })",
        '',
        // PostImage
        "export const postImage = sqliteTable('post_image', { id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()), postId: text('postId').notNull().references(() => post.id, { onDelete: 'cascade' }), mediaId: text('mediaId').notNull().references(() => mediaObject.id), sortOrder: integer('sortOrder').notNull().default(0) }, (table) => [index('PostImage_postId_sortOrder_idx').on(table.postId, table.sortOrder)])",
        '',
        // Like — composite PK (@@id)
        "export const like = sqliteTable('like', { userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }), postId: text('postId').notNull().references(() => post.id, { onDelete: 'cascade' }), createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`) }, (table) => [primaryKey({ columns: [table.userId, table.postId] }), index('Like_postId_idx').on(table.postId)])",
        '',
        // Follow — composite PK (@@id) + multiple indexes
        "export const follow = sqliteTable('follow', { followerId: text('followerId').notNull().references(() => user.id, { onDelete: 'cascade' }), followingId: text('followingId').notNull().references(() => user.id, { onDelete: 'cascade' }), createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`) }, (table) => [primaryKey({ columns: [table.followerId, table.followingId] }), index('Follow_followingId_idx').on(table.followingId), index('Follow_followerId_idx').on(table.followerId)])",
        '',
        // Comment
        "export const comment = sqliteTable('comment', { id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()), body: text('body').notNull(), userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }), postId: text('postId').notNull().references(() => post.id, { onDelete: 'cascade' }), createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`), deletedAt: integer('deletedAt', { mode: 'timestamp_ms' }) }, (table) => [index('Comment_postId_createdAt_idx').on(table.postId, table.createdAt)])",
        '',
        // Notification — multiple FKs to same table with relationName
        "export const notification = sqliteTable('notification', { id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()), type: text('type').notNull(), read: integer('read', { mode: 'boolean' }).notNull().default(false), fromUserId: text('fromUserId').notNull().references(() => user.id, { onDelete: 'cascade' }), userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }), postId: text('postId'), commentId: text('commentId'), createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`) }, (table) => [index('Notification_userId_read_createdAt_idx').on(table.userId, table.read, table.createdAt)])",
        '',
        // Relations
        "export const userRelations = relations(user, ({ one, many }) => ({ personalInformation: one(userPersonalInformation), loginPassword: one(userLoginPassword), email: one(userEmail), posts: many(post), likes: many(like), followers: many(follow, { relationName: 'Following' }), following: many(follow, { relationName: 'Follower' }), comments: many(comment), notifications: many(notification, { relationName: 'NotificationTo' }), sentNotifications: many(notification, { relationName: 'NotificationFrom' }), mediaObjects: many(mediaObject) }))",
        '',
        "export const userPersonalInformationRelations = relations(userPersonalInformation, ({ one }) => ({ user: one(user, { fields: [userPersonalInformation.userId], references: [user.id] }), profileImage: one(mediaObject, { fields: [userPersonalInformation.profileImageId], references: [mediaObject.id], relationName: 'ProfileImage' }), coverImage: one(mediaObject, { fields: [userPersonalInformation.coverImageId], references: [mediaObject.id], relationName: 'CoverImage' }) }))",
        '',
        'export const userLoginPasswordRelations = relations(userLoginPassword, ({ one }) => ({ user: one(user, { fields: [userLoginPassword.userId], references: [user.id] }) }))',
        '',
        'export const userEmailRelations = relations(userEmail, ({ one }) => ({ user: one(user, { fields: [userEmail.userId], references: [user.id] }) }))',
        '',
        // Post relations — self-referencing: repostOf uses one(post, ...) with relationName
        "export const postRelations = relations(post, ({ one, many }) => ({ repostOf: one(post, { fields: [post.repostOfId], references: [post.id], relationName: 'Repost' }), reposts: many(post, { relationName: 'Repost' }), user: one(user, { fields: [post.userId], references: [user.id] }), images: many(postImage), likes: many(like), comments: many(comment) }))",
        '',
        'export const mediaObjectRelations = relations(mediaObject, ({ one, many }) => ({ uploader: one(user, { fields: [mediaObject.uploadedBy], references: [user.id] }), profileUser: one(userPersonalInformation), coverUser: one(userPersonalInformation), postImages: many(postImage) }))',
        '',
        'export const postImageRelations = relations(postImage, ({ one }) => ({ post: one(post, { fields: [postImage.postId], references: [post.id] }), media: one(mediaObject, { fields: [postImage.mediaId], references: [mediaObject.id] }) }))',
        '',
        'export const likeRelations = relations(like, ({ one }) => ({ user: one(user, { fields: [like.userId], references: [user.id] }), post: one(post, { fields: [like.postId], references: [post.id] }) }))',
        '',
        "export const followRelations = relations(follow, ({ one }) => ({ follower: one(user, { fields: [follow.followerId], references: [user.id], relationName: 'Follower' }), following: one(user, { fields: [follow.followingId], references: [user.id], relationName: 'Following' }) }))",
        '',
        'export const commentRelations = relations(comment, ({ one }) => ({ user: one(user, { fields: [comment.userId], references: [user.id] }), post: one(post, { fields: [comment.postId], references: [post.id] }) }))',
        '',
        "export const notificationRelations = relations(notification, ({ one }) => ({ from: one(user, { fields: [notification.fromUserId], references: [user.id], relationName: 'NotificationFrom' }), user: one(user, { fields: [notification.userId], references: [user.id], relationName: 'NotificationTo' }) }))",
      ].join('\n'),
    )
  })
})
