import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vitest'
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
        "export const post = pgTable('post', { id: integer('id').primaryKey(), updatedAt: timestamp('updatedAt').notNull().$onUpdate(() => new Date()) })",
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
        "export const user = mysqlTable('user', { id: int('id').primaryKey().autoincrement(), name: text('name').notNull(), active: boolean('active').notNull(), createdAt: datetime('createdAt').notNull() })",
      ].join('\n'),
    )
  })

  it('generates default(sql`now()`) for MySQL @default(now())', () => {
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
        "export const post = mysqlTable('post', { id: int('id').primaryKey(), createdAt: datetime('createdAt').notNull().default(sql`now()`) })",
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
        "export const user = sqliteTable('user', { id: integer('id').primaryKey(), name: text('name').notNull(), active: integer('active', { mode: 'boolean' }).notNull(), data: text('data', { mode: 'json' }).notNull(), createdAt: integer('createdAt', { mode: 'timestamp' }).notNull() })",
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
        "export const post = pgTable('post', { id: integer('id').primaryKey(), userId: integer('userId').notNull() })",
        '',
        'export const userRelations = relations(user, ({ many }) => ({ posts: many(post) }))',
        '',
        'export const postRelations = relations(post, ({ one }) => ({ user: one(user, { fields: [post.userId], references: [user.id] }) }))',
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

  it('generates default(sql`(unixepoch())`) for SQLite @default(now())', () => {
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
        "export const post = sqliteTable('post', { id: integer('id').primaryKey(), createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().default(sql`(unixepoch())`) })",
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

describe('drizzleSchema - Unsupported provider', () => {
  it('throws for mongodb', () => {
    expect(() =>
      drizzleSchema({ models: [], enums: [], types: [], indexes: [] }, 'mongodb', []),
    ).toThrow('Unsupported provider: mongodb')
  })

  it('throws for sqlserver', () => {
    expect(() =>
      drizzleSchema({ models: [], enums: [], types: [], indexes: [] }, 'sqlserver', []),
    ).toThrow('Unsupported provider: sqlserver')
  })
})
