import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vitest'
import { effect, makeEffectRelations, makeEffectSchemas, PRISMA_TO_EFFECT } from './effect.js'

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

describe('helper/effect', () => {
  describe('PRISMA_TO_EFFECT', () => {
    it('PRISMA_TO_EFFECT maps String to Schema.String', () => {
      expect(PRISMA_TO_EFFECT.String).toBe('Schema.String')
      expect(PRISMA_TO_EFFECT.Int).toBe('Schema.Number')
      expect(PRISMA_TO_EFFECT.BigInt).toBe('Schema.BigIntFromSelf')
    })
  })

  describe('makeEffectSchemas', () => {
    it('generates schema with comments', () => {
      const result = makeEffectSchemas(
        [
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'id',
            comment: ['Primary key'],
            validation: 'Schema.String',
            isRequired: true,
          },
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'name',
            comment: ['Display name'],
            validation: 'Schema.String',
            isRequired: true,
          },
        ],
        true,
      )
      const expected = `export const UserSchema = Schema.Struct({
  /** Primary key */
  id: Schema.String,
  /** Display name */
  name: Schema.String,
})`
      expect(result).toBe(expected)
    })

    it('generates schema without comments', () => {
      const result = makeEffectSchemas(
        [
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'id',
            comment: [],
            validation: 'Schema.String',
            isRequired: true,
          },
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'age',
            comment: [],
            validation: 'Schema.Number',
            isRequired: true,
          },
        ],
        false,
      )
      const expected = `export const UserSchema = Schema.Struct({
  id: Schema.String,
  age: Schema.Number,
})`
      expect(result).toBe(expected)
    })
  })

  describe('makeEffectRelations', () => {
    it('returns null when no relations', () => {
      const model = makeModel({ name: 'User' })
      const result = makeEffectRelations(model, [])
      expect(result).toBeNull()
    })

    it('generates relation schema with single and many relations', () => {
      const model = makeModel({ name: 'User' })
      const result = makeEffectRelations(model, [
        { key: 'posts', targetModel: 'Post', isMany: true },
        { key: 'profile', targetModel: 'Profile', isMany: false },
      ])
      expect(result).toBe(
        'export const UserRelationsSchema = Schema.Struct({...UserSchema.fields,posts:Schema.Array(PostSchema),profile:ProfileSchema,})',
      )
    })

    it('includes type export when includeType is true', () => {
      const model = makeModel({ name: 'User' })
      const result = makeEffectRelations(
        model,
        [{ key: 'posts', targetModel: 'Post', isMany: true }],
        { includeType: true },
      )
      expect(result).toContain(
        'export type UserRelations = Schema.Schema.Type<typeof UserRelationsSchema>',
      )
    })
  })

  describe('effect', () => {
    it('generates full output with import and schemas', () => {
      const models = [
        makeModel({
          name: 'User',
          fields: [
            makeField({ name: 'id', type: 'String', documentation: '@e.Schema.UUID' }),
            makeField({ name: 'age', type: 'Int', documentation: undefined }),
          ],
        }),
      ]
      const result = effect(models, false, false)
      expect(result).toContain("import { Schema } from 'effect'")
      expect(result).toContain('export const UserSchema = Schema.Struct({')
      expect(result).toContain('id: Schema.UUID')
      expect(result).toContain('age: Schema.Number')
    })

    it('generates type inference when type is true', () => {
      const models = [
        makeModel({
          name: 'Post',
          fields: [makeField({ name: 'title', type: 'String' })],
        }),
      ]
      const result = effect(models, true, false)
      expect(result).toContain(
        'export type Post = Schema.Schema.Type<typeof PostSchema>',
      )
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
      const result = effect(models, false, false, enums)
      expect(result).toContain('role:')
      expect(result).toContain('ADMIN')
      expect(result).toContain('USER')
    })
  })
})
