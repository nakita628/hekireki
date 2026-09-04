import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import { drizzleSchema } from './drizzle.js'

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

function makeDatamodel(models: DMMF.Model[], enums: DMMF.DatamodelEnum[] = []): DMMF.Datamodel {
  return { models, enums, types: [], indexes: [] }
}

describe('drizzleSchema', () => {
  describe('postgresql', () => {
    it('should generate basic User + Post schema', () => {
      const datamodel = makeDatamodel([
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
            makeField({ name: 'email', type: 'String', isUnique: true }),
            makeField({
              name: 'posts',
              kind: 'object',
              type: 'Post',
              isList: true,
              isRequired: false,
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
            makeField({ name: 'userId', type: 'Int' }),
            makeField({
              name: 'author',
              kind: 'object',
              type: 'User',
              isList: false,
              isRequired: true,
              relationName: 'PostToUser',
              relationFromFields: ['userId'],
              relationToFields: ['id'],
            }),
          ],
        }),
      ])

      const result = drizzleSchema(datamodel, 'postgresql', [])

      expect(result).toBe(
        "import { integer, pgTable, serial, text } from 'drizzle-orm/pg-core'\nimport { relations } from 'drizzle-orm'\n\nexport const user = pgTable('user', { id: serial('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull().unique() })\n\nexport const post = pgTable('post', { id: serial('id').primaryKey(), title: text('title').notNull(), userId: integer('userId').notNull().references(() => user.id) })\n\nexport const userRelations = relations(user, ({ many }) => ({ posts: many(post) }))\n\nexport const postRelations = relations(post, ({ one }) => ({ author: one(user, { fields: [post.userId], references: [user.id] }) }))",
      )
    })
  })

  describe('sqlite', () => {
    it('should generate SQLite schema with correct type functions', () => {
      const datamodel = makeDatamodel([
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
      ])

      const result = drizzleSchema(datamodel, 'sqlite', [])

      expect(result).toBe(
        "import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'\n\nexport const user = sqliteTable('user', { id: integer('id').primaryKey({ autoIncrement: true }), name: text('name').notNull(), active: integer('active', { mode: 'boolean' }).notNull(), createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull() })",
      )
    })
  })

  describe('mysql', () => {
    it('should generate MySQL schema', () => {
      const datamodel = makeDatamodel([
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
          ],
        }),
      ])

      const result = drizzleSchema(datamodel, 'mysql', [])

      expect(result).toBe(
        "import { int, mysqlTable, text } from 'drizzle-orm/mysql-core'\n\nexport const user = mysqlTable('user', { id: int('id').primaryKey().autoincrement(), name: text('name').notNull() })",
      )
    })
  })

  describe('enum fields', () => {
    it('should generate PostgreSQL enum', () => {
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
              makeField({ name: 'role', type: 'Role', kind: 'enum' }),
            ],
          }),
        ],
        [
          {
            name: 'Role',
            values: [
              { name: 'ADMIN', dbName: null },
              { name: 'USER', dbName: null },
            ],
            dbName: null,
          },
        ],
      )

      const result = drizzleSchema(datamodel, 'postgresql', [])

      expect(result).toBe(
        "import { pgEnum, pgTable, serial } from 'drizzle-orm/pg-core'\n\nexport const roleEnum = pgEnum('Role', ['ADMIN', 'USER'])\n\nexport const user = pgTable('user', { id: serial('id').primaryKey(), role: roleEnum('role').notNull() })",
      )
    })

    it('declares a shared PostgreSQL enum once for multiple columns', () => {
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
              makeField({ name: 'role', type: 'Role', kind: 'enum' }),
              makeField({ name: 'backupRole', type: 'Role', kind: 'enum', isRequired: false }),
            ],
          }),
        ],
        [
          {
            name: 'Role',
            values: [
              { name: 'ADMIN', dbName: null },
              { name: 'USER', dbName: null },
            ],
            dbName: null,
          },
        ],
      )

      const result = drizzleSchema(datamodel, 'postgresql', [])

      expect(result).toBe(
        "import { pgEnum, pgTable, serial } from 'drizzle-orm/pg-core'\n\nexport const roleEnum = pgEnum('Role', ['ADMIN', 'USER'])\n\nexport const user = pgTable('user', { id: serial('id').primaryKey(), role: roleEnum('role').notNull(), backupRole: roleEnum('backupRole') })",
      )
    })

    it('wraps a scalar list with array() before notNull()', () => {
      const datamodel = makeDatamodel([
        makeModel({
          name: 'Account',
          fields: [
            makeField({
              name: 'id',
              type: 'Int',
              isId: true,
              hasDefaultValue: true,
              default: { name: 'autoincrement', args: [] },
            }),
            makeField({ name: 'tags', type: 'String', isList: true }),
          ],
        }),
      ])

      const result = drizzleSchema(datamodel, 'postgresql', [])

      expect(result).toBe(
        "import { pgTable, serial, text } from 'drizzle-orm/pg-core'\n\nexport const account = pgTable('account', { id: serial('id').primaryKey(), tags: text('tags').array().notNull() })",
      )
    })

    it('should generate SQLite enum as text with enum option', () => {
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
              makeField({ name: 'role', type: 'Role', kind: 'enum' }),
            ],
          }),
        ],
        [
          {
            name: 'Role',
            values: [
              { name: 'ADMIN', dbName: null },
              { name: 'USER', dbName: null },
            ],
            dbName: null,
          },
        ],
      )

      const result = drizzleSchema(datamodel, 'sqlite', [])

      expect(result).toBe(
        "import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'\n\nexport const user = sqliteTable('user', { id: integer('id').primaryKey({ autoIncrement: true }), role: text('role', { enum: ['ADMIN', 'USER'] }).notNull() })",
      )
    })
  })

  describe('optional fields', () => {
    it('should not add .notNull() for optional fields', () => {
      const datamodel = makeDatamodel([
        makeModel({
          name: 'Profile',
          fields: [
            makeField({
              name: 'id',
              type: 'Int',
              isId: true,
              hasDefaultValue: true,
              default: { name: 'autoincrement', args: [] },
            }),
            makeField({ name: 'bio', type: 'String', isRequired: false }),
            makeField({ name: 'age', type: 'Int', isRequired: false }),
          ],
        }),
      ])

      const result = drizzleSchema(datamodel, 'postgresql', [])

      expect(result).toBe(
        "import { integer, pgTable, serial, text } from 'drizzle-orm/pg-core'\n\nexport const profile = pgTable('profile', { id: serial('id').primaryKey(), bio: text('bio'), age: integer('age') })",
      )
    })
  })

  describe('default values', () => {
    it('should handle string default', () => {
      const datamodel = makeDatamodel([
        makeModel({
          name: 'Config',
          fields: [
            makeField({
              name: 'id',
              type: 'Int',
              isId: true,
              hasDefaultValue: true,
              default: { name: 'autoincrement', args: [] },
            }),
            makeField({
              name: 'locale',
              type: 'String',
              hasDefaultValue: true,
              default: 'en',
            }),
          ],
        }),
      ])

      const result = drizzleSchema(datamodel, 'postgresql', [])

      expect(result).toBe(
        "import { pgTable, serial, text } from 'drizzle-orm/pg-core'\n\nexport const config = pgTable('config', { id: serial('id').primaryKey(), locale: text('locale').notNull().default('en') })",
      )
    })

    it('should handle now() default on PostgreSQL', () => {
      const datamodel = makeDatamodel([
        makeModel({
          name: 'Event',
          fields: [
            makeField({
              name: 'id',
              type: 'Int',
              isId: true,
              hasDefaultValue: true,
              default: { name: 'autoincrement', args: [] },
            }),
            makeField({
              name: 'createdAt',
              type: 'DateTime',
              hasDefaultValue: true,
              default: { name: 'now', args: [] },
            }),
          ],
        }),
      ])

      const result = drizzleSchema(datamodel, 'postgresql', [])

      expect(result).toBe(
        "import { pgTable, serial, timestamp } from 'drizzle-orm/pg-core'\n\nexport const event = pgTable('event', { id: serial('id').primaryKey(), createdAt: timestamp('createdAt').notNull().defaultNow() })",
      )
    })

    it('should handle now() default on SQLite with sql`(unixepoch())`', () => {
      const datamodel = makeDatamodel([
        makeModel({
          name: 'Event',
          fields: [
            makeField({
              name: 'id',
              type: 'Int',
              isId: true,
              hasDefaultValue: true,
              default: { name: 'autoincrement', args: [] },
            }),
            makeField({
              name: 'createdAt',
              type: 'DateTime',
              hasDefaultValue: true,
              default: { name: 'now', args: [] },
            }),
          ],
        }),
      ])

      const result = drizzleSchema(datamodel, 'sqlite', [])

      expect(result).toBe(
        "import { integer, sqliteTable } from 'drizzle-orm/sqlite-core'\nimport { sql } from 'drizzle-orm'\n\nexport const event = sqliteTable('event', { id: integer('id').primaryKey({ autoIncrement: true }), createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull().default(sql`(unixepoch() * 1000)`) })",
      )
    })

    it('should handle numeric default', () => {
      const datamodel = makeDatamodel([
        makeModel({
          name: 'Counter',
          fields: [
            makeField({
              name: 'id',
              type: 'Int',
              isId: true,
              hasDefaultValue: true,
              default: { name: 'autoincrement', args: [] },
            }),
            makeField({
              name: 'count',
              type: 'Int',
              hasDefaultValue: true,
              default: 0,
            }),
          ],
        }),
      ])

      const result = drizzleSchema(datamodel, 'postgresql', [])

      expect(result).toBe(
        "import { integer, pgTable, serial } from 'drizzle-orm/pg-core'\n\nexport const counter = pgTable('counter', { id: serial('id').primaryKey(), count: integer('count').notNull().default(0) })",
      )
    })

    it('should handle boolean default', () => {
      const datamodel = makeDatamodel([
        makeModel({
          name: 'Feature',
          fields: [
            makeField({
              name: 'id',
              type: 'Int',
              isId: true,
              hasDefaultValue: true,
              default: { name: 'autoincrement', args: [] },
            }),
            makeField({
              name: 'enabled',
              type: 'Boolean',
              hasDefaultValue: true,
              default: false,
            }),
          ],
        }),
      ])

      const result = drizzleSchema(datamodel, 'postgresql', [])

      expect(result).toBe(
        "import { boolean, pgTable, serial } from 'drizzle-orm/pg-core'\n\nexport const feature = pgTable('feature', { id: serial('id').primaryKey(), enabled: boolean('enabled').notNull().default(false) })",
      )
    })

    it('should use the cuid package (v1) for cuid() with args [1]', () => {
      const datamodel = makeDatamodel([
        makeModel({
          name: 'User',
          fields: [
            makeField({
              name: 'id',
              type: 'String',
              isId: true,
              hasDefaultValue: true,
              default: { name: 'cuid', args: [1] },
            }),
          ],
        }),
      ])

      const result = drizzleSchema(datamodel, 'postgresql', [])

      expect(result).toBe(
        "import { pgTable, text } from 'drizzle-orm/pg-core'\nimport cuid from 'cuid'\n\nexport const user = pgTable('user', { id: text('id').primaryKey().$defaultFn(() => cuid()) })",
      )
    })

    it('should treat cuid() with empty args as v1 (Prisma version resilience)', () => {
      const datamodel = makeDatamodel([
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
      ])

      const result = drizzleSchema(datamodel, 'postgresql', [])

      expect(result).toBe(
        "import { pgTable, text } from 'drizzle-orm/pg-core'\nimport cuid from 'cuid'\n\nexport const user = pgTable('user', { id: text('id').primaryKey().$defaultFn(() => cuid()) })",
      )
    })

    it('should use @paralleldrive/cuid2 for cuid(2) with args [2]', () => {
      const datamodel = makeDatamodel([
        makeModel({
          name: 'User',
          fields: [
            makeField({
              name: 'id',
              type: 'String',
              isId: true,
              hasDefaultValue: true,
              default: { name: 'cuid', args: [2] },
            }),
          ],
        }),
      ])

      const result = drizzleSchema(datamodel, 'postgresql', [])

      expect(result).toBe(
        "import { pgTable, text } from 'drizzle-orm/pg-core'\nimport { createId } from '@paralleldrive/cuid2'\n\nexport const user = pgTable('user', { id: text('id').primaryKey().$defaultFn(() => createId()) })",
      )
    })

    it('should use the nanoid package for nanoid()', () => {
      const datamodel = makeDatamodel([
        makeModel({
          name: 'User',
          fields: [
            makeField({
              name: 'id',
              type: 'String',
              isId: true,
              hasDefaultValue: true,
              default: { name: 'nanoid', args: [] },
            }),
          ],
        }),
      ])

      const result = drizzleSchema(datamodel, 'postgresql', [])

      expect(result).toBe(
        "import { pgTable, text } from 'drizzle-orm/pg-core'\nimport { nanoid } from 'nanoid'\n\nexport const user = pgTable('user', { id: text('id').primaryKey().$defaultFn(() => nanoid()) })",
      )
    })

    it('should use the ulidx package for ulid()', () => {
      const datamodel = makeDatamodel([
        makeModel({
          name: 'User',
          fields: [
            makeField({
              name: 'id',
              type: 'String',
              isId: true,
              hasDefaultValue: true,
              default: { name: 'ulid', args: [] },
            }),
          ],
        }),
      ])

      const result = drizzleSchema(datamodel, 'postgresql', [])

      expect(result).toBe(
        "import { pgTable, text } from 'drizzle-orm/pg-core'\nimport { ulid } from 'ulidx'\n\nexport const user = pgTable('user', { id: text('id').primaryKey().$defaultFn(() => ulid()) })",
      )
    })

    it('should use crypto.randomUUID() for uuid() without extra imports', () => {
      const datamodel = makeDatamodel([
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
      ])

      const result = drizzleSchema(datamodel, 'postgresql', [])

      expect(result).toBe(
        "import { pgTable, text } from 'drizzle-orm/pg-core'\n\nexport const user = pgTable('user', { id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()) })",
      )
    })

    it('should separate multiple enum declarations with blank lines', () => {
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
              makeField({ name: 'role', type: 'Role', kind: 'enum' }),
              makeField({ name: 'status', type: 'Status', kind: 'enum' }),
            ],
          }),
        ],
        [
          {
            name: 'Role',
            values: [
              { name: 'ADMIN', dbName: null },
              { name: 'USER', dbName: null },
            ],
            dbName: null,
          },
          {
            name: 'Status',
            values: [
              { name: 'ACTIVE', dbName: null },
              { name: 'INACTIVE', dbName: null },
            ],
            dbName: null,
          },
        ],
      )

      const result = drizzleSchema(datamodel, 'postgresql', [])

      expect(result).toBe(
        `import { pgEnum, pgTable, serial } from 'drizzle-orm/pg-core'

export const roleEnum = pgEnum('Role', ['ADMIN', 'USER'])

export const statusEnum = pgEnum('Status', ['ACTIVE', 'INACTIVE'])

export const user = pgTable('user', { id: serial('id').primaryKey(), role: roleEnum('role').notNull(), status: statusEnum('status').notNull() })`,
      )
    })

    it('should generate a uuid v7 default with a named import for uuid(7)', () => {
      const datamodel = makeDatamodel([
        makeModel({
          name: 'User',
          fields: [
            makeField({
              name: 'id',
              type: 'String',
              isId: true,
              hasDefaultValue: true,
              default: { name: 'uuid', args: [7] },
            }),
          ],
        }),
      ])

      const result = drizzleSchema(datamodel, 'postgresql', [])

      expect(result).toBe(
        "import { pgTable, text } from 'drizzle-orm/pg-core'\nimport { v7 as uuidv7 } from 'uuid'\n\nexport const user = pgTable('user', { id: text('id').primaryKey().$defaultFn(() => uuidv7()) })",
      )
    })
  })
})

