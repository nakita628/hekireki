import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vitest'
import {
  makeValibotModel,
  makeValibotRelations,
  makeValibotSchemas,
  PRISMA_TO_VALIBOT,
  valibot,
} from './valibot.js'

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

describe('helper/valibot', () => {
  describe('PRISMA_TO_VALIBOT', () => {
    it('PRISMA_TO_VALIBOT maps String to string()', () => {
      expect(PRISMA_TO_VALIBOT.String).toBe('string()')
      expect(PRISMA_TO_VALIBOT.Int).toBe('number()')
    })
  })

  describe('makeValibotSchemas', () => {
    it.concurrent('schemas comment true', () => {
      const result = makeValibotSchemas(
        [
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'id',
            comment: ['Primary key', '@z.uuid()'],
            validation: 'pipe(v.string(), v.uuid())',
            isRequired: true,
          },
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'name',
            comment: ['Display name', '@z.string().min(1).max(50)'],
            validation: 'pipe(v.string(), v.minLength(1), v.maxLength(50))',
            isRequired: true,
          },
        ],
        true,
      )

      const expected = `export const UserSchema = v.object({
  /**
   * Primary key
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * Display name
   */
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(50))
})`
      expect(result).toBe(expected)
    })
    it.concurrent('schemas comment false', () => {
      const result = makeValibotSchemas(
        [
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'id',
            comment: ['Primary key', '@z.uuid()'],
            validation: 'pipe(v.string(), v.uuid())',
            isRequired: true,
          },
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'name',
            comment: ['Display name', '@z.string().min(1).max(50)'],
            validation: 'pipe(v.string(), v.minLength(1), v.maxLength(50))',
            isRequired: true,
          },
        ],
        false,
      )

      const expected = `export const UserSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(50))
})`
      expect(result).toBe(expected)
    })
  })

  describe('makeValibotModel', () => {
    it('generates schema and type export for a simple model', () => {
      const model = makeModel({
        name: 'User',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            documentation: '@v.pipe(v.string(), v.uuid())',
          }),
          makeField({
            name: 'name',
            type: 'String',
            documentation: '@v.pipe(v.string(), v.minLength(1))',
          }),
        ],
      })

      const result = makeValibotModel(model)

      expect(result).toContain('export const UserSchema = v.object(')
      expect(result).toContain('id: v.pipe(v.string(), v.uuid())')
      expect(result).toContain('name: v.pipe(v.string(), v.minLength(1))')
      expect(result).toContain('export type User = v.InferInput<typeof UserSchema>')
    })

    it('filters out object (relation) fields', () => {
      const model = makeModel({
        name: 'User',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            documentation: '@v.pipe(v.string(), v.uuid())',
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
      })

      const result = makeValibotModel(model)

      expect(result).toContain('id: v.pipe(v.string(), v.uuid())')
      expect(result).not.toContain('posts')
    })

    it('wraps optional fields with v.exactOptional()', () => {
      const model = makeModel({
        name: 'Profile',
        fields: [
          makeField({
            name: 'bio',
            type: 'String',
            isRequired: false,
            documentation: '@v.string()',
          }),
        ],
      })

      const result = makeValibotModel(model)

      expect(result).toContain('bio: v.exactOptional(v.string())')
    })
  })

  describe('makeValibotRelations', () => {
    it('returns null when no relations', () => {
      const model = makeModel({ name: 'User' })
      const result = makeValibotRelations(model, [])
      expect(result).toBeNull()
    })

    it('generates relation schema with spread and relation fields', () => {
      const model = makeModel({ name: 'User' })
      const relProps = [
        { key: 'posts', targetModel: 'Post', isMany: true },
        { key: 'profile', targetModel: 'Profile', isMany: false },
      ]

      const result = makeValibotRelations(model, relProps)

      expect(result).toContain('export const UserRelationsSchema = v.object(')
      expect(result).toContain('...UserSchema.entries,')
      expect(result).toContain('posts: v.array(PostSchema)')
      expect(result).toContain('profile: ProfileSchema')
    })

    it('includes type export when includeType is true', () => {
      const model = makeModel({ name: 'User' })
      const relProps = [{ key: 'posts', targetModel: 'Post', isMany: true }]

      const result = makeValibotRelations(model, relProps, { includeType: true })

      expect(result).toContain(
        'export type UserRelations = v.InferInput<typeof UserRelationsSchema>',
      )
    })
  })

  describe('valibot', () => {
    it('generates full output with import and schemas', () => {
      const model = makeModel({
        name: 'User',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            documentation: '@v.pipe(v.string(), v.uuid())',
          }),
          makeField({
            name: 'name',
            type: 'String',
            documentation: '@v.pipe(v.string(), v.minLength(1))',
          }),
        ],
      })

      const result = valibot([model], false, false)

      expect(result).toContain("import * as v from 'valibot'")
      expect(result).toContain('export const UserSchema = v.object(')
      expect(result).toContain('id: v.pipe(v.string(), v.uuid())')
    })

    it('includes type inference when type is true', () => {
      const model = makeModel({
        name: 'Item',
        fields: [
          makeField({ name: 'id', type: 'Int' }),
        ],
      })

      const result = valibot([model], true, false)

      expect(result).toContain("import * as v from 'valibot'")
      expect(result).toContain('v.InferInput<typeof ItemSchema>')
    })
  })
})
