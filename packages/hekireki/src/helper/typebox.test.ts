import { describe, expect, it } from 'vitest'
import {
  makeTypeBoxEnumExpression,
  makeTypeBoxInfer,
  makeTypeBoxRelations,
  makeTypeBoxSchema,
  makeTypeBoxSchemas,
  PRISMA_TO_TYPEBOX,
  typebox,
} from './typebox.js'

describe('helper/typebox', () => {
  describe('PRISMA_TO_TYPEBOX', () => {
    it('maps Prisma types to TypeBox types', () => {
      expect(PRISMA_TO_TYPEBOX.String).toBe('Type.String()')
      expect(PRISMA_TO_TYPEBOX.Int).toBe('Type.Integer()')
      expect(PRISMA_TO_TYPEBOX.Float).toBe('Type.Number()')
      expect(PRISMA_TO_TYPEBOX.Boolean).toBe('Type.Boolean()')
      expect(PRISMA_TO_TYPEBOX.DateTime).toBe('Type.Date()')
      expect(PRISMA_TO_TYPEBOX.BigInt).toBe('Type.BigInt()')
      expect(PRISMA_TO_TYPEBOX.Decimal).toBe('Type.Number()')
      expect(PRISMA_TO_TYPEBOX.Json).toBe('Type.Unknown()')
      expect(PRISMA_TO_TYPEBOX.Bytes).toBe('Type.Any()')
    })
  })

  describe('makeTypeBoxSchemas', () => {
    it.concurrent('schemas comment true', () => {
      const result = makeTypeBoxSchemas(
        [
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'id',
            comment: ['Primary key'],
            validation: 'Type.String()',
            isRequired: true,
          },
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'name',
            comment: ['Display name'],
            validation: 'Type.String()',
            isRequired: true,
          },
        ],
        true,
      )
      const expected = `export const UserSchema = Type.Object({
  /** Primary key */
  id: Type.String(),
  /** Display name */
  name: Type.String(),
})`
      expect(result).toBe(expected)
    })

    it.concurrent('schemas comment false', () => {
      const result = makeTypeBoxSchemas(
        [
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'id',
            comment: ['Primary key'],
            validation: 'Type.String()',
            isRequired: true,
          },
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'name',
            comment: ['Display name'],
            validation: 'Type.String()',
            isRequired: true,
          },
        ],
        false,
      )
      const expected = `export const UserSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
})`
      expect(result).toBe(expected)
    })

    it.concurrent('wraps optional fields with Type.Optional', () => {
      const result = makeTypeBoxSchemas(
        [
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'id',
            comment: [],
            validation: 'Type.String()',
            isRequired: true,
          },
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'email',
            comment: [],
            validation: 'Type.String()',
            isRequired: false,
          },
        ],
        false,
      )
      const expected = `export const UserSchema = Type.Object({
  id: Type.String(),
  email: Type.Optional(Type.String()),
})`
      expect(result).toBe(expected)
    })
  })

  describe('makeTypeBoxRelations', () => {
    it('returns null when no relations', () => {
      const result = makeTypeBoxRelations({ name: 'User' }, [])
      expect(result).toBeNull()
    })

    it('generates relation schema with spread and relation fields', () => {
      const relProps = [
        { key: 'posts', targetModel: 'Post', isMany: true },
        { key: 'profile', targetModel: 'Profile', isMany: false },
      ]

      const result = makeTypeBoxRelations({ name: 'User' }, relProps)

      expect(result).toBe(
        'export const UserRelationsSchema = Type.Object({\n  ...UserSchema.properties,\n  posts: Type.Array(PostSchema),\n  profile: ProfileSchema,\n})',
      )
    })

    it('includes type export when includeType is true', () => {
      const relProps = [{ key: 'posts', targetModel: 'Post', isMany: true }]

      const result = makeTypeBoxRelations({ name: 'User' }, relProps, { includeType: true })

      expect(result).toBe(
        'export const UserRelationsSchema = Type.Object({\n  ...UserSchema.properties,\n  posts: Type.Array(PostSchema),\n})\n\nexport type UserRelations = Static<typeof UserRelationsSchema>',
      )
    })
  })

  describe('typebox', () => {
    it('generates full output with import and schemas', () => {
      const model = {
        name: 'User',
        fields: [
          {
            name: 'id',
            type: 'String',
            kind: 'scalar',
            isRequired: true,
            isList: false,
            documentation: '@t.Type.String()',
          },
          {
            name: 'name',
            type: 'String',
            kind: 'scalar',
            isRequired: true,
            isList: false,
            documentation: '@t.Type.String()',
          },
        ],
      }

      const result = typebox([model], false, false)

      expect(result).toBe(
        "import { Type } from '@sinclair/typebox'\n\nexport const UserSchema = Type.Object({\n  id: Type.String(),\n  name: Type.String(),\n})",
      )
    })

    it('falls back to type mapping when no annotation', () => {
      const model = {
        name: 'Item',
        fields: [
          { name: 'id', type: 'Int', kind: 'scalar', isRequired: true, isList: false },
          { name: 'name', type: 'String', kind: 'scalar', isRequired: true, isList: false },
        ],
      }

      const result = typebox([model], false, false)

      expect(result).toBe(
        "import { Type } from '@sinclair/typebox'\n\nexport const ItemSchema = Type.Object({\n  id: Type.Integer(),\n  name: Type.String(),\n})",
      )
    })

    it('generates type inference when type is true', () => {
      const model = {
        name: 'User',
        fields: [{ name: 'id', type: 'String', kind: 'scalar', isRequired: true, isList: false }],
      }

      const result = typebox([model], true, false)

      expect(result).toContain('export type User = Static<typeof UserSchema>')
    })
  })

  describe('makeTypeBoxInfer', () => {
    it('generates TypeBox Static infer type', () => {
      expect(makeTypeBoxInfer('User')).toBe('export type User = Static<typeof UserSchema>')
    })
  })

  describe('makeTypeBoxSchema', () => {
    it('generates schema with fields', () => {
      const result = makeTypeBoxSchema('Post', '  id: Type.String(),\n  title: Type.String()')
      expect(result).toBe(
        'export const PostSchema = Type.Object({\n  id: Type.String(),\n  title: Type.String()\n})',
      )
    })
  })

  describe('makeTypeBoxEnumExpression', () => {
    it('generates Type.Union with Type.Literal', () => {
      expect(makeTypeBoxEnumExpression(['USER', 'ADMIN'])).toBe(
        "Type.Union([Type.Literal('USER'), Type.Literal('ADMIN')])",
      )
    })
    it('handles single value', () => {
      expect(makeTypeBoxEnumExpression(['ACTIVE'])).toBe("Type.Union([Type.Literal('ACTIVE')])")
    })
  })
})
