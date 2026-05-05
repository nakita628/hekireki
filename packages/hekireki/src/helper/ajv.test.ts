import { describe, expect, it } from 'vite-plus/test'

import {
  ajvSchemaCode,
  makeAjvEnumExpression,
  makeAjvInfer,
  makeAjvRelations,
  makeAjvSchemas,
  PRISMA_TO_AJV,
} from './ajv.js'

describe('helper/ajv', () => {
  describe('PRISMA_TO_AJV', () => {
    it('maps Prisma types to JSON Schema types', () => {
      expect(PRISMA_TO_AJV.String).toBe("{ type: 'string' as const }")
      expect(PRISMA_TO_AJV.Int).toBe("{ type: 'integer' as const }")
      expect(PRISMA_TO_AJV.Float).toBe("{ type: 'number' as const }")
      expect(PRISMA_TO_AJV.Boolean).toBe("{ type: 'boolean' as const }")
      expect(PRISMA_TO_AJV.DateTime).toBe(
        "{ type: 'string' as const, format: 'date-time' as const }",
      )
      expect(PRISMA_TO_AJV.BigInt).toBe("{ type: 'integer' as const }")
      expect(PRISMA_TO_AJV.Decimal).toBe("{ type: 'number' as const }")
      expect(PRISMA_TO_AJV.Json).toBe('{}')
      expect(PRISMA_TO_AJV.Bytes).toBe("{ type: 'string' as const }")
    })
  })

  describe('makeAjvSchemas', () => {
    it.concurrent('schemas comment true', () => {
      const result = makeAjvSchemas(
        [
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'id',
            comment: ['Primary key'],
            validation: "{ type: 'string' as const }",
            isRequired: true,
          },
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'name',
            comment: ['Display name'],
            validation: "{ type: 'string' as const }",
            isRequired: true,
          },
        ],
        true,
      )
      const expected = `export const UserSchema = {
  type: 'object' as const,
  properties: {
    /**
     * Primary key
     */
    id: { type: 'string' as const },
    /**
     * Display name
     */
    name: { type: 'string' as const },
  },
  required: ['id', 'name'] as const,
  additionalProperties: false,
} as const`
      expect(result).toBe(expected)
    })

    it.concurrent('schemas comment false', () => {
      const result = makeAjvSchemas(
        [
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'id',
            comment: ['Primary key'],
            validation: "{ type: 'string' as const }",
            isRequired: true,
          },
        ],
        false,
      )
      const expected = `export const UserSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const },
  },
  required: ['id'] as const,
  additionalProperties: false,
} as const`
      expect(result).toBe(expected)
    })

    it.concurrent('includes required array only for required fields', () => {
      const result = makeAjvSchemas(
        [
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'id',
            comment: [],
            validation: "{ type: 'string' as const }",
            isRequired: true,
          },
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'email',
            comment: [],
            validation: "{ type: 'string' as const }",
            isRequired: false,
          },
        ],
        false,
      )
      const expected = `export const UserSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const },
    email: { type: 'string' as const },
  },
  required: ['id'] as const,
  additionalProperties: false,
} as const`
      expect(result).toBe(expected)
    })

    it.concurrent('no required line when all fields are optional', () => {
      const result = makeAjvSchemas(
        [
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'email',
            comment: [],
            validation: "{ type: 'string' as const }",
            isRequired: false,
          },
        ],
        false,
      )
      const expected = `export const UserSchema = {
  type: 'object' as const,
  properties: {
    email: { type: 'string' as const },
  },
  additionalProperties: false,
} as const`
      expect(result).toBe(expected)
    })
  })

  describe('makeAjvRelations', () => {
    it('returns null when no relations', () => {
      const result = makeAjvRelations({ name: 'User' }, [])
      expect(result).toBeNull()
    })

    it('generates relation schema with spread and relation fields', () => {
      const relProps = [
        { key: 'posts', targetModel: 'Post', isMany: true },
        { key: 'profile', targetModel: 'Profile', isMany: false },
      ]

      const result = makeAjvRelations({ name: 'User' }, relProps)

      const expected = `export const UserRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...UserSchema.properties,
    posts: { type: 'array' as const, items: PostSchema },
    profile: ProfileSchema,
  },
  additionalProperties: false,
} as const`
      expect(result).toBe(expected)
    })

    it('includes type export when includeType is true', () => {
      const relProps = [{ key: 'posts', targetModel: 'Post', isMany: true }]

      const result = makeAjvRelations({ name: 'User' }, relProps, { includeType: true })

      const expected = `export const UserRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...UserSchema.properties,
    posts: { type: 'array' as const, items: PostSchema },
  },
  additionalProperties: false,
} as const

export type UserRelations = FromSchema<typeof UserRelationsSchema>`
      expect(result).toBe(expected)
    })
  })

  describe('ajv', () => {
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
            documentation: "@j.{ type: 'string' as const, format: 'uuid' as const }",
          },
          {
            name: 'name',
            type: 'String',
            kind: 'scalar',
            isRequired: true,
            isList: false,
          },
        ],
      }

      const result = ajvSchemaCode([model], false, false)

      const expected = `export const UserSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const, format: 'uuid' as const },
    name: { type: 'string' as const },
  },
  required: ['id', 'name'] as const,
  additionalProperties: false,
} as const`
      expect(result).toBe(expected)
    })

    it('falls back to type mapping when no annotation', () => {
      const model = {
        name: 'Item',
        fields: [
          { name: 'id', type: 'Int', kind: 'scalar', isRequired: true, isList: false },
          { name: 'name', type: 'String', kind: 'scalar', isRequired: true, isList: false },
        ],
      }

      const result = ajvSchemaCode([model], false, false)

      const expected = `export const ItemSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'integer' as const },
    name: { type: 'string' as const },
  },
  required: ['id', 'name'] as const,
  additionalProperties: false,
} as const`
      expect(result).toBe(expected)
    })

    it('generates type inference when type is true', () => {
      const model = {
        name: 'User',
        fields: [{ name: 'id', type: 'String', kind: 'scalar', isRequired: true, isList: false }],
      }

      const result = ajvSchemaCode([model], true, false)

      const expected = `import type { FromSchema } from 'json-schema-to-ts'

export const UserSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const },
  },
  required: ['id'] as const,
  additionalProperties: false,
} as const

export type User = FromSchema<typeof UserSchema>`
      expect(result).toBe(expected)
    })
  })

  describe('makeAjvInfer', () => {
    it('generates AJV FromSchema infer type', () => {
      expect(makeAjvInfer('User')).toBe('export type User = FromSchema<typeof UserSchema>')
    })
  })

  describe('makeAjvEnumExpression', () => {
    it('generates JSON Schema enum', () => {
      expect(makeAjvEnumExpression(['USER', 'ADMIN'])).toBe("{ enum: ['USER', 'ADMIN'] as const }")
    })
    it('handles single value', () => {
      expect(makeAjvEnumExpression(['ACTIVE'])).toBe("{ enum: ['ACTIVE'] as const }")
    })
  })

  // ============================================================================
  // Real-world use case tests
  // ============================================================================

  describe('E-Commerce order pattern', () => {
    it('generates Order JSON Schema with enum and type', () => {
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
              documentation: "@j.{ type: 'string' as const, format: 'uuid' as const }",
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
      const result = ajvSchemaCode(models, true, false, enums)
      expect(result).toBe(`import type { FromSchema } from 'json-schema-to-ts'

export const OrderSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const, format: 'uuid' as const },
    status: { enum: ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'] as const },
    totalAmount: { type: 'integer' as const },
  },
  required: ['id', 'status', 'totalAmount'] as const,
  additionalProperties: false,
} as const

export type Order = FromSchema<typeof OrderSchema>`)
    })

    it('generates Order schema with mixed required/optional fields', () => {
      const result = makeAjvSchemas(
        [
          {
            documentation: '',
            modelName: 'Order',
            fieldName: 'id',
            comment: ['Order ID'],
            validation: "{ type: 'string' as const, format: 'uuid' as const }",
            isRequired: true,
          },
          {
            documentation: '',
            modelName: 'Order',
            fieldName: 'totalAmount',
            comment: ['Total amount in cents'],
            validation: "{ type: 'integer' as const }",
            isRequired: true,
          },
          {
            documentation: '',
            modelName: 'Order',
            fieldName: 'note',
            comment: ['Customer note'],
            validation: "{ type: 'string' as const }",
            isRequired: false,
          },
        ],
        true,
      )
      expect(result).toBe(`export const OrderSchema = {
  type: 'object' as const,
  properties: {
    /**
     * Order ID
     */
    id: { type: 'string' as const, format: 'uuid' as const },
    /**
     * Total amount in cents
     */
    totalAmount: { type: 'integer' as const },
    /**
     * Customer note
     */
    note: { type: 'string' as const },
  },
  required: ['id', 'totalAmount'] as const,
  additionalProperties: false,
} as const`)
    })

    it('generates Order relations', () => {
      const result = makeAjvRelations(
        { name: 'Order' },
        [
          { key: 'items', targetModel: 'OrderItem', isMany: true },
          { key: 'customer', targetModel: 'Customer', isMany: false },
        ],
        { includeType: true },
      )
      expect(result).toBe(`export const OrderRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...OrderSchema.properties,
    items: { type: 'array' as const, items: OrderItemSchema },
    customer: CustomerSchema,
  },
  additionalProperties: false,
} as const

export type OrderRelations = FromSchema<typeof OrderRelationsSchema>`)
    })
  })

  describe('multi-value enum', () => {
    it('generates enum with 5 values', () => {
      expect(
        makeAjvEnumExpression(['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
      ).toBe("{ enum: ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'] as const }")
    })
  })

  // ============================================================================
  // Edge case tests
  // ============================================================================

  describe('edge cases', () => {
    it('all Prisma scalar types produce valid JSON Schema', () => {
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
        expect(PRISMA_TO_AJV[t]).toBeDefined()
        expect(typeof PRISMA_TO_AJV[t]).toBe('string')
      }
    })

    it('generates schema with all optional fields (no required array)', () => {
      const result = makeAjvSchemas(
        [
          {
            documentation: '',
            modelName: 'Session',
            fieldName: 'token',
            comment: [],
            validation: "{ type: 'string' as const }",
            isRequired: false,
          },
          {
            documentation: '',
            modelName: 'Session',
            fieldName: 'expiresAt',
            comment: [],
            validation: "{ type: 'string' as const, format: 'date-time' as const }",
            isRequired: false,
          },
        ],
        false,
      )
      expect(result).toBe(`export const SessionSchema = {
  type: 'object' as const,
  properties: {
    token: { type: 'string' as const },
    expiresAt: { type: 'string' as const, format: 'date-time' as const },
  },
  additionalProperties: false,
} as const`)
    })

    it('generates schema with multi-line comments', () => {
      const result = makeAjvSchemas(
        [
          {
            documentation: '',
            modelName: 'Payment',
            fieldName: 'amount',
            comment: ['Total amount in cents', 'Integer to avoid floating point issues'],
            validation: "{ type: 'integer' as const }",
            isRequired: true,
          },
        ],
        true,
      )
      expect(result).toBe(`export const PaymentSchema = {
  type: 'object' as const,
  properties: {
    /**
     * Total amount in cents
     * Integer to avoid floating point issues
     */
    amount: { type: 'integer' as const },
  },
  required: ['amount'] as const,
  additionalProperties: false,
} as const`)
    })

    it('generates schema with empty comment array when comment is true', () => {
      const result = makeAjvSchemas(
        [
          {
            documentation: '',
            modelName: 'Token',
            fieldName: 'value',
            comment: [],
            validation: "{ type: 'string' as const }",
            isRequired: true,
          },
        ],
        true,
      )
      expect(result).toBe(`export const TokenSchema = {
  type: 'object' as const,
  properties: {
    value: { type: 'string' as const },
  },
  required: ['value'] as const,
  additionalProperties: false,
} as const`)
    })

    it('handles multiple models in a single ajv() call', () => {
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
      const result = ajvSchemaCode(models, false, false)
      expect(result).toContain('export const UserSchema')
      expect(result).toContain('export const PostSchema')
    })

    it('relation returns null for empty relations', () => {
      expect(makeAjvRelations({ name: 'Orphan' }, [])).toBeNull()
    })

    it('relation without includeType omits type export', () => {
      const result = makeAjvRelations({ name: 'User' }, [
        { key: 'posts', targetModel: 'Post', isMany: true },
      ])
      expect(result).not.toContain('export type')
      expect(result).toContain('export const UserRelationsSchema')
    })
  })

  // ============================================================================
  // Session auth pattern
  // ============================================================================

  describe('Session auth pattern', () => {
    it('generates Session schema with mixed required/optional and DateTime', () => {
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
      const result = ajvSchemaCode(models, true, false)
      expect(result).toBe(`import type { FromSchema } from 'json-schema-to-ts'

export const SessionSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const },
    userId: { type: 'string' as const },
    token: { type: 'string' as const },
    expiresAt: { type: 'string' as const, format: 'date-time' as const },
    ipAddress: { type: 'string' as const },
  },
  required: ['id', 'userId', 'token', 'expiresAt'] as const,
  additionalProperties: false,
} as const

export type Session = FromSchema<typeof SessionSchema>`)
    })
  })
})
