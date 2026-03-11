import { describe, expect, it } from 'vitest'
import {
  arktype,
  makeArktypeEnumExpression,
  makeArktypeInfer,
  makeArktypeProperties,
  makeArktypeRelations,
  makeArktypeSchema,
  makeArktypeSchemas,
  PRISMA_TO_ARKTYPE,
} from './arktype.js'

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
      const result = makeArktypeRelations({ name: 'User' }, [])
      expect(result).toBeNull()
    })

    it('generates relation schema with single and many relations', () => {
      const result = makeArktypeRelations({ name: 'User' }, [
        { key: 'posts', targetModel: 'Post', isMany: true },
        { key: 'profile', targetModel: 'Profile', isMany: false },
      ])
      expect(result).toBe(
        'export const UserRelationsSchema = type({...UserSchema.t,posts:PostSchema.array(),profile:ProfileSchema,})',
      )
    })

    it('includes type export when includeType is true', () => {
      const result = makeArktypeRelations(
        { name: 'User' },
        [{ key: 'posts', targetModel: 'Post', isMany: true }],
        { includeType: true },
      )
      expect(result).toBe(
        'export const UserRelationsSchema = type({...UserSchema.t,posts:PostSchema.array(),})\n\nexport type UserRelations = typeof UserRelationsSchema.infer',
      )
    })
  })

  describe('arktype', () => {
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
              documentation: '@a."string"',
            },
            { name: 'age', type: 'Int', kind: 'scalar', isRequired: true, isList: false },
          ],
        },
      ]
      const result = arktype(models, false, false)
      expect(result).toBe(
        'import { type } from \'arktype\'\n\nexport const UserSchema = type({\n  id: "string",\n  age: "number",\n})',
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
      const result = arktype(models, true, false)
      expect(result).toBe(
        'import { type } from \'arktype\'\n\nexport const PostSchema = type({\n  title: "string",\n})\n\nexport type Post = typeof PostSchema.infer',
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
      const result = arktype(models, false, false, enums)
      expect(result).toBe(
        "import { type } from 'arktype'\n\nexport const UserSchema = type({\n  role: \"'ADMIN' | 'USER'\",\n})",
      )
    })
  })

  describe('makeArktypeInfer', () => {
    it('generates ArkType infer type', () => {
      expect(makeArktypeInfer('User')).toBe('export type User = typeof UserSchema.infer')
    })
  })

  describe('makeArktypeSchema', () => {
    it('generates ArkType schema definition', () => {
      expect(makeArktypeSchema('User', '  id: "string"')).toBe(
        'export const UserSchema = type({\n  id: "string"\n})',
      )
    })
  })

  describe('makeArktypeProperties', () => {
    const fields = [
      {
        documentation: '',
        modelName: 'User',
        fieldName: 'id',
        validation: '"string.uuid"',
        isRequired: true,
        comment: ['Primary key'],
      },
    ]

    it('generates properties with comments', () => {
      expect(makeArktypeProperties(fields, true)).toBe('  /** Primary key */\n  id: "string.uuid",')
    })
    it('generates properties without comments', () => {
      expect(makeArktypeProperties(fields, false)).toBe('  id: "string.uuid",')
    })
    it('uses "unknown" for null validation', () => {
      const nullFields = [{ ...fields[0], validation: null, comment: [] }]
      expect(makeArktypeProperties(nullFields, false)).toBe('  id: "unknown",')
    })
  })

  describe('makeArktypeEnumExpression', () => {
    it('generates union string', () => {
      expect(makeArktypeEnumExpression(['USER', 'ADMIN'])).toBe("\"'USER' | 'ADMIN'\"")
    })
    it('handles single value', () => {
      expect(makeArktypeEnumExpression(['ACTIVE'])).toBe('"\'ACTIVE\'"')
    })
  })
})
