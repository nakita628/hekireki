import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vitest'
import { drizzleSchema } from './drizzle.js'

// Test run
// pnpm vitest run ./src/helper/drizzle.test.ts

// ============================================================================
// Helpers
// ============================================================================

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
    nativeType: null,
    ...overrides,
  }
}

function makeDatamodel(
  models: DMMF.Model[],
  enums: DMMF.DatamodelEnum[] = [],
): DMMF.Datamodel {
  return { models, enums, types: [] }
}

// ============================================================================
// drizzleSchema — PostgreSQL
// ============================================================================

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

      // Import statements
      expect(result).toContain("from 'drizzle-orm/pg-core'")
      expect(result).toContain('serial')
      expect(result).toContain('text')
      expect(result).toContain('integer')
      expect(result).toContain('pgTable')

      // Table definitions
      expect(result).toContain("export const user = pgTable('user'")
      expect(result).toContain("id: serial('id').primaryKey()")
      expect(result).toContain("name: text('name').notNull()")
      expect(result).toContain("email: text('email').notNull().unique()")

      expect(result).toContain("export const post = pgTable('post'")
      expect(result).toContain("title: text('title').notNull()")

      // Relations
      expect(result).toContain("from 'drizzle-orm'")
      expect(result).toContain('relations')
      expect(result).toContain('export const userRelations = relations(user,')
      expect(result).toContain('many')
      expect(result).toContain('posts: many(post)')
      expect(result).toContain('export const postRelations = relations(post,')
      expect(result).toContain('one')
      expect(result).toContain('author: one(user,')
    })
  })

  // ============================================================================
  // drizzleSchema — SQLite
  // ============================================================================

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

      expect(result).toContain("from 'drizzle-orm/sqlite-core'")
      expect(result).toContain('sqliteTable')
      expect(result).toContain("export const user = sqliteTable('user'")
      // SQLite autoincrement uses primaryKey({ autoIncrement: true })
      expect(result).toContain("id: integer('id').primaryKey({ autoIncrement: true })")
      expect(result).toContain("name: text('name').notNull()")
      // SQLite Boolean maps to integer({ mode: 'boolean' })
      expect(result).toContain("active: integer('active', { mode: 'boolean' }).notNull()")
      // SQLite DateTime maps to integer({ mode: 'timestamp' })
      expect(result).toContain("createdAt: integer('createdAt', { mode: 'timestamp' }).notNull()")
    })
  })

  // ============================================================================
  // drizzleSchema — MySQL
  // ============================================================================

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

      expect(result).toContain("from 'drizzle-orm/mysql-core'")
      expect(result).toContain('mysqlTable')
      expect(result).toContain("export const user = mysqlTable('user'")
      expect(result).toContain("id: int('id').primaryKey().autoincrement()")
      expect(result).toContain("name: text('name').notNull()")
    })
  })

  // ============================================================================
  // Enum fields
  // ============================================================================

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

      expect(result).toContain('pgEnum')
      expect(result).toContain("pgEnum('Role', ['ADMIN', 'USER'])")
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

      expect(result).toContain("text('role', { enum: ['ADMIN', 'USER'] })")
    })
  })

  // ============================================================================
  // Optional / nullable fields
  // ============================================================================

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

      // Optional fields should not have .notNull()
      expect(result).toContain("bio: text('bio')")
      expect(result).not.toContain("bio: text('bio').notNull()")
      expect(result).toContain("age: integer('age')")
      expect(result).not.toContain("age: integer('age').notNull()")
    })
  })

  // ============================================================================
  // Default values
  // ============================================================================

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

      expect(result).toContain(".default('en')")
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

      expect(result).toContain('.defaultNow()')
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

      expect(result).toContain('sql`(unixepoch())`')
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

      expect(result).toContain('.default(0)')
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

      expect(result).toContain('.default(false)')
    })
  })
})
