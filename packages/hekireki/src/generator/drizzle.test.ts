import { stripTypeScriptTypes } from 'node:module'

import type { DMMF } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
import { describe, expect, it } from 'vite-plus/test'

import { prismaBlocks } from '../prisma/schema-text.js'
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
        "import { foreignKey, integer, pgTable, serial, text } from 'drizzle-orm/pg-core'\nimport { defineRelations } from 'drizzle-orm'\n\nexport const user = pgTable('User', { id: serial('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull() })\n\nexport const post = pgTable('Post', { id: serial('id').primaryKey(), title: text('title').notNull(), userId: integer('userId').notNull() }, (table) => [foreignKey({ name: 'Post_userId_fkey', columns: [table.userId], foreignColumns: [user.id] }).onDelete('restrict').onUpdate('cascade')])\n\nexport const relations = defineRelations({ user, post }, (r) => ({ user: { posts: r.many.post() }, post: { author: r.one.user({ from: r.post.userId, to: r.user.id, optional: false }) } }))",
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

    // Prisma keeps a BigInt on SQLite as a BIGINT column holding the integer, a key too, which
    // SQLite does not count. The column reads and writes that integer as a bigint.
    it('keeps a BigInt in a bigint column, as the integer Prisma writes', () => {
      const datamodel = makeDatamodel([
        makeModel({
          name: 'Sequence',
          fields: [
            makeField({
              name: 'id',
              type: 'BigInt',
              isId: true,
              hasDefaultValue: true,
              default: { name: 'autoincrement', args: [] },
            }),
            makeField({ name: 'big', type: 'BigInt' }),
          ],
        }),
      ])

      const code = drizzleSchema(datamodel, 'sqlite', [])

      expect(code)
        .toContain(`const bigInteger = customType<{ data: bigint; driverData: number | bigint }>({
  dataType: () => 'bigint',
  toDriver: (value) => value,
  fromDriver: (value) => BigInt(value),
})`)
      expect(code).toContain(
        "export const sequence = sqliteTable('Sequence', { id: bigInteger('id').notNull(), big: bigInteger('big').notNull() }, (table) => [primaryKey({ columns: [table.id] })])",
      )
    })

    // drizzle-orm 1.0's blob() with no mode is JSON, and its buffer mode types the bytes as a
    // Buffer. The column is a blob holding the Uint8Array Prisma Client gives, with drizzle's blob
    // codec, which reads it from every driver and through a relational query as bytes.
    it('keeps a Bytes in a blob column, as the Uint8Array Prisma Client gives', () => {
      const datamodel = makeDatamodel([
        makeModel({
          name: 'Attachment',
          fields: [
            makeField({ name: 'id', type: 'Int', isId: true }),
            makeField({ name: 'block', type: 'Bytes', isRequired: false }),
          ],
        }),
      ])

      const code = drizzleSchema(datamodel, 'sqlite', [])

      expect(code).toContain(`const blobBytes = customType<{ data: Uint8Array }>({
  dataType: () => 'blob',
  codec: 'blob',
})`)
      expect(code.split('\n').at(-1)).toBe(
        "export const attachment = sqliteTable('Attachment', { id: integer('id').primaryKey(), block: blobBytes('block') })",
      )
    })
  })

  describe('a primary key that is not the rowid', () => {
    const datamodel = makeDatamodel([
      makeModel({
        name: 'User',
        fields: [
          makeField({ name: 'id', type: 'String', isId: true }),
          makeField({ name: 'email', type: 'String' }),
        ],
      }),
      makeModel({
        name: 'Post',
        fields: [makeField({ name: 'id', type: 'Int', isId: true })],
      }),
    ])

    // SQLite lets a key that is not INTEGER hold NULL; Prisma makes it TEXT NOT NULL PRIMARY KEY.
    it('is NOT NULL on SQLite, and an INTEGER key is left to the rowid', () => {
      const code = drizzleSchema(datamodel, 'sqlite', [])
      expect(code).toContain(
        "export const user = sqliteTable('User', { id: text('id').notNull(), email: text('email').notNull() }, (table) => [primaryKey({ columns: [table.id] })])",
      )
      expect(code).toContain("id: integer('id').primaryKey()")
      expect(code).not.toContain("integer('id').primaryKey().notNull()")
    })

    it('names no key whose column is not written, as an Unsupported one', () => {
      const code = drizzleSchema(
        makeDatamodel([
          makeModel({
            name: 'Shape',
            fields: [makeField({ name: 'geom', type: 'point', kind: 'unsupported', isId: true })],
          }),
        ]),
        'sqlite',
        [],
      )
      expect(code).toContain('// unsupported type: geom')
      expect(code).not.toContain('primaryKey(')
    })

    it('leaves a Boolean key on the column, a rowid either way', () => {
      const code = drizzleSchema(
        makeDatamodel([
          makeModel({
            name: 'Flag',
            fields: [makeField({ name: 'on', type: 'Boolean', isId: true })],
          }),
        ]),
        'sqlite',
        [],
      )
      expect(code).toContain("on: integer('on', { mode: 'boolean' }).primaryKey()")
      expect(code).not.toContain('primaryKey({')
    })

    it('needs no NOT NULL on PostgreSQL, where PRIMARY KEY implies it', () => {
      const code = drizzleSchema(datamodel, 'postgresql', [])
      expect(code).toContain("id: text('id').primaryKey(),")
      expect(code).not.toContain('primaryKey({')
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
        "import { int, mysqlTable, varchar } from 'drizzle-orm/mysql-core'\n\nexport const user = mysqlTable('User', { id: int('id').primaryKey().autoincrement(), name: varchar('name', { length: 191 }).notNull() })",
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
      `import { foreignKey, index, integer, pgTable, primaryKey, serial } from 'drizzle-orm/pg-core'
import { defineRelations } from 'drizzle-orm'

export const actor = pgTable('Actor', { id: serial('id').primaryKey() })

export const film = pgTable('Film', { id: serial('id').primaryKey() })

export const cast = pgTable('_cast', { A: integer('A').notNull(), B: integer('B').notNull() }, (table) => [primaryKey({ name: '_cast_AB_pkey', columns: [table.A, table.B] }), index('_cast_B_index').on(table.B), foreignKey({ name: '_cast_A_fkey', columns: [table.A], foreignColumns: [actor.id] }).onDelete('cascade').onUpdate('cascade'), foreignKey({ name: '_cast_B_fkey', columns: [table.B], foreignColumns: [film.id] }).onDelete('cascade').onUpdate('cascade')])

export const relations = defineRelations({ actor, film, cast }, (r) => ({ actor: { films: r.many.film({ from: r.actor.id.through(r.cast.A), to: r.film.id.through(r.cast.B) }) }, film: { actors: r.many.actor({ from: r.film.id.through(r.cast.B), to: r.actor.id.through(r.cast.A) }) }, cast: { actor: r.one.actor({ from: r.cast.A, to: r.actor.id, optional: false }), film: r.one.film({ from: r.cast.B, to: r.film.id, optional: false }) } }))`,
    )
  })

  it('names a composite @@unique after its map:, and an unmapped one as Prisma Migrate does', () => {
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
      "(table) => [uniqueIndex('member_tenant_email').on(table.tenantId, table.email), uniqueIndex('Member_tenantId_loginName_key').on(table.tenantId, table.loginName)]",
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
import { defineRelations } from 'drizzle-orm'

export const warehouse = pgTable('Warehouse', { id: serial('id').primaryKey(), country: text('country').notNull(), code: text('code').notNull() }, (table) => [unique('Warehouse_country_code_key').on(table.country, table.code)])

export const stock = pgTable('Stock', { id: serial('id').primaryKey(), country: text('country').notNull(), code: text('code').notNull() }, (table) => [foreignKey({ name: 'Stock_country_code_fkey', columns: [table.country, table.code], foreignColumns: [warehouse.country, warehouse.code] }).onDelete('cascade').onUpdate('cascade')])

export const relations = defineRelations({ warehouse, stock }, (r) => ({ warehouse: { stocks: r.many.stock() }, stock: { warehouse: r.one.warehouse({ from: [r.stock.country, r.stock.code], to: [r.warehouse.country, r.warehouse.code], optional: false }) } }))`,
    )
  })

  // The other end of a one-to-one names the columns the other way round; an optional key has no
  // `optional: false`; a model with two relations to one table names each, and the `many()` end
  // carries the same name for drizzle to pair them.
  it('writes a one-to-one from both ends, an optional key, and aliases for a pair of relations', () => {
    const datamodel = makeDatamodel([
      makeModel({
        name: 'User',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({
            name: 'profile',
            kind: 'object',
            type: 'Profile',
            isRequired: false,
            relationName: 'ProfileToUser',
            relationFromFields: [],
            relationToFields: [],
          }),
          makeField({
            name: 'sent',
            kind: 'object',
            type: 'Message',
            isList: true,
            relationName: 'Sent',
            relationFromFields: [],
            relationToFields: [],
          }),
          makeField({
            name: 'received',
            kind: 'object',
            type: 'Message',
            isList: true,
            relationName: 'Received',
            relationFromFields: [],
            relationToFields: [],
          }),
        ],
      }),
      makeModel({
        name: 'Profile',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'userId', type: 'Int', isUnique: true }),
          makeField({
            name: 'user',
            kind: 'object',
            type: 'User',
            relationName: 'ProfileToUser',
            relationFromFields: ['userId'],
            relationToFields: ['id'],
          }),
        ],
      }),
      makeModel({
        name: 'Message',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'senderId', type: 'Int' }),
          makeField({ name: 'receiverId', type: 'Int', isRequired: false }),
          makeField({
            name: 'sender',
            kind: 'object',
            type: 'User',
            relationName: 'Sent',
            relationFromFields: ['senderId'],
            relationToFields: ['id'],
          }),
          makeField({
            name: 'receiver',
            kind: 'object',
            type: 'User',
            isRequired: false,
            relationName: 'Received',
            relationFromFields: ['receiverId'],
            relationToFields: ['id'],
          }),
        ],
      }),
    ])

    expect(drizzleSchema(datamodel, 'postgresql', []).split('\n').at(-1)).toBe(
      "export const relations = defineRelations({ user, profile, message }, (r) => ({ user: { profile: r.one.profile({ from: r.user.id, to: r.profile.userId }), sent: r.many.message({ alias: 'Sent' }), received: r.many.message({ alias: 'Received' }) }, profile: { user: r.one.user({ from: r.profile.userId, to: r.user.id, optional: false }) }, message: { sender: r.one.user({ from: r.message.senderId, to: r.user.id, optional: false, alias: 'Sent' }), receiver: r.one.user({ from: r.message.receiverId, to: r.user.id, alias: 'Received' }) } }))",
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
  ['Bytes', '@db.ByteA', ['ByteA', []], 'customType, integer, pgTable', "bytea('value')"],
  ['String', '@db.Citext', ['Citext', []], 'integer, pgTable, text', "text('value')"],
  ['String', '@db.Inet', ['Inet', []], 'inet, integer, pgTable', "inet('value')"],
  [
    'String',
    '@db.Bit(3)',
    ['Bit', ['3']],
    'bit, integer, pgTable',
    "bit('value', { dimensions: 3 })",
  ],
  ['String', '@db.Bit', ['Bit', []], 'bit, integer, pgTable', "bit('value', { dimensions: 1 })"],
  [
    'String',
    '@db.VarBit(4)',
    ['VarBit', ['4']],
    'customType, integer, pgTable',
    "typedText('value', { type: 'bit varying(4)' })",
  ],
  [
    'String',
    '@db.VarBit',
    ['VarBit', []],
    'customType, integer, pgTable',
    "typedText('value', { type: 'bit varying' })",
  ],
  [
    'String',
    '@db.Xml',
    ['Xml', []],
    'customType, integer, pgTable',
    "typedText('value', { type: 'xml' })",
  ],
  ['Int', '@db.Oid', ['Oid', []], 'customType, integer, pgTable', "oidInteger('value')"],
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
    'customType, int, mysqlTable',
    "bytes('value', { type: 'binary(16)' })",
  ],
  [
    'Bytes',
    '@db.VarBinary(16)',
    ['VarBinary', ['16']],
    'customType, int, mysqlTable',
    "bytes('value', { type: 'varbinary(16)' })",
  ],
  [
    'Bytes',
    '@db.TinyBlob',
    ['TinyBlob', []],
    'customType, int, mysqlTable',
    "bytes('value', { type: 'tinyblob' })",
  ],
  [
    'Bytes',
    '@db.Blob',
    ['Blob', []],
    'customType, int, mysqlTable',
    "bytes('value', { type: 'blob' })",
  ],
  [
    'Bytes',
    '@db.MediumBlob',
    ['MediumBlob', []],
    'customType, int, mysqlTable',
    "bytes('value', { type: 'mediumblob' })",
  ],
  [
    'Bytes',
    '@db.LongBlob',
    ['LongBlob', []],
    'customType, int, mysqlTable',
    "bytes('value', { type: 'longblob' })",
  ],
  ['Json', '@db.Json', ['Json', []], 'int, json, mysqlTable', "json('value')"],
  [
    'Int',
    '@db.UnsignedTinyInt',
    ['UnsignedTinyInt', []],
    'int, mysqlTable, tinyint',
    "tinyint('value', { unsigned: true })",
  ],
  [
    'Int',
    '@db.UnsignedSmallInt',
    ['UnsignedSmallInt', []],
    'int, mysqlTable, smallint',
    "smallint('value', { unsigned: true })",
  ],
  [
    'Int',
    '@db.UnsignedMediumInt',
    ['UnsignedMediumInt', []],
    'int, mediumint, mysqlTable',
    "mediumint('value', { unsigned: true })",
  ],
  [
    'Int',
    '@db.UnsignedInt',
    ['UnsignedInt', []],
    'int, mysqlTable',
    "int('value', { unsigned: true })",
  ],
  [
    'BigInt',
    '@db.UnsignedBigInt',
    ['UnsignedBigInt', []],
    'bigint, int, mysqlTable',
    "bigint('value', { mode: 'bigint', unsigned: true })",
  ],
  ['Int', '@db.Year', ['Year', []], 'int, mysqlTable, year', "year('value')"],
  [
    'String',
    '@db.Nope',
    ['Nope', []],
    'int, mysqlTable, varchar',
    "varchar('value', { length: 191 })",
  ],
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
  // PostgreSQL's JSON, which drizzle's relational queries read nested rows through, gives an oid as
  // a string, so the helper reads it back as a number.
  it('declares oidInteger for an oid column, with the oid codec and the value read back as a number', () => {
    const datamodel = makeDatamodel([
      makeModel({
        name: 'Row',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'value', type: 'Int', nativeType: ['Oid', []] }),
        ],
      }),
    ])
    expect(drizzleSchema(datamodel, 'postgresql', []))
      .toBe(`import { customType, integer, pgTable } from 'drizzle-orm/pg-core'

const oidInteger = customType<{ data: number; driverData: number | string }>({
  dataType: () => 'oid',
  codec: 'oid',
  fromDriver: (value) => Number(value),
})

export const row = pgTable('Row', { id: integer('id').primaryKey(), value: oidInteger('value').notNull() })`)
  })

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

  // drizzle-kit takes the default of the `utcDateTime` text only as SQL: the text the column writes.
  it('writes a literal default on SQLite as the text the column writes', () => {
    const datamodel = makeDatamodel([
      makeModel({
        name: 'Row',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({
            name: 'born',
            type: 'DateTime',
            hasDefaultValue: true,
            default: '2020-02-29T23:59:59.999+00:00',
          }),
        ],
      }),
    ])
    const code = drizzleSchema(datamodel, 'sqlite', [])
    expect(code).toContain("import { sql } from 'drizzle-orm'")
    expect(code.split('\n').at(-1)).toBe(
      "export const row = sqliteTable('Row', { id: integer('id').primaryKey(), born: utcDateTime('born').notNull().default(sql`'2020-02-29T23:59:59.999+00:00'`) })",
    )
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

  it.each([
    ['postgresql', "bytea('value').notNull().default(sql`decode('0001ff', 'hex')`)"],
    ['mysql', "bytes('value', { type: 'longblob' }).notNull().default(sql`0x0001ff`)"],
    ['sqlite', "blobBytes('value').notNull().default(sql`X'0001ff'`)"],
  ] as const)('writes a Bytes and its default on %s as the bytes they are', (provider, column) => {
    const datamodel = makeDatamodel([
      makeModel({
        name: 'Row',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'value', type: 'Bytes', hasDefaultValue: true, default: 'AAH/' }),
        ],
      }),
    ])
    expect(drizzleSchema(datamodel, provider, []).split('\n').at(-1)).toContain(column)
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

describe('keys, indexes and foreign keys as Prisma Migrate makes them', () => {
  const account = makeModel({
    name: 'Account',
    dbName: 'accounts',
    fields: [
      makeField({ name: 'id', type: 'Int', isId: true }),
      makeField({ name: 'email', type: 'String', isUnique: true }),
      makeField({ name: 'bio', type: 'String', nativeType: ['Text', []] }),
      makeField({ name: 'parentId', type: 'Int', isRequired: false, dbName: 'parent_id' }),
      makeField({
        name: 'parent',
        type: 'Account',
        kind: 'object',
        isRequired: false,
        relationName: 'Tree',
        relationFromFields: ['parentId'],
        relationToFields: ['id'],
      }),
      makeField({
        name: 'children',
        type: 'Account',
        kind: 'object',
        isList: true,
        relationName: 'Tree',
        relationFromFields: [],
        relationToFields: [],
      }),
      makeField({
        name: 'logins',
        type: 'Login',
        kind: 'object',
        isList: true,
        relationName: 'AccountToLogin',
        relationFromFields: [],
        relationToFields: [],
      }),
    ],
  })
  const login = makeModel({
    name: 'Login',
    fields: [
      makeField({ name: 'id', type: 'Int', isId: true }),
      makeField({ name: 'email', type: 'String' }),
      makeField({
        name: 'account',
        type: 'Account',
        kind: 'object',
        relationName: 'AccountToLogin',
        relationFromFields: ['email'],
        relationToFields: ['email'],
      }),
    ],
  })
  const indexes: DMMF.Index[] = [
    { model: 'Account', type: 'unique', isDefinedOnField: true, fields: [{ name: 'email' }] },
    {
      model: 'Account',
      type: 'normal',
      isDefinedOnField: false,
      fields: [{ name: 'bio', length: 191 }, { name: 'parentId' }],
    },
  ]
  const tables = (provider: 'postgresql' | 'mysql' | 'sqlite') =>
    drizzleSchema(makeDatamodel([account, login]), provider, indexes)
      .split('\n')
      .filter(
        (line) =>
          line.startsWith('export const accounts =') || line.startsWith('export const login ='),
      )
      .map((line) => line.slice(line.indexOf('(table) =>')))

  it('names them after the table and its columns, with the actions Prisma implies', () => {
    expect(tables('postgresql')).toStrictEqual([
      "(table) => [unique('accounts_email_key').on(table.email), index('accounts_bio_parent_id_idx').on(table.bio, table.parentId), foreignKey({ name: 'accounts_parent_id_fkey', columns: [table.parentId], foreignColumns: [table.id] }).onDelete('set null').onUpdate('cascade')])",
      "(table) => [foreignKey({ name: 'Login_email_fkey', columns: [table.email], foreignColumns: [accounts.email] }).onDelete('restrict').onUpdate('cascade')])",
    ])
  })

  // MySQL names every primary key PRIMARY, and drizzle's `primaryKey` there takes no name.
  it('names a composite key after the table, except on MySQL', () => {
    const cell = makeModel({
      name: 'GridCell',
      primaryKey: { name: null, fields: ['x', 'y'] },
      fields: [makeField({ name: 'x', type: 'Int' }), makeField({ name: 'y', type: 'Int' })],
    })
    expect(drizzleSchema(makeDatamodel([cell]), 'postgresql', [])).toContain(
      "(table) => [primaryKey({ name: 'GridCell_pkey', columns: [table.x, table.y] })]",
    )
    expect(drizzleSchema(makeDatamodel([cell]), 'mysql', [])).toContain(
      '(table) => [primaryKey({ columns: [table.x, table.y] })]',
    )
  })

  it('takes part of a TEXT in an index on MySQL', () => {
    expect(tables('mysql')[0]).toBe(
      "(table) => [unique('accounts_email_key').on(table.email), index('accounts_bio_parent_id_idx').on(sql`${table.bio}(191)`, table.parentId), foreignKey({ name: 'accounts_parent_id_fkey', columns: [table.parentId], foreignColumns: [table.id] }).onDelete('set null').onUpdate('cascade')])",
    )
  })

  it('has every unique an index on SQLite, which makes a foreign key with its table', () => {
    expect(tables('sqlite')[0]).toBe(
      "(table) => [uniqueIndex('accounts_email_key').on(table.email), index('accounts_bio_parent_id_idx').on(table.bio, table.parentId), foreignKey({ name: 'accounts_parent_id_fkey', columns: [table.parentId], foreignColumns: [table.id] }).onDelete('set null').onUpdate('cascade')])",
    )
  })

  it('has a unique nothing points at an index on PostgreSQL', () => {
    expect(drizzleSchema(makeDatamodel([account]), 'postgresql', indexes)).toContain(
      "uniqueIndex('accounts_email_key').on(table.email)",
    )
  })

  it('has the pair of a join table its key on PostgreSQL and a unique index elsewhere', () => {
    const post = makeModel({
      name: 'Post',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'tags',
          type: 'Tag',
          kind: 'object',
          isList: true,
          relationName: 'PostToTag',
          relationFromFields: [],
          relationToFields: [],
        }),
      ],
    })
    const tag = makeModel({
      name: 'Tag',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'posts',
          type: 'Post',
          kind: 'object',
          isList: true,
          relationName: 'PostToTag',
          relationFromFields: [],
          relationToFields: [],
        }),
      ],
    })
    const join = (provider: 'postgresql' | 'mysql' | 'sqlite') => {
      const line = String(
        drizzleSchema(makeDatamodel([post, tag]), provider, [])
          .split('\n')
          .find((text) => text.includes("'_PostToTag'")),
      )
      return line.slice(line.indexOf('(table) =>'))
    }
    const rest =
      "index('_PostToTag_B_index').on(table.B), foreignKey({ name: '_PostToTag_A_fkey', columns: [table.A], foreignColumns: [post.id] }).onDelete('cascade').onUpdate('cascade'), foreignKey({ name: '_PostToTag_B_fkey', columns: [table.B], foreignColumns: [tag.id] }).onDelete('cascade').onUpdate('cascade')])"
    expect(join('postgresql')).toBe(
      `(table) => [primaryKey({ name: '_PostToTag_AB_pkey', columns: [table.A, table.B] }), ${rest}`,
    )
    expect(join('mysql')).toBe(
      `(table) => [uniqueIndex('_PostToTag_AB_unique').on(table.A, table.B), ${rest}`,
    )
    expect(join('sqlite')).toBe(
      `(table) => [uniqueIndex('_PostToTag_AB_unique').on(table.A, table.B), ${rest}`,
    )
  })

  // A long relation name gives a join-table foreign key name Prisma Migrate cuts to the
  // identifier limit. (#316)
  it('cuts the name of a join-table foreign key as Prisma Migrate does', () => {
    const long = 'P'.repeat(70)
    const side = (name: string, other: string) =>
      makeModel({
        name,
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({
            name: 'others',
            type: other,
            kind: 'object',
            isList: true,
            relationName: long,
            relationFromFields: [],
            relationToFields: [],
          }),
        ],
      })
    const schema = drizzleSchema(
      makeDatamodel([side('Post', 'Tag'), side('Tag', 'Post')]),
      'postgresql',
      [],
    )
    // Prisma Migrate cuts the table's name and keeps `_A_fkey` and `_B_fkey` whole, so the two
    // names stay apart.
    expect(schema).toContain(`foreignKey({ name: '_${'P'.repeat(55)}_A_fkey', columns: [table.A]`)
    expect(schema).toContain(`foreignKey({ name: '_${'P'.repeat(55)}_B_fkey', columns: [table.B]`)
  })

  // DMMF drops `@relation(map:)`: the name is read off the schema's text, as Prisma Migrate takes
  // it, and a relation that names none keeps Prisma's `<table>_<columns>_fkey`.
  it('names a foreign key after its @relation(map:), and an unmapped one as Prisma Migrate does', () => {
    const blocks = prismaBlocks(`
model auth_group {
  id    Int    @id
  perms auth_group_permissions[] @relation("group")
  other auth_group_permissions[] @relation("other")
}

model auth_group_permissions {
  id       Int        @id
  group_id Int
  other_id Int
  group    auth_group @relation("group", fields: [group_id], references: [id], map: "auth_group_permissions_group_id_b120cbf9_fk_auth_group_id")
  other    auth_group @relation("other", fields: [other_id], references: [id])
}
`)
    const group = makeModel({
      name: 'auth_group',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'perms',
          type: 'auth_group_permissions',
          kind: 'object',
          isList: true,
          relationName: 'group',
          relationFromFields: [],
          relationToFields: [],
        }),
        makeField({
          name: 'other',
          type: 'auth_group_permissions',
          kind: 'object',
          isList: true,
          relationName: 'other',
          relationFromFields: [],
          relationToFields: [],
        }),
      ],
    })
    const permissions = makeModel({
      name: 'auth_group_permissions',
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'group_id', type: 'Int' }),
        makeField({ name: 'other_id', type: 'Int' }),
        makeField({
          name: 'group',
          type: 'auth_group',
          kind: 'object',
          relationName: 'group',
          relationFromFields: ['group_id'],
          relationToFields: ['id'],
        }),
        makeField({
          name: 'other',
          type: 'auth_group',
          kind: 'object',
          relationName: 'other',
          relationFromFields: ['other_id'],
          relationToFields: ['id'],
        }),
      ],
    })

    expect(
      drizzleSchema(makeDatamodel([group, permissions]), 'postgresql', [], new Set(), blocks),
    ).toContain(
      "(table) => [foreignKey({ name: 'auth_group_permissions_group_id_b120cbf9_fk_auth_group_id', columns: [table.group_id], foreignColumns: [authGroup.id] }).onDelete('restrict').onUpdate('cascade'), foreignKey({ name: 'auth_group_permissions_other_id_fkey', columns: [table.other_id], foreignColumns: [authGroup.id] }).onDelete('restrict').onUpdate('cascade')]",
    )
    // The name is written as a TypeScript string: a quote or a backslash in it is escaped.
    const escaped = prismaBlocks(`
model auth_group_permissions {
  group auth_group @relation("group", fields: [group_id], references: [id], map: "fk_'q\\\\b")
}
`)
    expect(
      drizzleSchema(makeDatamodel([group, permissions]), 'postgresql', [], new Set(), escaped),
    ).toContain("foreignKey({ name: 'fk_\\'q\\\\b', columns: [table.group_id]")
  })
})

// The `where` of a partial index (the `partialIndexes` preview feature), which DMMF drops.
describe('a partial index', () => {
  const blocks = prismaBlocks(`
model Account {
  id     Int     @id
  email  String  @unique(where: raw("alive"))
  alive  Boolean
  n      Int
  status String?
  code   String

  @@unique([n], where: { status: "active" }, map: "account_n_active")
  @@index([alive], where: { alive: true })
  @@index([code], where: raw("code ~ '\\\\d' AND code <> '\`' AND code <> '\${x}'"))
  @@unique([code])
}

model Login {
  id    Int    @id
  email String
  account Account @relation(fields: [email], references: [email])
}
`)
  const account = makeModel({
    name: 'Account',
    fields: [
      makeField({ name: 'id', type: 'Int', isId: true }),
      makeField({ name: 'email', type: 'String', isUnique: true }),
      makeField({ name: 'alive', type: 'Boolean' }),
      makeField({ name: 'n', type: 'Int' }),
      makeField({ name: 'status', type: 'String', isRequired: false }),
      makeField({ name: 'code', type: 'String' }),
      makeField({
        name: 'logins',
        type: 'Login',
        kind: 'object',
        isList: true,
        relationName: 'AccountToLogin',
        relationFromFields: [],
        relationToFields: [],
      }),
    ],
  })
  const login = makeModel({
    name: 'Login',
    fields: [
      makeField({ name: 'id', type: 'Int', isId: true }),
      makeField({ name: 'email', type: 'String' }),
      makeField({
        name: 'account',
        type: 'Account',
        kind: 'object',
        relationName: 'AccountToLogin',
        relationFromFields: ['email'],
        relationToFields: ['email'],
      }),
    ],
  })
  const indexes: DMMF.Index[] = [
    { model: 'Account', type: 'unique', isDefinedOnField: true, fields: [{ name: 'email' }] },
    {
      model: 'Account',
      type: 'unique',
      isDefinedOnField: false,
      dbName: 'account_n_active',
      fields: [{ name: 'n' }],
    },
    { model: 'Account', type: 'normal', isDefinedOnField: false, fields: [{ name: 'alive' }] },
    { model: 'Account', type: 'normal', isDefinedOnField: false, fields: [{ name: 'code' }] },
    { model: 'Account', type: 'unique', isDefinedOnField: false, fields: [{ name: 'code' }] },
  ]
  const accountTable = (provider: 'postgresql' | 'mysql' | 'sqlite') =>
    drizzleSchema(makeDatamodel([account, login]), provider, indexes, new Set(), blocks)

  // The email a relation points at is unique only where `alive`: an index, never a constraint.
  it('keeps its condition on PostgreSQL, unique or not', () => {
    expect(accountTable('postgresql'))
      .toBe(`import { boolean, foreignKey, index, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { defineRelations, sql } from 'drizzle-orm'

export const account = pgTable('Account', { id: integer('id').primaryKey(), email: text('email').notNull(), alive: boolean('alive').notNull(), n: integer('n').notNull(), status: text('status'), code: text('code').notNull() }, (table) => [uniqueIndex('Account_email_key').on(table.email).where(sql\`(alive)\`), uniqueIndex('account_n_active').on(table.n).where(sql\`("status" = 'active')\`), index('Account_alive_idx').on(table.alive).where(sql\`("alive" = true)\`), index('Account_code_idx').on(table.code).where(sql\`(code ~ '\\\\d' AND code <> '\\\`' AND code <> '\\\${x}')\`), uniqueIndex('Account_code_key').on(table.code)])

export const login = pgTable('Login', { id: integer('id').primaryKey(), email: text('email').notNull() }, (table) => [foreignKey({ name: 'Login_email_fkey', columns: [table.email], foreignColumns: [account.email] }).onDelete('restrict').onUpdate('cascade')])

export const relations = defineRelations({ account, login }, (r) => ({ account: { logins: r.many.login() }, login: { account: r.one.account({ from: r.login.email, to: r.account.email, optional: false }) } }))`)
  })

  it('keeps its condition on SQLite', () => {
    expect(accountTable('sqlite').split('\n').slice(0, 4)).toStrictEqual([
      "import { foreignKey, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'",
      "import { defineRelations, sql } from 'drizzle-orm'",
      '',
      "export const account = sqliteTable('Account', { id: integer('id').primaryKey(), email: text('email').notNull(), alive: integer('alive', { mode: 'boolean' }).notNull(), n: integer('n').notNull(), status: text('status'), code: text('code').notNull() }, (table) => [uniqueIndex('Account_email_key').on(table.email).where(sql`(alive)`), uniqueIndex('account_n_active').on(table.n).where(sql`(\"status\" = 'active')`), index('Account_alive_idx').on(table.alive).where(sql`(\"alive\" = true)`), index('Account_code_idx').on(table.code).where(sql`(code ~ '\\\\d' AND code <> '\\`' AND code <> '\\${x}')`), uniqueIndex('Account_code_key').on(table.code)])",
    ])
  })

  // drizzle's MySQL index has no `.where`, and Prisma takes no partial index on MySQL.
  it('is a plain index on MySQL', () => {
    const code = accountTable('mysql')
    expect(code).toContain("unique('Account_email_key').on(table.email), ")
    expect(code).not.toContain('.where(')
    expect(code).toContain("import { defineRelations } from 'drizzle-orm'")
  })
})

// `sort: Desc` on a column of an index (#257): Prisma Migrate makes that column descending.
describe('a descending index column', () => {
  const logEntry = makeModel({
    name: 'LogEntry',
    fields: [
      makeField({ name: 'id', type: 'Int', isId: true }),
      makeField({ name: 'uuid', type: 'String' }),
      makeField({ name: 'action', type: 'String' }),
      makeField({ name: 'timestamp', type: 'DateTime' }),
      makeField({ name: 'note', type: 'String', nativeType: ['Text', []] }),
      makeField({ name: 'code', type: 'String' }),
      makeField({
        name: 'logins',
        type: 'Login',
        kind: 'object',
        isList: true,
        relationName: 'LogEntryToLogin',
        relationFromFields: [],
        relationToFields: [],
      }),
    ],
  })
  const login = makeModel({
    name: 'Login',
    fields: [
      makeField({ name: 'id', type: 'Int', isId: true }),
      makeField({ name: 'code', type: 'String' }),
      makeField({
        name: 'logEntry',
        type: 'LogEntry',
        kind: 'object',
        relationName: 'LogEntryToLogin',
        relationFromFields: ['code'],
        relationToFields: ['code'],
      }),
    ],
  })
  // @@index([uuid, action, timestamp(sort: Desc)], map: "log_entry_uuid_idx")
  // @@unique([action(sort: Asc), timestamp(sort: Desc)])
  // @@index([note(length: 100, sort: Desc)])
  // code String @unique(sort: Desc), which a relation points at
  const indexes: DMMF.Index[] = [
    {
      model: 'LogEntry',
      type: 'normal',
      isDefinedOnField: false,
      dbName: 'log_entry_uuid_idx',
      fields: [
        { name: 'uuid', sortOrder: 'asc' },
        { name: 'action', sortOrder: 'asc' },
        { name: 'timestamp', sortOrder: 'desc' },
      ],
    },
    {
      model: 'LogEntry',
      type: 'unique',
      isDefinedOnField: false,
      fields: [
        { name: 'action', sortOrder: 'asc' },
        { name: 'timestamp', sortOrder: 'desc' },
      ],
    },
    {
      model: 'LogEntry',
      type: 'normal',
      isDefinedOnField: false,
      fields: [{ name: 'note', length: 100, sortOrder: 'desc' }],
    },
    {
      model: 'LogEntry',
      type: 'unique',
      isDefinedOnField: true,
      fields: [{ name: 'code', sortOrder: 'desc' }],
    },
  ]
  const table = (provider: 'postgresql' | 'mysql' | 'sqlite') => {
    const code = drizzleSchema(makeDatamodel([logEntry, login]), provider, indexes)
    const line = code.split('\n').find((l) => l.startsWith('export const logEntry =')) ?? ''
    return [code.split('\n')[1], line.slice(line.indexOf('(table) =>'))]
  }

  // drizzle's `.desc()` alone is `DESC NULLS LAST`; Prisma's `DESC` is NULLS FIRST on PostgreSQL.
  // A unique constraint names no order, and the one a relation points at stays a constraint.
  it('is `.desc().nullsFirst()` on PostgreSQL, in an index and a unique index', () => {
    expect(table('postgresql')).toStrictEqual([
      "import { defineRelations } from 'drizzle-orm'",
      "(table) => [index('log_entry_uuid_idx').on(table.uuid, table.action, table.timestamp.desc().nullsFirst()), uniqueIndex('LogEntry_action_timestamp_key').on(table.action, table.timestamp.desc().nullsFirst()), index('LogEntry_note_idx').on(table.note.desc().nullsFirst()), unique('LogEntry_code_key').on(table.code)])",
    ])
  })

  it('is DESC in SQL on SQLite', () => {
    expect(table('sqlite')).toStrictEqual([
      "import { defineRelations, sql } from 'drizzle-orm'",
      "(table) => [index('log_entry_uuid_idx').on(table.uuid, table.action, sql`${table.timestamp} DESC`), uniqueIndex('LogEntry_action_timestamp_key').on(table.action, sql`${table.timestamp} DESC`), index('LogEntry_note_idx').on(sql`${table.note} DESC`), uniqueIndex('LogEntry_code_key').on(sql`${table.code} DESC`)])",
    ])
  })

  it('is DESC in SQL on MySQL, after the part of a TEXT', () => {
    expect(table('mysql')).toStrictEqual([
      "import { defineRelations, sql } from 'drizzle-orm'",
      "(table) => [index('log_entry_uuid_idx').on(table.uuid, table.action, sql`${table.timestamp} DESC`), uniqueIndex('LogEntry_action_timestamp_key').on(table.action, sql`${table.timestamp} DESC`), index('LogEntry_note_idx').on(sql`${table.note}(100) DESC`), unique('LogEntry_code_key').on(table.code)])",
    ])
  })
})

// DMMF leaves an `@ignore` field out of the model and keeps it in the indexes that list it.
describe('an index over an @ignore field', () => {
  it('is left out with the field', () => {
    const roleAssignment = makeModel({
      name: 'RoleAssignment',
      dbName: 'role_assignments',
      fields: [
        makeField({ name: 'id', type: 'String', isId: true }),
        makeField({ name: 'userId', type: 'String', dbName: 'user_id' }),
        makeField({ name: 'systemRole', type: 'String', dbName: 'system_role' }),
      ],
    })
    const indexes: DMMF.Index[] = [
      {
        model: 'RoleAssignment',
        type: 'unique',
        isDefinedOnField: false,
        dbName: 'role_assignments_user_org_role_key',
        fields: [{ name: 'userId' }, { name: 'deprecatedOwnerOrgId' }, { name: 'systemRole' }],
      },
      {
        model: 'RoleAssignment',
        type: 'normal',
        isDefinedOnField: false,
        dbName: 'role_assignments_owner_org_id_idx',
        fields: [{ name: 'deprecatedOwnerOrgId' }],
      },
      {
        model: 'RoleAssignment',
        type: 'normal',
        isDefinedOnField: false,
        fields: [{ name: 'userId' }],
      },
    ]
    expect(drizzleSchema(makeDatamodel([roleAssignment]), 'postgresql', indexes)).toBe(
      `import { index, pgTable, text } from 'drizzle-orm/pg-core'

export const roleAssignments = pgTable('role_assignments', { id: text('id').primaryKey(), userId: text('user_id').notNull(), systemRole: text('system_role').notNull() }, (table) => [index('role_assignments_user_id_idx').on(table.userId)])`,
    )
  })
})

// A User and a Subscription that each hold a foreign key to the other.
describe('tables whose foreign keys form a cycle', () => {
  const user = makeModel({
    name: 'User',
    fields: [
      makeField({ name: 'id', type: 'String', isId: true }),
      makeField({ name: 'parentSubscriptionId', type: 'Int', isRequired: false }),
      makeField({
        name: 'parentSubscription',
        kind: 'object',
        type: 'Subscription',
        isRequired: false,
        relationName: 'ChildUsers',
        relationFromFields: ['parentSubscriptionId'],
        relationToFields: ['id'],
      }),
      makeField({
        name: 'subscriptions',
        kind: 'object',
        type: 'Subscription',
        isRequired: false,
        relationName: 'SubscriptionToUser',
        relationFromFields: [],
        relationToFields: [],
      }),
    ],
  })
  const subscription = makeModel({
    name: 'Subscription',
    fields: [
      makeField({ name: 'id', type: 'Int', isId: true }),
      makeField({ name: 'userId', type: 'String', isUnique: true }),
      makeField({
        name: 'user',
        kind: 'object',
        type: 'User',
        relationName: 'SubscriptionToUser',
        relationFromFields: ['userId'],
        relationToFields: ['id'],
      }),
      makeField({
        name: 'childUsers',
        kind: 'object',
        type: 'User',
        isList: true,
        relationName: 'ChildUsers',
        relationFromFields: [],
        relationToFields: [],
      }),
    ],
  })
  // A table off the cycle that points into it needs no annotation.
  const invoice = makeModel({
    name: 'Invoice',
    fields: [
      makeField({ name: 'id', type: 'Int', isId: true }),
      makeField({ name: 'subscriptionId', type: 'Int' }),
      makeField({
        name: 'subscription',
        kind: 'object',
        type: 'Subscription',
        relationName: 'InvoiceToSubscription',
        relationFromFields: ['subscriptionId'],
        relationToFields: ['id'],
      }),
    ],
  })
  const indexes: DMMF.Index[] = [
    { model: 'Subscription', type: 'unique', isDefinedOnField: true, fields: [{ name: 'userId' }] },
  ]
  const schema = (provider: 'postgresql' | 'mysql' | 'sqlite') =>
    drizzleSchema(makeDatamodel([user, subscription, invoice]), provider, indexes)

  it('states what the callbacks on the cycle return, on PostgreSQL', () => {
    expect(schema('postgresql'))
      .toBe(`import { type PgTableExtraConfigValue, foreignKey, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { defineRelations } from 'drizzle-orm'

export const user = pgTable('User', { id: text('id').primaryKey(), parentSubscriptionId: integer('parentSubscriptionId') }, (table): PgTableExtraConfigValue[] => [foreignKey({ name: 'User_parentSubscriptionId_fkey', columns: [table.parentSubscriptionId], foreignColumns: [subscription.id] }).onDelete('set null').onUpdate('cascade')])

export const subscription = pgTable('Subscription', { id: integer('id').primaryKey(), userId: text('userId').notNull() }, (table): PgTableExtraConfigValue[] => [uniqueIndex('Subscription_userId_key').on(table.userId), foreignKey({ name: 'Subscription_userId_fkey', columns: [table.userId], foreignColumns: [user.id] }).onDelete('restrict').onUpdate('cascade')])

export const invoice = pgTable('Invoice', { id: integer('id').primaryKey(), subscriptionId: integer('subscriptionId').notNull() }, (table) => [foreignKey({ name: 'Invoice_subscriptionId_fkey', columns: [table.subscriptionId], foreignColumns: [subscription.id] }).onDelete('restrict').onUpdate('cascade')])

export const relations = defineRelations({ user, subscription, invoice }, (r) => ({ user: { parentSubscription: r.one.subscription({ from: r.user.parentSubscriptionId, to: r.subscription.id, alias: 'ChildUsers' }), subscriptions: r.one.subscription({ from: r.user.id, to: r.subscription.userId, alias: 'SubscriptionToUser' }) }, subscription: { user: r.one.user({ from: r.subscription.userId, to: r.user.id, optional: false, alias: 'SubscriptionToUser' }), childUsers: r.many.user({ alias: 'ChildUsers' }) }, invoice: { subscription: r.one.subscription({ from: r.invoice.subscriptionId, to: r.subscription.id, optional: false }) } }))`)
  })

  it('states what the callbacks on the cycle return, on MySQL', () => {
    expect(schema('mysql'))
      .toBe(`import { type MySqlTableExtraConfigValue, foreignKey, int, mysqlTable, uniqueIndex, varchar } from 'drizzle-orm/mysql-core'
import { defineRelations } from 'drizzle-orm'

export const user = mysqlTable('User', { id: varchar('id', { length: 191 }).primaryKey(), parentSubscriptionId: int('parentSubscriptionId') }, (table): MySqlTableExtraConfigValue[] => [foreignKey({ name: 'User_parentSubscriptionId_fkey', columns: [table.parentSubscriptionId], foreignColumns: [subscription.id] }).onDelete('set null').onUpdate('cascade')])

export const subscription = mysqlTable('Subscription', { id: int('id').primaryKey(), userId: varchar('userId', { length: 191 }).notNull() }, (table): MySqlTableExtraConfigValue[] => [uniqueIndex('Subscription_userId_key').on(table.userId), foreignKey({ name: 'Subscription_userId_fkey', columns: [table.userId], foreignColumns: [user.id] }).onDelete('restrict').onUpdate('cascade')])

export const invoice = mysqlTable('Invoice', { id: int('id').primaryKey(), subscriptionId: int('subscriptionId').notNull() }, (table) => [foreignKey({ name: 'Invoice_subscriptionId_fkey', columns: [table.subscriptionId], foreignColumns: [subscription.id] }).onDelete('restrict').onUpdate('cascade')])

export const relations = defineRelations({ user, subscription, invoice }, (r) => ({ user: { parentSubscription: r.one.subscription({ from: r.user.parentSubscriptionId, to: r.subscription.id, alias: 'ChildUsers' }), subscriptions: r.one.subscription({ from: r.user.id, to: r.subscription.userId, alias: 'SubscriptionToUser' }) }, subscription: { user: r.one.user({ from: r.subscription.userId, to: r.user.id, optional: false, alias: 'SubscriptionToUser' }), childUsers: r.many.user({ alias: 'ChildUsers' }) }, invoice: { subscription: r.one.subscription({ from: r.invoice.subscriptionId, to: r.subscription.id, optional: false }) } }))`)
  })

  it('states what the callbacks on the cycle return, on SQLite', () => {
    expect(schema('sqlite'))
      .toBe(`import { type SQLiteTableExtraConfigValue, foreignKey, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { defineRelations } from 'drizzle-orm'

export const user = sqliteTable('User', { id: text('id').notNull(), parentSubscriptionId: integer('parentSubscriptionId') }, (table): SQLiteTableExtraConfigValue[] => [primaryKey({ columns: [table.id] }), foreignKey({ name: 'User_parentSubscriptionId_fkey', columns: [table.parentSubscriptionId], foreignColumns: [subscription.id] }).onDelete('set null').onUpdate('cascade')])

export const subscription = sqliteTable('Subscription', { id: integer('id').primaryKey(), userId: text('userId').notNull() }, (table): SQLiteTableExtraConfigValue[] => [uniqueIndex('Subscription_userId_key').on(table.userId), foreignKey({ name: 'Subscription_userId_fkey', columns: [table.userId], foreignColumns: [user.id] }).onDelete('restrict').onUpdate('cascade')])

export const invoice = sqliteTable('Invoice', { id: integer('id').primaryKey(), subscriptionId: integer('subscriptionId').notNull() }, (table) => [foreignKey({ name: 'Invoice_subscriptionId_fkey', columns: [table.subscriptionId], foreignColumns: [subscription.id] }).onDelete('restrict').onUpdate('cascade')])

export const relations = defineRelations({ user, subscription, invoice }, (r) => ({ user: { parentSubscription: r.one.subscription({ from: r.user.parentSubscriptionId, to: r.subscription.id, alias: 'ChildUsers' }), subscriptions: r.one.subscription({ from: r.user.id, to: r.subscription.userId, alias: 'SubscriptionToUser' }) }, subscription: { user: r.one.user({ from: r.subscription.userId, to: r.user.id, optional: false, alias: 'SubscriptionToUser' }), childUsers: r.many.user({ alias: 'ChildUsers' }) }, invoice: { subscription: r.one.subscription({ from: r.invoice.subscriptionId, to: r.subscription.id, optional: false }) } }))`)
  })
})

describe('drizzleSchema doc comments', () => {
  const datamodel = makeDatamodel(
    [
      makeModel({
        name: 'User',
        documentation: 'A person who signs in.\n\nKept after they leave.\n@z.strict()',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true, documentation: 'The key.' }),
          makeField({ name: 'email', type: 'String', documentation: '@z.email()' }),
          makeField({ name: 'note', type: 'String', documentation: 'Ends a block: */ here.' }),
          makeField({ name: 'role', kind: 'enum', type: 'Role' }),
        ],
      }),
      makeModel({
        name: 'Tag',
        documentation: '@z.strict()',
        fields: [makeField({ name: 'id', type: 'Int', isId: true, documentation: '@z.int()' })],
      }),
    ],
    [
      {
        name: 'Role',
        values: [{ name: 'ADMIN', dbName: null }],
        dbName: null,
        documentation: 'What a user may do.',
      },
    ],
  )

  it('should write the prose of model, field and enum docs as JSDoc', () => {
    expect(drizzleSchema(datamodel, 'postgresql', []))
      .toBe(`import { integer, pgEnum, pgTable, text } from 'drizzle-orm/pg-core'

/** What a user may do. */
export const roleEnum = pgEnum('Role', ['ADMIN'])

/**
 * A person who signs in.
 *
 * Kept after they leave.
 */
export const user = pgTable('User', {
  /** The key. */
  id: integer('id').primaryKey(),
  email: text('email').notNull(),
  /** Ends a block: *\\/ here. */
  note: text('note').notNull(),
  role: roleEnum('role').notNull(),
})

export const tag = pgTable('Tag', { id: integer('id').primaryKey() })`)
  })
})

// `type:` and `ops:` on an index (#272): on PostgreSQL Prisma Migrate makes the index with that
// method and each column with that operator class, as `CREATE INDEX ... USING gin ("data"
// jsonb_path_ops)`. DMMF has the method as `algorithm` and the class as each field's
// `operatorClass`, in Prisma's name (`JsonbPathOps`) or as `raw("...")` gives it.
describe('an index method and operator class', () => {
  const blocks = prismaBlocks(`
model Doc {
  id    Int      @id
  tags  String[]
  data  Json
  title String
  code  String

  @@index([tags], map: "doc_tags_gin", type: Gin)
  @@index([data(ops: JsonbPathOps)], map: "doc_data_gin", type: Gin)
  @@index([title(ops: raw("gin_trgm_ops"))], map: "doc_title_trgm", type: Gin)
  @@index([code(ops: raw("text_pattern_ops"), sort: Desc)], where: raw("code <> ''"))
  @@index([code], map: "doc_code_hash", type: Hash)
}
`)
  const doc = makeModel({
    name: 'Doc',
    fields: [
      makeField({ name: 'id', type: 'Int', isId: true }),
      makeField({ name: 'tags', type: 'String', isList: true }),
      makeField({ name: 'data', type: 'Json' }),
      makeField({ name: 'title', type: 'String' }),
      makeField({ name: 'code', type: 'String' }),
    ],
  })
  const indexes: DMMF.Index[] = [
    {
      model: 'Doc',
      type: 'normal',
      isDefinedOnField: false,
      dbName: 'doc_tags_gin',
      algorithm: 'Gin',
      fields: [{ name: 'tags' }],
    },
    {
      model: 'Doc',
      type: 'normal',
      isDefinedOnField: false,
      dbName: 'doc_data_gin',
      algorithm: 'Gin',
      fields: [{ name: 'data', operatorClass: 'JsonbPathOps' }],
    },
    {
      model: 'Doc',
      type: 'normal',
      isDefinedOnField: false,
      dbName: 'doc_title_trgm',
      algorithm: 'Gin',
      fields: [{ name: 'title', operatorClass: 'gin_trgm_ops' }],
    },
    {
      model: 'Doc',
      type: 'normal',
      isDefinedOnField: false,
      fields: [{ name: 'code', sortOrder: 'desc', operatorClass: 'text_pattern_ops' }],
    },
    {
      model: 'Doc',
      type: 'normal',
      isDefinedOnField: false,
      dbName: 'doc_code_hash',
      algorithm: 'Hash',
      fields: [{ name: 'code' }],
    },
  ]
  const constraints = (provider: 'postgresql' | 'mysql' | 'sqlite') => {
    const code = drizzleSchema(makeDatamodel([doc]), provider, indexes, new Set(), blocks)
    const line = code.split('\n').find((l) => l.startsWith('export const doc =')) ?? ''
    return line.slice(line.indexOf('(table) =>'))
  }

  // A BTree index with an operator class stays `.on`, its column with the `.op` ahead of the
  // order; a partial index keeps its `.where`.
  it('is `.using(method, ...)` and the column `.op(...)` on PostgreSQL', () => {
    expect(constraints('postgresql')).toBe(
      "(table) => [index('doc_tags_gin').using('gin', table.tags), index('doc_data_gin').using('gin', table.data.op('jsonb_path_ops')), index('doc_title_trgm').using('gin', table.title.op('gin_trgm_ops')), index('Doc_code_idx').on(table.code.op('text_pattern_ops').desc().nullsFirst()).where(sql`(code <> '')`), index('doc_code_hash').using('hash', table.code)])",
    )
  })

  // Prisma takes `type:` and `ops:` on PostgreSQL only: elsewhere the index is as it was.
  it('is a plain index on SQLite and MySQL', () => {
    expect([constraints('sqlite'), constraints('mysql')]).toStrictEqual([
      "(table) => [index('doc_tags_gin').on(table.tags), index('doc_data_gin').on(table.data), index('doc_title_trgm').on(table.title), index('Doc_code_idx').on(sql`${table.code} DESC`).where(sql`(code <> '')`), index('doc_code_hash').on(table.code)])",
      "(table) => [index('doc_tags_gin').on(table.tags), index('doc_data_gin').on(table.data), index('doc_title_trgm').on(table.title), index('Doc_code_idx').on(sql`${table.code} DESC`), index('doc_code_hash').on(table.code)])",
    ])
  })
})

describe('an export that would take a name the module uses', () => {
  const schemaOf = (models: string, provider = 'postgresql') => {
    const result = getDMMF({
      datamodel: [['schema.prisma', `datasource db {\n  provider = "${provider}"\n}\n${models}`]],
    })
    if ('type' in result) throw new Error(result.error.message)
    const { datamodel } = result
    return drizzleSchema(datamodel, provider as 'postgresql', datamodel.indexes)
  }

  it('renames a table named after a column function or a helper, on every provider alike', () => {
    const code = schemaOf(`
model Bit {
  id   Int    @id
  mask String @db.Bit(8)
}
model TypedText {
  id  Int    @id
  doc String @db.Xml
}`)
    expect(code).toContain("export const bitTable = pgTable('Bit', ")
    expect(code).toContain("mask: bit('mask', { dimensions: 8 })")
    expect(code).toContain("export const typedTextTable = pgTable('TypedText', ")
    expect(code).toContain("doc: typedText('doc', { type: 'xml' })")
    // The set is the provider's, not what this schema imports: MySQL's year() is reserved there
    // whether or not a field calls it, and PostgreSQL has none.
    const year = 'model Year {\n  id Int @id\n}'
    expect(schemaOf(year, 'mysql')).toContain("export const yearTable = mysqlTable('Year', ")
    expect(schemaOf(year)).toContain("export const year = pgTable('Year', ")
  })

  it('renames a reserved word and a global the module calls', () => {
    const code = schemaOf(`
model Delete {
  id Int @id
}
model Crypto {
  id String @id @default(uuid())
}`)
    expect(code).toContain("export const deleteTable = pgTable('Delete', ")
    expect(code).toContain("export const cryptoTable = pgTable('Crypto', ")
    expect(code).toContain('crypto.randomUUID()')
  })

  it('points a foreign key at a table named Table, not at the callback parameter', () => {
    const code = schemaOf(`
model Table {
  id    Int    @id
  posts Post[]
}
model Post {
  id      Int   @id
  tableId Int
  table   Table @relation(fields: [tableId], references: [id])
}`)
    expect(code).toContain("export const tableTable = pgTable('Table', ")
    expect(code).toContain('foreignColumns: [tableTable.id]')
    expect(code).toContain('defineRelations({ tableTable, post }')
    expect(code).toContain('table: r.one.tableTable({ from: r.post.tableId, to: r.tableTable.id')
  })

  it('makes an identifier of a table name that is not one', () => {
    const code = schemaOf(`
model OrderItem {
  id Int @id
  @@map("order-items")
}
model Code {
  id Int @id
  @@map("2fa_codes")
}`)
    expect(code).toContain("export const orderItems = pgTable('order-items', ")
    expect(code).toContain("export const _2faCodes = pgTable('2fa_codes', ")
  })

  it("steps aside from an enum's export, an earlier table's and a join table's", () => {
    const code = schemaOf(`
enum Status {
  ON
}
model StatusEnum {
  id     Int    @id
  status Status
}
model Line {
  id Int @id
  @@map("order_items")
}
model OtherLine {
  id Int @id
  @@map("orderItems")
}
model Article {
  id   Int   @id
  tags Tag[]
}
model Tag {
  id       Int       @id
  articles Article[]
}
model ArticleToTag {
  id Int @id
}`)
    expect(code).toContain("export const statusEnum = pgEnum('Status', ['ON'])")
    expect(code).toContain("export const statusEnumTable = pgTable('StatusEnum', ")
    expect(code).toContain("export const orderItems = pgTable('order_items', ")
    expect(code).toContain("export const orderItemsTable = pgTable('orderItems', ")
    expect(code).toContain("export const articleToTag = pgTable('ArticleToTag', ")
    expect(code).toContain("export const articleToTagTable = pgTable('_ArticleToTag', ")
    expect(code).toContain('through(r.articleToTagTable.A)')
  })

  it("never takes a dialect's own function with the suffix, and keeps a non-ASCII name", () => {
    const code = schemaOf(`
enum Pg {
  A
}
model Plain {
  id   Int @id
  kind Pg
  @@map("Pg")
}
model Other {
  id Int @id
  @@map("pg")
}
model User {
  id Int @id
  @@map("用户")
}
model Cafe {
  id Int @id
  @@map("café")
}`)
    expect(code).toContain("export const pgEnum2 = pgEnum('Pg', ['A'])")
    expect(code).toContain("kind: pgEnum2('kind')")
    expect(code).toContain("export const pg = pgTable('Pg', ")
    expect(code).toContain("export const pgTable2 = pgTable('pg', ")
    expect(code).toContain("export const 用户 = pgTable('用户', ")
    expect(code).toContain("export const café = pgTable('café', ")
  })

  it('steps aside from no enum where the module declares none', () => {
    const models = `
enum Status {
  ON
}
model StatusEnum {
  id     Int    @id
  status Status
}`
    expect(schemaOf(models, 'mysql')).toContain(
      "export const statusEnum = mysqlTable('StatusEnum', ",
    )
  })
})
