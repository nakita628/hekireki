import { describe, expect, it } from 'vite-plus/test'

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

  // ============================================================================
  // Real-world use case tests
  // ============================================================================

  describe('E-Commerce order pattern', () => {
    it('generates Order schema with comments and nullable field', () => {
      const orderFields = [
        {
          documentation: '',
          modelName: 'Order',
          fieldName: 'id',
          comment: ['Order ID'],
          validation: 'Schema.UUID',
          isRequired: true,
        },
        {
          documentation: '',
          modelName: 'Order',
          fieldName: 'totalAmount',
          comment: ['Total amount in cents'],
          validation: 'Schema.Number',
          isRequired: true,
        },
        {
          documentation: '',
          modelName: 'Order',
          fieldName: 'note',
          comment: ['Customer note', 'Optional memo from customer'],
          validation: 'Schema.NullOr(Schema.String)',
          isRequired: true,
        },
      ]

      const result = makeEffectSchemas(orderFields, true)
      expect(result).toBe(`export const OrderSchema = Schema.Struct({
  /**
   * Order ID
   */
  id: Schema.UUID,
  /**
   * Total amount in cents
   */
  totalAmount: Schema.Number,
  /**
   * Customer note
   * Optional memo from customer
   */
  note: Schema.NullOr(Schema.String),
})`)
    })

    it('generates Order relations with items and customer', () => {
      const result = makeEffectRelations(
        { name: 'Order' },
        [
          { key: 'items', targetModel: 'OrderItem', isMany: true },
          { key: 'customer', targetModel: 'Customer', isMany: false },
        ],
        { includeType: true },
      )
      expect(result).toBe(
        'export const OrderRelationsSchema = Schema.Struct({...OrderSchema.fields,items:Schema.Array(OrderItemSchema),customer:CustomerSchema,})\n\nexport type OrderRelationsEncoded = typeof OrderRelationsSchema.Encoded',
      )
    })

    it('generates full E-Commerce output with enum and type', () => {
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
              documentation: '@e.Schema.UUID',
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

      const result = effect(models, true, false, enums)
      expect(result).toBe(
        "import { Schema } from 'effect'\n\nexport const OrderSchema = Schema.Struct({\n  id: Schema.UUID,\n  status: Schema.Literal('PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'),\n  totalAmount: Schema.Number,\n})\n\nexport type OrderEncoded = typeof OrderSchema.Encoded",
      )
    })
  })

  describe('multi-line comment handling', () => {
    it('generates multi-line JSDoc for detailed field documentation', () => {
      const fields = [
        {
          documentation: '',
          modelName: 'Payment',
          fieldName: 'amount',
          comment: ['Payment amount', 'Stored in smallest currency unit (e.g. cents)'],
          validation: 'Schema.Number',
          isRequired: true,
        },
      ]
      const result = makeEffectProperties(fields, true)
      expect(result).toBe(
        '  /**\n   * Payment amount\n   * Stored in smallest currency unit (e.g. cents)\n   */\n  amount: Schema.Number,',
      )
    })
  })
})