describe('torture corners', () => {
  it('routes an implicit named m2m through a junction table with composite PK', () => {
    const datamodel = makeDatamodel([
      makeModel({
        name: 'Actor',
        fields: [
          makeField({
            name: 'id',
            type: 'Int',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'autoincrement', args: [] },
          }),
          makeField({
            name: 'films',
            kind: 'object',
            type: 'Film',
            isList: true,
            relationName: 'cast',
            relationFromFields: [],
            relationToFields: [],
          }),
        ],
      }),
      makeModel({
        name: 'Film',
        fields: [
          makeField({
            name: 'id',
            type: 'Int',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'autoincrement', args: [] },
          }),
          makeField({
            name: 'actors',
            kind: 'object',
            type: 'Actor',
            isList: true,
            relationName: 'cast',
            relationFromFields: [],
            relationToFields: [],
          }),
        ],
      }),
    ])

    expect(drizzleSchema(datamodel, 'postgresql', [])).toBe(
      `import { integer, pgTable, primaryKey, serial } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const actor = pgTable('actor', { id: serial('id').primaryKey() })

export const film = pgTable('film', { id: serial('id').primaryKey() })

export const cast = pgTable('_cast', { A: integer('A').notNull().references(() => actor.id, { onDelete: 'cascade' }), B: integer('B').notNull().references(() => film.id, { onDelete: 'cascade' }) }, (table) => [primaryKey({ columns: [table.A, table.B] })])

export const actorRelations = relations(actor, ({ many }) => ({ films: many(cast) }))

export const filmRelations = relations(film, ({ many }) => ({ actors: many(cast) }))

export const castRelations = relations(cast, ({ one }) => ({ actor: one(actor, { fields: [cast.A], references: [actor.id] }), film: one(film, { fields: [cast.B], references: [film.id] }) }))`,
    )
  })

  it('emits a composite FK as a table-level foreignKey() and a full-column one()', () => {
    const datamodel = makeDatamodel([
      makeModel({
        name: 'Warehouse',
        uniqueFields: [['country', 'code']],
        fields: [
          makeField({
            name: 'id',
            type: 'Int',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'autoincrement', args: [] },
          }),
          makeField({ name: 'country', type: 'String' }),
          makeField({ name: 'code', type: 'String' }),
          makeField({
            name: 'stocks',
            kind: 'object',
            type: 'Stock',
            isList: true,
            relationName: 'StockToWarehouse',
            relationFromFields: [],
            relationToFields: [],
          }),
        ],
      }),
      makeModel({
        name: 'Stock',
        fields: [
          makeField({
            name: 'id',
            type: 'Int',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'autoincrement', args: [] },
          }),
          makeField({ name: 'country', type: 'String' }),
          makeField({ name: 'code', type: 'String' }),
          makeField({
            name: 'warehouse',
            kind: 'object',
            type: 'Warehouse',
            relationName: 'StockToWarehouse',
            relationFromFields: ['country', 'code'],
            relationToFields: ['country', 'code'],
            relationOnDelete: 'Cascade',
          }),
        ],
      }),
    ])

    expect(drizzleSchema(datamodel, 'postgresql', [])).toBe(
      `import { foreignKey, pgTable, serial, text, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const warehouse = pgTable('warehouse', { id: serial('id').primaryKey(), country: text('country').notNull(), code: text('code').notNull() }, (table) => [unique().on(table.country, table.code)])

export const stock = pgTable('stock', { id: serial('id').primaryKey(), country: text('country').notNull(), code: text('code').notNull() }, (table) => [foreignKey({ columns: [table.country, table.code], foreignColumns: [warehouse.country, warehouse.code] }).onDelete('cascade')])

export const warehouseRelations = relations(warehouse, ({ many }) => ({ stocks: many(stock) }))

export const stockRelations = relations(stock, ({ one }) => ({ warehouse: one(warehouse, { fields: [stock.country, stock.code], references: [warehouse.country, warehouse.code] }) }))`,
    )
  })

  it('maps @map enum values into pgEnum, arrays, and defaults', () => {
    const datamodel = makeDatamodel(
      [
        makeModel({
          name: 'Board',
          fields: [
            makeField({
              name: 'id',
              type: 'Int',
              isId: true,
              hasDefaultValue: true,
              default: { name: 'autoincrement', args: [] },
            }),
            makeField({
              name: 'visibility',
              kind: 'enum',
              type: 'Visibility',
              hasDefaultValue: true,
              default: 'LINK_ONLY',
            }),
            makeField({ name: 'audiences', kind: 'enum', type: 'Visibility', isList: true }),
          ],
        }),
      ],
      [
        {
          name: 'Visibility',
          dbName: 'visibility_level',
          values: [
            { name: 'PUBLIC', dbName: 'public' },
            { name: 'PRIVATE', dbName: 'private' },
            { name: 'LINK_ONLY', dbName: 'link_only' },
          ],
        },
      ],
    )

    expect(drizzleSchema(datamodel, 'postgresql', [])).toBe(
      `import { pgEnum, pgTable, serial } from 'drizzle-orm/pg-core'

export const visibilityEnum = pgEnum('visibility_level', ['public', 'private', 'link_only'])

export const board = pgTable('board', { id: serial('id').primaryKey(), visibility: visibilityEnum('visibility').notNull().default('link_only'), audiences: visibilityEnum('audiences').array().notNull() })`,
    )
  })

  it('keeps bigserial PKs, SQL-literal BigInt defaults, escaped strings, and Date defaults', () => {
    const datamodel = makeDatamodel([
      makeModel({
        name: 'Torture',
        fields: [
          makeField({
            name: 'id',
            type: 'BigInt',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'autoincrement', args: [] },
          }),
          makeField({
            name: 'big',
            type: 'BigInt',
            hasDefaultValue: true,
            default: '9007199254740993',
          }),
          makeField({
            name: 'quoted',
            type: 'String',
            hasDefaultValue: true,
            default: 'it\'s a "quote" and a \\ backslash',
          }),
          makeField({
            name: 'born',
            type: 'DateTime',
            hasDefaultValue: true,
            default: '2020-02-29T23:59:59.999+00:00',
          }),
        ],
      }),
    ])

    expect(drizzleSchema(datamodel, 'postgresql', [])).toBe(
      `import { bigint, bigserial, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const torture = pgTable('torture', { id: bigserial('id', { mode: 'bigint' }).primaryKey(), big: bigint('big', { mode: 'bigint' }).notNull().default(sql\`9007199254740993\`), quoted: text('quoted').notNull().default('it\\'s a "quote" and a \\\\ backslash'), born: timestamp('born').notNull().default(new Date('2020-02-29T23:59:59.999+00:00')) })`,
    )
  })
})

