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
  /**
   * Primary key
   */
  id: "string",
  /**
   * Display name
   */
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
      expect(makeArktypeProperties(fields, true)).toBe(
        '  /**\n   * Primary key\n   */\n  id: "string.uuid",',
      )
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

  // ============================================================================
  // Real-world use case tests
  // ============================================================================

  describe('E-Commerce order pattern', () => {
    it('generates Order schema with enum and type', () => {
      const models = [
        {
          name: 'Order',
          fields: [
            {
              name: 'id',
              type: 'String',
              kind: 'scalar',
              isRequired: true,
              isList: false,
              documentation: '@a."string.uuid"',
            },
            {
              name: 'status',
              type: 'OrderStatus',
              kind: 'enum',
              isRequired: true,
              isList: false,
            },
            {
              name: 'totalAmount',
              type: 'Int',
              kind: 'scalar',
              isRequired: true,
              isList: false,
            },
          ],
        },
      ]
      const enums = [
        {
          name: 'OrderStatus',
          values: [
            { name: 'PENDING' },
            { name: 'CONFIRMED' },
            { name: 'SHIPPED' },
            { name: 'DELIVERED' },
            { name: 'CANCELLED' },
          ],
        },
      ]
      const result = arktype(models, true, false, enums)
      expect(result).toBe(
        "import { type } from 'arktype'\n\nexport const OrderSchema = type({\n  id: \"string.uuid\",\n  status: \"'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'\",\n  totalAmount: \"number\",\n})\n\nexport type Order = typeof OrderSchema.infer",
      )
    })

    it('generates Order schema with comments', () => {
      const result = makeArktypeSchemas(
        [
          {
            documentation: '',
            modelName: 'Order',
            fieldName: 'id',
            comment: ['Order ID'],
            validation: '"string.uuid"',
            isRequired: true,
          },
          {
            documentation: '',
            modelName: 'Order',
            fieldName: 'totalAmount',
            comment: ['Total amount in cents', 'Integer to avoid floating point issues'],
            validation: '"number"',
            isRequired: true,
          },
        ],
        true,
      )
      expect(result).toBe(`export const OrderSchema = type({
  /**
   * Order ID
   */
  id: "string.uuid",
  /**
   * Total amount in cents
   * Integer to avoid floating point issues
   */
  totalAmount: "number",
})`)
    })

    it('generates Order relations with items and customer', () => {
      const result = makeArktypeRelations(
        { name: 'Order' },
        [
          { key: 'items', targetModel: 'OrderItem', isMany: true },
          { key: 'customer', targetModel: 'Customer', isMany: false },
        ],
        { includeType: true },
      )
      expect(result).toBe(
        'export const OrderRelationsSchema = type({...OrderSchema.t,items:OrderItemSchema.array(),customer:CustomerSchema,})\n\nexport type OrderRelations = typeof OrderRelationsSchema.infer',
      )
    })
  })

  describe('multiple enum values (RBAC)', () => {
    it('generates multi-value enum expression', () => {
      expect(makeArktypeEnumExpression(['OWNER', 'ADMIN', 'EDITOR', 'VIEWER', 'GUEST'])).toBe(
        "\"'OWNER' | 'ADMIN' | 'EDITOR' | 'VIEWER' | 'GUEST'\"",
      )
    })
  })

  // ============================================================================
  // Edge case tests
  // ============================================================================

  describe('edge cases', () => {
    it('all Prisma scalar types produce valid ArkType expressions', () => {
      const allTypes = [
        'String',
        'Int',
        'Float',
        'Boolean',
        'DateTime',
        'BigInt',
        'Decimal',
        'Json',
        'Bytes',
      ]
      for (const t of allTypes) {
        expect(PRISMA_TO_ARKTYPE[t]).toBeDefined()
        expect(typeof PRISMA_TO_ARKTYPE[t]).toBe('string')
      }
    })

    it('generates schema with multi-line comments', () => {
      const result = makeArktypeProperties(
        [
          {
            documentation: '',
            modelName: 'Payment',
            fieldName: 'amount',
            comment: ['Total amount in cents', 'Integer to avoid floating point issues'],
            validation: '"number"',
            isRequired: true,
          },
        ],
        true,
      )
      expect(result).toBe(`  /**
   * Total amount in cents
   * Integer to avoid floating point issues
   */
  amount: "number",`)
    })

    it('generates schema with empty comment array when comment is true', () => {
      const result = makeArktypeProperties(
        [
          {
            documentation: '',
            modelName: 'Token',
            fieldName: 'value',
            comment: [],
            validation: '"string"',
            isRequired: true,
          },
        ],
        true,
      )
      expect(result).toBe('  value: "string",')
    })

    it('handles multiple models in a single arktype() call', () => {
      const models = [
        {
          name: 'User',
          fields: [{ name: 'id', type: 'String', kind: 'scalar', isRequired: true, isList: false }],
        },
        {
          name: 'Post',
          fields: [
            { name: 'id', type: 'String', kind: 'scalar', isRequired: true, isList: false },
            { name: 'title', type: 'String', kind: 'scalar', isRequired: true, isList: false },
          ],
        },
      ]
      const result = arktype(models, false, false)
      expect(result).toContain('export const UserSchema')
      expect(result).toContain('export const PostSchema')
    })

    it('relation returns null for empty relations', () => {
      expect(makeArktypeRelations({ name: 'Orphan' }, [])).toBeNull()
    })

    it('relation without includeType omits type export', () => {
      const result = makeArktypeRelations({ name: 'User' }, [
        { key: 'posts', targetModel: 'Post', isMany: true },
      ])
      expect(result).not.toContain('export type')
      expect(result).toContain('export const UserRelationsSchema')
    })

    it('uses "unknown" for null validation', () => {
      const result = makeArktypeProperties(
        [
          {
            documentation: '',
            modelName: 'Data',
            fieldName: 'payload',
            comment: [],
            validation: null,
            isRequired: true,
          },
        ],
        false,
      )
      expect(result).toBe('  payload: "unknown",')
    })
  })

  // ============================================================================
  // Session auth pattern
  // ============================================================================

  describe('Session auth pattern', () => {
    it('generates Session schema with DateTime and type', () => {
      const models = [
        {
          name: 'Session',
          fields: [
            { name: 'id', type: 'String', kind: 'scalar', isRequired: true, isList: false },
            { name: 'userId', type: 'String', kind: 'scalar', isRequired: true, isList: false },
            { name: 'token', type: 'String', kind: 'scalar', isRequired: true, isList: false },
            {
              name: 'expiresAt',
              type: 'DateTime',
              kind: 'scalar',
              isRequired: true,
              isList: false,
            },
            { name: 'ipAddress', type: 'String', kind: 'scalar', isRequired: false, isList: false },
          ],
        },
      ]
      const result = arktype(models, true, false)
      expect(result).toBe(`import { type } from 'arktype'

export const SessionSchema = type({
  id: "string",
  userId: "string",
  token: "string",
  expiresAt: "Date",
  ipAddress: "string",
})

export type Session = typeof SessionSchema.infer`)
    })
  })

  describe('makeArktypeSchema strict/loose', () => {
    it('generates type with "+": "reject" for strict', () => {
      expect(makeArktypeSchema('User', '  id: "string"', 'strict')).toBe(
        `export const UserSchema = type({\n  "+": "reject",\n  id: "string"\n})`,
      )
    })

    it('generates type with "+": "ignore" for loose', () => {
      expect(makeArktypeSchema('User', '  id: "string"', 'loose')).toBe(
        `export const UserSchema = type({\n  "+": "ignore",\n  id: "string"\n})`,
      )
    })

    it('generates type without "+" for default', () => {
      expect(makeArktypeSchema('User', '  id: "string"')).toBe(
        `export const UserSchema = type({\n  id: "string"\n})`,
      )
    })
  })
})
