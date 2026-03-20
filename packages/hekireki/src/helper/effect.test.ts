import { describe, expect, it } from 'vitest'

import {
  effect,
  makeEffectEnumExpression,
  makeEffectInfer,
  makeEffectProperties,
  makeEffectRelations,
  makeEffectSchema,
  makeEffectSchemas,
  PRISMA_TO_EFFECT,
} from './effect.js'

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
  /**
   * Primary key
   */
  id: Schema.String,
  /**
   * Display name
   */
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
      const result = makeEffectRelations({ name: 'User' }, [])
      expect(result).toBeNull()
    })

    it('generates relation schema with single and many relations', () => {
      const result = makeEffectRelations({ name: 'User' }, [
        { key: 'posts', targetModel: 'Post', isMany: true },
        { key: 'profile', targetModel: 'Profile', isMany: false },
      ])
      expect(result).toBe(
        'export const UserRelationsSchema = Schema.Struct({...UserSchema.fields,posts:Schema.Array(PostSchema),profile:ProfileSchema,})',
      )
    })

    it('includes type export when includeType is true', () => {
      const result = makeEffectRelations(
        { name: 'User' },
        [{ key: 'posts', targetModel: 'Post', isMany: true }],
        { includeType: true },
      )
      expect(result).toBe(
        'export const UserRelationsSchema = Schema.Struct({...UserSchema.fields,posts:Schema.Array(PostSchema),})\n\nexport type UserRelationsEncoded = typeof UserRelationsSchema.Encoded',
      )
    })
  })

  describe('effect', () => {
    it('generates full output with import and schemas', () => {
      const models = [
        {
          name: 'User',
          fields: [
            {
              name: 'id',
              type: 'String',
              kind: 'scalar',
              isRequired: true,
              isList: false,
              documentation: '@e.Schema.UUID',
            },
            { name: 'age', type: 'Int', kind: 'scalar', isRequired: true, isList: false },
          ],
        },
      ]
      const result = effect(models, false, false)
      expect(result).toBe(
        "import { Schema } from 'effect'\n\nexport const UserSchema = Schema.Struct({\n  id: Schema.UUID,\n  age: Schema.Number,\n})",
      )
    })

    it('generates type inference when type is true', () => {
      const models = [
        {
          name: 'Post',
          fields: [
            { name: 'title', type: 'String', kind: 'scalar', isRequired: true, isList: false },
          ],
        },
      ]
      const result = effect(models, true, false)
      expect(result).toBe(
        "import { Schema } from 'effect'\n\nexport const PostSchema = Schema.Struct({\n  title: Schema.String,\n})\n\nexport type PostEncoded = typeof PostSchema.Encoded",
      )
    })

    it('handles enums', () => {
      const models = [
        {
          name: 'User',
          fields: [{ name: 'role', type: 'Role', kind: 'enum', isRequired: true, isList: false }],
        },
      ]
      const enums = [
        {
          name: 'Role',
          values: [{ name: 'ADMIN' }, { name: 'USER' }],
        },
      ]
      const result = effect(models, false, false, enums)
      expect(result).toBe(
        "import { Schema } from 'effect'\n\nexport const UserSchema = Schema.Struct({\n  role: Schema.Literal('ADMIN', 'USER'),\n})",
      )
    })
  })

  describe('makeEffectInfer', () => {
    it('generates Effect infer type', () => {
      expect(makeEffectInfer('User')).toBe('export type UserEncoded = typeof UserSchema.Encoded')
    })
  })

  describe('makeEffectSchema', () => {
    it('generates Effect schema definition', () => {
      expect(makeEffectSchema('User', '  id: Schema.String')).toBe(
        'export const UserSchema = Schema.Struct({\n  id: Schema.String\n})',
      )
    })
  })

  describe('makeEffectProperties', () => {
    const fields = [
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'id',
        validation: 'Schema.String',
        isRequired: true,
        comment: ['Primary key'],
      },
    ]

    it('generates properties with comments', () => {
      expect(makeEffectProperties(fields, true)).toBe(
        '  /**\n   * Primary key\n   */\n  id: Schema.String,',
      )
    })
    it('generates properties without comments', () => {
      expect(makeEffectProperties(fields, false)).toBe('  id: Schema.String,')
    })
    it('uses Schema.Unknown for null validation', () => {
      const nullFields = [{ ...fields[0], validation: null, comment: [] }]
      expect(makeEffectProperties(nullFields, false)).toBe('  id: Schema.Unknown,')
    })
  })

  describe('makeEffectEnumExpression', () => {
    it('generates Schema.Literal()', () => {
      expect(makeEffectEnumExpression(['USER', 'ADMIN'])).toBe("Schema.Literal('USER', 'ADMIN')")
    })
    it('handles single value', () => {
      expect(makeEffectEnumExpression(['ACTIVE'])).toBe("Schema.Literal('ACTIVE')")
    })
  })
})