// Prisma's `@db.*` attributes pick the column type, and drizzle names each one differently per
// dialect. Nothing but this table stands between a renamed helper and a schema that fails to
// compile against drizzle-orm, so every attribute the generator claims to read is listed.
/** Prisma type, the attribute as it is written, its DMMF nativeType, the drizzle imports and column. */
const PG_NATIVE_TYPES: readonly (readonly [
  string,
  string,
  readonly [string, readonly string[]],
  string,
  string,
])[] = [
  [
    'String',
    '@db.VarChar(255)',
    ['VarChar', ['255']],
    'integer, pgTable, varchar',
    "varchar('value', { length: 255 })",
  ],
  ['String', '@db.VarChar', ['VarChar', []], 'integer, pgTable, varchar', "varchar('value')"],
  [
    'String',
    '@db.Char(2)',
    ['Char', ['2']],
    'char, integer, pgTable',
    "char('value', { length: 2 })",
  ],
  ['String', '@db.Char', ['Char', []], 'char, integer, pgTable', "char('value')"],
  ['String', '@db.Text', ['Text', []], 'integer, pgTable, text', "text('value')"],
  ['String', '@db.Uuid', ['Uuid', []], 'integer, pgTable, uuid', "uuid('value')"],
  ['Int', '@db.SmallInt', ['SmallInt', []], 'integer, pgTable, smallint', "smallint('value')"],
  ['Int', '@db.Integer', ['Integer', []], 'integer, pgTable', "integer('value')"],
  [
    'BigInt',
    '@db.BigInt',
    ['BigInt', []],
    'bigint, integer, pgTable',
    "bigint('value', { mode: 'bigint' })",
  ],
  ['Float', '@db.Real', ['Real', []], 'integer, pgTable, real', "real('value')"],
  [
    'Float',
    '@db.DoublePrecision',
    ['DoublePrecision', []],
    'doublePrecision, integer, pgTable',
    "doublePrecision('value')",
  ],
  [
    'Decimal',
    '@db.Decimal(10, 2)',
    ['Decimal', ['10', '2']],
    'integer, numeric, pgTable',
    "numeric('value', { precision: 10, scale: 2 })",
  ],
  [
    'Decimal',
    '@db.Decimal(10)',
    ['Decimal', ['10']],
    'integer, numeric, pgTable',
    "numeric('value', { precision: 10 })",
  ],
  ['Decimal', '@db.Decimal', ['Decimal', []], 'integer, numeric, pgTable', "numeric('value')"],
  [
    'DateTime',
    '@db.Timestamp(3)',
    ['Timestamp', ['3']],
    'integer, pgTable, timestamp',
    "timestamp('value', { precision: 3 })",
  ],
  [
    'DateTime',
    '@db.Timestamp',
    ['Timestamp', []],
    'integer, pgTable, timestamp',
    "timestamp('value')",
  ],
  [
    'DateTime',
    '@db.Timestamptz(3)',
    ['Timestamptz', ['3']],
    'integer, pgTable, timestamp',
    "timestamp('value', { withTimezone: true, precision: 3 })",
  ],
  [
    'DateTime',
    '@db.Timestamptz',
    ['Timestamptz', []],
    'integer, pgTable, timestamp',
    "timestamp('value', { withTimezone: true })",
  ],
  ['DateTime', '@db.Date', ['Date', []], 'date, integer, pgTable', "date('value')"],
  [
    'DateTime',
    '@db.Time(3)',
    ['Time', ['3']],
    'integer, pgTable, time',
    "time('value', { precision: 3 })",
  ],
  ['DateTime', '@db.Time', ['Time', []], 'integer, pgTable, time', "time('value')"],
  ['Json', '@db.Json', ['Json', []], 'integer, json, pgTable', "json('value')"],
  ['Json', '@db.JsonB', ['JsonB', []], 'integer, jsonb, pgTable', "jsonb('value')"],
  ['Bytes', '@db.ByteA', ['ByteA', []], 'integer, pgTable, text', "text('value')"],
  ['String', '@db.Citext', ['Citext', []], 'integer, pgTable, text', "text('value')"],
]

