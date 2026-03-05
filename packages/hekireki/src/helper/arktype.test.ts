import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vitest'
import { arktype, makeArktypeRelations, makeArktypeSchemas, PRISMA_TO_ARKTYPE } from './arktype.js'

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

describe('helper/arktype', () => {
  describe('PRISMA_TO_ARKTYPE', () => {
    it('PRISMA_TO_ARKTYPE maps String to "string"', () => {
      expect(PRISMA_TO_ARKTYPE.String).toBe('"string"')
      expect(PRISMA_TO_ARKTYPE.Int).toBe('"number"')
      expect(PRISMA_TO_ARKTYPE.DateTime).toBe('"Date"')
    })
  })

  describe('makeArktypeSchemas', () => {
    it('generates schema with comments', () => {
      const result = makeArktypeSchemas(
        [
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'id',
            comment: ['Primary key'],
            validation: '"string"',
            isRequired: true,
          },
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'name',
            comment: ['Display name'],
            validation: '"string"',
            isRequired: true,
          },
        ],
        true,
      )
      const expected = `export const UserSchema = type({
  /** Primary key */
  id: "string",
  /** Display name */
  name: "string",
})`
      expect(result).toBe(expected)
    })

    it('generates schema without comments', () => {
      const result = makeArktypeSchemas(
        [
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'id',
            comment: [],
            validation: '"string"',
            isRequired: true,
          },
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'age',
            comment: [],
            validation: '"number"',
            isRequired: true,
          },
        ],
        false,
      )
      const expected = `export const UserSchema = type({
  id: "string",
  age: "number",
})`
      expect(result).toBe(expected)
    })
  })

  describe('makeArktypeRelations', () => {
    it('returns null when no relations', () => {
      const model = makeModel({ name: 'User' })
      const result = makeArktypeRelations(model, [])
      expect(result).toBeNull()
    })

    it('generates relation schema with single and many relations', () => {
      const model = makeModel({ name: 'User' })
      const result = makeArktypeRelations(model, [
        { key: 'posts', targetModel: 'Post', isMany: true },
        { key: 'profile', targetModel: 'Profile', isMany: false },
      ])
      expect(result).toBe(
        'export const UserRelationsSchema = type({...UserSchema.t,posts:PostSchema.array(),profile:ProfileSchema,})',
      )
    })

    it('includes type export when includeType is true', () => {
      const model = makeModel({ name: 'User' })
      const result = makeArktypeRelations(
        model,
        [{ key: 'posts', targetModel: 'Post', isMany: true }],
        { includeType: true },
      )
      expect(result).toContain(
        'export type UserRelations = typeof UserRelationsSchema.infer',
      )
    })
  })

  describe('arktype', () => {
    it('generates full output with import and schemas', () => {
      const models = [
        makeModel({
          name: 'User',
          fields: [
            makeField({ name: 'id', type: 'String', documentation: '@a."string"' }),
            makeField({ name: 'age', type: 'Int', documentation: undefined }),
          ],
        }),
      ]
      const result = arktype(models, false, false)
      expect(result).toContain("import { type } from 'arktype'")
      expect(result).toContain('export const UserSchema = type({')
      expect(result).toContain('id: "string"')
      expect(result).toContain('age: "number"')
    })

    it('generates type inference when type is true', () => {
      const models = [
        makeModel({
          name: 'Post',
          fields: [makeField({ name: 'title', type: 'String' })],
        }),
      ]
      const result = arktype(models, true, false)
      expect(result).toContain('export type Post = typeof PostSchema.infer')
    })

    it('handles enums', () => {
      const models = [
        makeModel({
          name: 'User',
          fields: [makeField({ name: 'role', type: 'Role', kind: 'enum' })],
        }),
      ]
      const enums: DMMF.DatamodelEnum[] = [
        { name: 'Role', values: [{ name: 'ADMIN', dbName: null }, { name: 'USER', dbName: null }] },
      ]
      const result = arktype(models, false, false, enums)
      expect(result).toContain('role:')
      expect(result).toContain('ADMIN')
      expect(result).toContain('USER')
    })
  })
})
