import { stripTypeScriptTypes } from 'node:module'

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
        "import { integer, pgTable, serial, text } from 'drizzle-orm/pg-core'\nimport { relations } from 'drizzle-orm'\n\nexport const user = pgTable('User', { id: serial('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull().unique() })\n\nexport const post = pgTable('Post', { id: serial('id').primaryKey(), title: text('title').notNull(), userId: integer('userId').notNull().references(() => user.id) })\n\nexport const userRelations = relations(user, ({ many }) => ({ posts: many(post) }))\n\nexport const postRelations = relations(post, ({ one }) => ({ author: one(user, { fields: [post.userId], references: [user.id] }) }))",
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

      const lines = drizzleSchema(datamodel, 'sqlite', []).split('\n')

      expect([lines[0], lines.at(-1)]).toStrictEqual([
        "import { customType, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'",
        "export const user = sqliteTable('User', { id: integer('id').primaryKey({ autoIncrement: true }), name: text('name').notNull(), active: integer('active', { mode: 'boolean' }).notNull(), createdAt: utcDateTime('createdAt').notNull() })",
      ])
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
        "import { int, mysqlTable, text } from 'drizzle-orm/mysql-core'\n\nexport const user = mysqlTable('User', { id: int('id').primaryKey().autoincrement(), name: text('name').notNull() })",
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
        "import { pgEnum, pgTable, serial } from 'drizzle-orm/pg-core'\n\nexport const roleEnum = pgEnum('Role', ['ADMIN', 'USER'])\n\nexport const user = pgTable('User', { id: serial('id').primaryKey(), role: roleEnum('role').notNull() })",
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
        "import { pgEnum, pgTable, serial } from 'drizzle-orm/pg-core'\n\nexport const roleEnum = pgEnum('Role', ['ADMIN', 'USER'])\n\nexport const user = pgTable('User', { id: serial('id').primaryKey(), role: roleEnum('role').notNull(), backupRole: roleEnum('backupRole') })",
      )
    })

    it('wraps a scalar list with array() and leaves it nullable, as Prisma makes it', () => {
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
        "import { pgTable, serial, text } from 'drizzle-orm/pg-core'\n\nexport const account = pgTable('Account', { id: serial('id').primaryKey(), tags: text('tags').array() })",
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
        "import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'\n\nexport const user = sqliteTable('User', { id: integer('id').primaryKey({ autoIncrement: true }), role: text('role', { enum: ['ADMIN', 'USER'] }).notNull() })",
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
        "import { integer, pgTable, serial, text } from 'drizzle-orm/pg-core'\n\nexport const profile = pgTable('Profile', { id: serial('id').primaryKey(), bio: text('bio'), age: integer('age') })",
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
        "import { pgTable, serial, text } from 'drizzle-orm/pg-core'\n\nexport const config = pgTable('Config', { id: serial('id').primaryKey(), locale: text('locale').notNull().default('en') })",
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

      const lines = drizzleSchema(datamodel, 'postgresql', []).split('\n')

      expect(lines.slice(0, 2)).toStrictEqual([
        "import { pgTable, serial, timestamp } from 'drizzle-orm/pg-core'",
        "import { sql } from 'drizzle-orm'",
      ])
      expect(lines.at(-1)).toBe(
        "export const event = pgTable('Event', { id: serial('id').primaryKey(), createdAt: timestamp('createdAt', { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`).$defaultFn(utcNow) })",
      )
    })

    it('should leave now() to the client on SQLite', () => {
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

      const lines = drizzleSchema(datamodel, 'sqlite', []).split('\n')

      expect([lines[0], lines.at(-1)]).toStrictEqual([
        "import { customType, integer, sqliteTable } from 'drizzle-orm/sqlite-core'",
        "export const event = sqliteTable('Event', { id: integer('id').primaryKey({ autoIncrement: true }), createdAt: utcDateTime('createdAt').notNull().$defaultFn(utcNow) })",
      ])
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
        "import { integer, pgTable, serial } from 'drizzle-orm/pg-core'\n\nexport const counter = pgTable('Counter', { id: serial('id').primaryKey(), count: integer('count').notNull().default(0) })",
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
        "import { boolean, pgTable, serial } from 'drizzle-orm/pg-core'\n\nexport const feature = pgTable('Feature', { id: serial('id').primaryKey(), enabled: boolean('enabled').notNull().default(false) })",
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
        "import { pgTable, text } from 'drizzle-orm/pg-core'\nimport cuid from 'cuid'\n\nexport const user = pgTable('User', { id: text('id').primaryKey().$defaultFn(() => cuid()) })",
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
        "import { pgTable, text } from 'drizzle-orm/pg-core'\nimport cuid from 'cuid'\n\nexport const user = pgTable('User', { id: text('id').primaryKey().$defaultFn(() => cuid()) })",
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
        "import { pgTable, text } from 'drizzle-orm/pg-core'\nimport { createId } from '@paralleldrive/cuid2'\n\nexport const user = pgTable('User', { id: text('id').primaryKey().$defaultFn(() => createId()) })",
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
        "import { pgTable, text } from 'drizzle-orm/pg-core'\nimport { nanoid } from 'nanoid'\n\nexport const user = pgTable('User', { id: text('id').primaryKey().$defaultFn(() => nanoid()) })",
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
        "import { pgTable, text } from 'drizzle-orm/pg-core'\nimport { ulid } from 'ulidx'\n\nexport const user = pgTable('User', { id: text('id').primaryKey().$defaultFn(() => ulid()) })",
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
        "import { pgTable, text } from 'drizzle-orm/pg-core'\n\nexport const user = pgTable('User', { id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()) })",
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

export const user = pgTable('User', { id: serial('id').primaryKey(), role: roleEnum('role').notNull(), status: statusEnum('status').notNull() })`,
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
        "import { pgTable, text } from 'drizzle-orm/pg-core'\nimport { v7 as uuidv7 } from 'uuid'\n\nexport const user = pgTable('User', { id: text('id').primaryKey().$defaultFn(() => uuidv7()) })",
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

export const actor = pgTable('Actor', { id: serial('id').primaryKey() })

export const film = pgTable('Film', { id: serial('id').primaryKey() })

export const cast = pgTable('_cast', { A: integer('A').notNull().references(() => actor.id, { onDelete: 'cascade' }), B: integer('B').notNull().references(() => film.id, { onDelete: 'cascade' }) }, (table) => [primaryKey({ columns: [table.A, table.B] })])

export const actorRelations = relations(actor, ({ many }) => ({ films: many(cast) }))

export const filmRelations = relations(film, ({ many }) => ({ actors: many(cast) }))

export const castRelations = relations(cast, ({ one }) => ({ actor: one(actor, { fields: [cast.A], references: [actor.id] }), film: one(film, { fields: [cast.B], references: [film.id] }) }))`,
    )
  })

  it('names a composite @@unique after its map:, and leaves an unmapped one to drizzle', () => {
    const datamodel = makeDatamodel([
      makeModel({
        name: 'Member',
        uniqueFields: [
          ['tenantId', 'email'],
          ['tenantId', 'loginName'],
        ],
        fields: [
          makeField({ name: 'tenantId', type: 'Int' }),
          makeField({ name: 'email', type: 'String' }),
          makeField({ name: 'loginName', type: 'String' }),
        ],
      }),
    ])

    expect(
      drizzleSchema(datamodel, 'postgresql', [
        {
          model: 'Member',
          type: 'unique',
          isDefinedOnField: false,
          dbName: 'member_tenant_email',
          fields: [{ name: 'tenantId' }, { name: 'email' }],
        },
        {
          model: 'Member',
          type: 'unique',
          isDefinedOnField: false,
          // `name:` names the compound key on the Client and nothing in the database.
          name: 'tenantLogin',
          fields: [{ name: 'tenantId' }, { name: 'loginName' }],
        },
      ]),
    ).toContain(
      "(table) => [unique('member_tenant_email').on(table.tenantId, table.email), unique().on(table.tenantId, table.loginName)]",
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

    expect(
      drizzleSchema(datamodel, 'postgresql', [
        {
          model: 'Warehouse',
          type: 'unique',
          isDefinedOnField: false,
          fields: [{ name: 'country' }, { name: 'code' }],
        },
      ]),
    ).toBe(
      `import { foreignKey, pgTable, serial, text, unique } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

export const warehouse = pgTable('Warehouse', { id: serial('id').primaryKey(), country: text('country').notNull(), code: text('code').notNull() }, (table) => [unique().on(table.country, table.code)])

export const stock = pgTable('Stock', { id: serial('id').primaryKey(), country: text('country').notNull(), code: text('code').notNull() }, (table) => [foreignKey({ columns: [table.country, table.code], foreignColumns: [warehouse.country, warehouse.code] }).onDelete('cascade')])

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

export const board = pgTable('Board', { id: serial('id').primaryKey(), visibility: visibilityEnum('visibility').notNull().default('link_only'), audiences: visibilityEnum('audiences').array() })`,
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

export const torture = pgTable('Torture', { id: bigserial('id', { mode: 'bigint' }).primaryKey(), big: bigint('big', { mode: 'bigint' }).notNull().default(sql\`9007199254740993\`), quoted: text('quoted').notNull().default('it\\'s a "quote" and a \\\\ backslash'), born: timestamp('born', { precision: 3 }).notNull().default(new Date('2020-02-29T23:59:59.999+00:00')) })`,
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
  ['DateTime', '@db.Date', ['Date', []], 'customType, integer, pgTable', "utcDate('value')"],
  [
    'DateTime',
    '@db.Time(3)',
    ['Time', ['3']],
    'customType, integer, pgTable',
    "utcTime('value', { precision: 3 })",
  ],
  ['DateTime', '@db.Time', ['Time', []], 'customType, integer, pgTable', "utcTime('value')"],
  [
    'DateTime',
    '@db.Timetz(3)',
    ['Timetz', ['3']],
    'customType, integer, pgTable',
    "utcTimetz('value', { precision: 3 })",
  ],
  ['DateTime', '@db.Timetz', ['Timetz', []], 'customType, integer, pgTable', "utcTimetz('value')"],
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
    "datetime('value', { fsp: 0 })",
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
    "timestamp('value', { fsp: 0 })",
  ],
  ['DateTime', '@db.Date', ['Date', []], 'customType, int, mysqlTable', "utcDate('value')"],
  [
    'DateTime',
    '@db.Time(3)',
    ['Time', ['3']],
    'customType, int, mysqlTable',
    "utcTime('value', { precision: 3 })",
  ],
  ['DateTime', '@db.Time', ['Time', []], 'customType, int, mysqlTable', "utcTime('value')"],
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
      // A date helper, when the column is one, is declared between the two.
      const lines = drizzleSchema(datamodel, 'postgresql', []).split('\n')
      expect([lines[0], lines.at(-1)]).toStrictEqual([
        `import { ${imports} } from 'drizzle-orm/pg-core'`,
        `export const row = pgTable('Row', { id: integer('id').primaryKey(), value: ${column}.notNull() })`,
      ])
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
      // A date helper, when the column is one, is declared between the two.
      const lines = drizzleSchema(datamodel, 'mysql', []).split('\n')
      expect([lines[0], lines.at(-1)]).toStrictEqual([
        `import { ${imports} } from 'drizzle-orm/mysql-core'`,
        `export const row = mysqlTable('Row', { id: int('id').primaryKey(), value: ${column}.notNull() })`,
      ])
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
      // A date helper, when the column is one, is declared between the two.
      const lines = drizzleSchema(datamodel, 'sqlite', []).split('\n')
      expect([lines[0], lines.at(-1)]).toStrictEqual([
        `import { ${imports} } from 'drizzle-orm/sqlite-core'`,
        `export const row = sqliteTable('Row', { id: integer('id').primaryKey(), value: ${column}.notNull() })`,
      ])
    },
  )
})

// Imports the date helpers a generated schema declares, with a customType that hands back its options.
async function importDateHelpers(schema: string) {
  const declarations = schema.split('\n\n').filter((block) => block.startsWith('const '))
  const names = declarations.map((block) => block.match(/^const (\w+)/u)?.[1]).join(', ')
  const code = `const customType = (options) => () => options\n${stripTypeScriptTypes(declarations.join('\n'))}\nexport { ${names} }`
  return import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(code)}`)
}

describe('dates', () => {
  const nowField = (name: string, nativeType?: [string, string[]]) =>
    makeField({
      name,
      type: 'DateTime',
      hasDefaultValue: true,
      default: { name: 'now', args: [] },
      ...(nativeType ? { nativeType } : {}),
    })

  it('defaults now() to CURRENT_TIMESTAMP on a PostgreSQL date or time helper', () => {
    const datamodel = makeDatamodel([
      makeModel({
        name: 'Row',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          nowField('d', ['Date', []]),
          nowField('t', ['Time', ['3']]),
          nowField('tz', ['Timetz', ['3']]),
        ],
      }),
    ])
    expect(drizzleSchema(datamodel, 'postgresql', []).split('\n').at(-1)).toBe(
      "export const row = pgTable('Row', { id: integer('id').primaryKey(), d: utcDate('d').notNull().default(sql`CURRENT_TIMESTAMP`).$defaultFn(utcNow), t: utcTime('t', { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`).$defaultFn(utcNow), tz: utcTimetz('tz', { precision: 3 }).notNull().default(sql`CURRENT_TIMESTAMP`).$defaultFn(utcNow) })",
    )
  })

  it('writes a timetz with the UTC offset and reads it back', async () => {
    const datamodel = makeDatamodel([
      makeModel({
        name: 'Row',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'tz', type: 'DateTime', nativeType: ['Timetz', ['3']] }),
        ],
      }),
    ])
    const { utcTimetz } = await importDateHelpers(drizzleSchema(datamodel, 'postgresql', []))
    const column = utcTimetz()
    expect(column.dataType({ precision: 3 })).toBe('time(3) with time zone')
    expect(column.toDriver(new Date('1970-01-01T03:04:05.678Z'))).toBe('03:04:05.678+00')
    expect(column.fromDriver('03:04:05.678+00').toISOString()).toBe('1970-01-01T03:04:05.678Z')
  })

  it('reads the literal default Prisma writes into a SQLite DateTime column', async () => {
    const datamodel = makeDatamodel([
      makeModel({
        name: 'Row',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'at', type: 'DateTime' }),
        ],
      }),
    ])
    const { utcDateTime } = await importDateHelpers(drizzleSchema(datamodel, 'sqlite', []))
    const column = utcDateTime()
    expect(
      ['2024-01-15 10:30:00 +00:00', '2024-01-15T10:30:00.000+00:00', '2024-01-15 10:30:00'].map(
        (value) => column.fromDriver(value).toISOString(),
      ),
    ).toStrictEqual(Array.from({ length: 3 }, () => '2024-01-15T10:30:00.000Z'))
  })

  it("gives MySQL's bare @db.DateTime and @db.Timestamp fsp 0, and now() the column's precision", () => {
    const datamodel = makeDatamodel([
      makeModel({
        name: 'Row',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          nowField('plain'),
          nowField('ts', ['Timestamp', []]),
          nowField('dt6', ['DateTime', ['6']]),
        ],
      }),
    ])
    expect(drizzleSchema(datamodel, 'mysql', []).split('\n').at(-1)).toBe(
      "export const row = mysqlTable('Row', { id: int('id').primaryKey(), plain: datetime('plain', { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`).$defaultFn(utcNow), ts: timestamp('ts', { fsp: 0 }).notNull().default(sql`CURRENT_TIMESTAMP`).$defaultFn(utcNow), dt6: datetime('dt6', { fsp: 6 }).notNull().default(sql`CURRENT_TIMESTAMP(6)`).$defaultFn(utcNow) })",
    )
  })

  it('says a MySQL timestamp needs a UTC session, only where there is one', () => {
    const schema = (nativeType: [string, string[]]) =>
      drizzleSchema(
        makeDatamodel([
          makeModel({
            name: 'Row',
            fields: [
              makeField({ name: 'id', type: 'Int', isId: true }),
              makeField({ name: 'at', type: 'DateTime', nativeType }),
            ],
          }),
        ]),
        'mysql',
        [],
      )
    const note = "// timestamp() holds UTC only on a connection whose time_zone is '+00:00'"
    expect(schema(['Timestamp', ['3']]).split('\n')[2]).toBe(note)
    expect(schema(['DateTime', ['3']])).not.toContain(note)
  })

  // CockroachDB takes autoincrement() on a BigInt only; an Int key counts with sequence(), which
  // Prisma makes an identity column. Without one the key is required on every drizzle insert.
  it('gives a CockroachDB sequence() key an identity, beside the dates PostgreSQL has', () => {
    const datamodel = makeDatamodel([
      makeModel({
        name: 'Row',
        fields: [
          makeField({
            name: 'id',
            type: 'Int',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'sequence', args: [] },
          }),
          makeField({ name: 'at', type: 'DateTime' }),
          nowField('tz', ['Timestamptz', []]),
          makeField({ name: 'ttz', type: 'DateTime', nativeType: ['Timetz', ['3']] }),
        ],
      }),
    ])
    expect(drizzleSchema(datamodel, 'cockroachdb', []).split('\n').at(-1)).toBe(
      "export const row = pgTable('Row', { id: integer('id').primaryKey().generatedByDefaultAsIdentity(), at: timestamp('at', { precision: 3 }).notNull(), tz: timestamp('tz', { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`).$defaultFn(utcNow), ttz: utcTimetz('ttz', { precision: 3 }).notNull() })",
    )
  })

  it('leaves a DateTime list nullable on PostgreSQL', () => {
    const datamodel = makeDatamodel([
      makeModel({
        name: 'Row',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'at', type: 'DateTime', isList: true }),
        ],
      }),
    ])
    expect(drizzleSchema(datamodel, 'postgresql', []).split('\n').at(-1)).toBe(
      "export const row = pgTable('Row', { id: integer('id').primaryKey(), at: timestamp('at', { precision: 3 }).array() })",
    )
  })
})