/** Prisma type, the attribute as it is written, its DMMF nativeType, the drizzle imports and column. */
const MYSQL_NATIVE_TYPES: readonly (readonly [
  string,
  string,
  readonly [string, readonly string[]],
  string,
  string,
])[] = [
  [
    'String',
    '@db.VarChar(255)',
    ['VarChar', ['255']],
    'int, mysqlTable, varchar',
    "varchar('value', { length: 255 })",
  ],
  ['String', '@db.VarChar', ['VarChar', []], 'int, mysqlTable, varchar', "varchar('value')"],
  [
    'String',
    '@db.Char(2)',
    ['Char', ['2']],
    'char, int, mysqlTable',
    "char('value', { length: 2 })",
  ],
  ['String', '@db.Char', ['Char', []], 'char, int, mysqlTable', "char('value')"],
  ['String', '@db.Text', ['Text', []], 'int, mysqlTable, text', "text('value')"],
  ['String', '@db.LongText', ['LongText', []], 'int, longtext, mysqlTable', "longtext('value')"],
  [
    'String',
    '@db.MediumText',
    ['MediumText', []],
    'int, mediumtext, mysqlTable',
    "mediumtext('value')",
  ],
  ['String', '@db.TinyText', ['TinyText', []], 'int, mysqlTable, tinytext', "tinytext('value')"],
  ['Int', '@db.TinyInt', ['TinyInt', []], 'int, mysqlTable, tinyint', "tinyint('value')"],
  ['Int', '@db.SmallInt', ['SmallInt', []], 'int, mysqlTable, smallint', "smallint('value')"],
  ['Int', '@db.MediumInt', ['MediumInt', []], 'int, mediumint, mysqlTable', "mediumint('value')"],
  ['Int', '@db.Int', ['Int', []], 'int, mysqlTable', "int('value')"],
  [
    'BigInt',
    '@db.BigInt',
    ['BigInt', []],
    'bigint, int, mysqlTable',
    "bigint('value', { mode: 'bigint' })",
  ],
  ['Float', '@db.Float', ['Float', []], 'float, int, mysqlTable', "float('value')"],
  ['Float', '@db.Double', ['Double', []], 'double, int, mysqlTable', "double('value')"],
  [
    'Decimal',
    '@db.Decimal(10, 2)',
    ['Decimal', ['10', '2']],
    'decimal, int, mysqlTable',
    "decimal('value', { precision: 10, scale: 2 })",
  ],
  ['Decimal', '@db.Decimal', ['Decimal', []], 'decimal, int, mysqlTable', "decimal('value')"],
  [
    'DateTime',
    '@db.DateTime(3)',
    ['DateTime', ['3']],
    'datetime, int, mysqlTable',
    "datetime('value', { fsp: 3 })",
  ],
  [
    'DateTime',
    '@db.DateTime',
    ['DateTime', []],
    'datetime, int, mysqlTable',
    "datetime('value', { fsp: 3 })",
  ],
  [
    'DateTime',
    '@db.Timestamp(3)',
    ['Timestamp', ['3']],
    'int, mysqlTable, timestamp',
    "timestamp('value', { fsp: 3 })",
  ],
  [
    'DateTime',
    '@db.Timestamp',
    ['Timestamp', []],
    'int, mysqlTable, timestamp',
    "timestamp('value', { fsp: 3 })",
  ],
  ['DateTime', '@db.Date', ['Date', []], 'date, int, mysqlTable', "date('value')"],
  [
    'DateTime',
    '@db.Time(3)',
    ['Time', ['3']],
    'int, mysqlTable, time',
    "time('value', { fsp: 3 })",
  ],
  ['DateTime', '@db.Time', ['Time', []], 'int, mysqlTable, time', "time('value')"],
  [
    'Bytes',
    '@db.Binary(16)',
    ['Binary', ['16']],
    'binary, int, mysqlTable',
    "binary('value', { length: 16 })",
  ],
  [
    'Bytes',
    '@db.VarBinary(16)',
    ['VarBinary', ['16']],
    'int, mysqlTable, varbinary',
    "varbinary('value', { length: 16 })",
  ],
  ['Bytes', '@db.Blob', ['Blob', []], 'blob, int, mysqlTable', "blob('value')"],
  ['Json', '@db.Json', ['Json', []], 'int, json, mysqlTable', "json('value')"],
  ['String', '@db.Nope', ['Nope', []], 'int, mysqlTable, text', "text('value')"],
]

/** Prisma type, the attribute as it is written, its DMMF nativeType, the drizzle imports and column. */
const SQLITE_NATIVE_TYPES: readonly (readonly [
  string,
  string,
  readonly [string, readonly string[]],
  string,
  string,
])[] = [
  ['String', '@db.Text', ['Text', []], 'integer, sqliteTable, text', "text('value')"],
  ['Int', '@db.Integer', ['Integer', []], 'integer, sqliteTable', "integer('value')"],
  ['Float', '@db.Real', ['Real', []], 'integer, real, sqliteTable', "real('value')"],
  ['String', '@db.Nope', ['Nope', []], 'integer, sqliteTable, text', "text('value')"],
]

describe('native database types', () => {
  it.each(PG_NATIVE_TYPES)(
    'maps %s `%s` on postgresql',
    (type, _attribute, nativeType, imports, column) => {
      const datamodel = makeDatamodel([
        makeModel({
          name: 'Row',
          fields: [
            makeField({ name: 'id', type: 'Int', isId: true }),
            makeField({ name: 'value', type, nativeType }),
          ],
        }),
      ])
      expect(drizzleSchema(datamodel, 'postgresql', [])).toBe(
        `import { ${imports} } from 'drizzle-orm/pg-core'

export const row = pgTable('row', { id: integer('id').primaryKey(), value: ${column}.notNull() })`,
      )
    },
  )

  it.each(MYSQL_NATIVE_TYPES)(
    'maps %s `%s` on mysql',
    (type, _attribute, nativeType, imports, column) => {
      const datamodel = makeDatamodel([
        makeModel({
          name: 'Row',
          fields: [
            makeField({ name: 'id', type: 'Int', isId: true }),
            makeField({ name: 'value', type, nativeType }),
          ],
        }),
      ])
      expect(drizzleSchema(datamodel, 'mysql', [])).toBe(
        `import { ${imports} } from 'drizzle-orm/mysql-core'

export const row = mysqlTable('row', { id: int('id').primaryKey(), value: ${column}.notNull() })`,
      )
    },
  )

  it.each(SQLITE_NATIVE_TYPES)(
    'maps %s `%s` on sqlite',
    (type, _attribute, nativeType, imports, column) => {
      const datamodel = makeDatamodel([
        makeModel({
          name: 'Row',
          fields: [
            makeField({ name: 'id', type: 'Int', isId: true }),
            makeField({ name: 'value', type, nativeType }),
          ],
        }),
      ])
      expect(drizzleSchema(datamodel, 'sqlite', [])).toBe(
        `import { ${imports} } from 'drizzle-orm/sqlite-core'

export const row = sqliteTable('row', { id: integer('id').primaryKey(), value: ${column}.notNull() })`,
      )
    },
  )
})
