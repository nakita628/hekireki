import { describe, expect, it } from 'vite-plus/test'

import {
  makeValibotEnumExpression,
  makeValibotInfer,
  makeValibotRelations,
  makeValibotSchema,
  makeValibotSchemas,
  PRISMA_TO_VALIBOT,
  valibot,
} from './valibot.js'

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

  describe('makeValibotRelations', () => {
    it('returns null when no relations', () => {
      const result = makeValibotRelations({ name: 'User' }, [])
      expect(result).toBeNull()
    })

    it('generates relation schema with spread and relation fields', () => {
      const relProps = [
        { key: 'posts', targetModel: 'Post', isMany: true },
        { key: 'profile', targetModel: 'Profile', isMany: false },
      ]

      const result = makeValibotRelations({ name: 'User' }, relProps)

      expect(result).toBe(
        'export const UserRelationsSchema = v.object({\n  ...UserSchema.entries,\n  posts: v.array(PostSchema),\n  profile: ProfileSchema,\n})',
      )
    })

    it('includes type export when includeType is true', () => {
      const relProps = [{ key: 'posts', targetModel: 'Post', isMany: true }]

      const result = makeValibotRelations({ name: 'User' }, relProps, { includeType: true })

      expect(result).toBe(
        'export const UserRelationsSchema = v.object({\n  ...UserSchema.entries,\n  posts: v.array(PostSchema),\n})\n\nexport type UserRelations = v.InferOutput<typeof UserRelationsSchema>',
      )
    })
  })

  describe('valibot', () => {
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
            documentation: '@v.pipe(v.string(), v.uuid())',
          },
          {
            name: 'name',
            type: 'String',
            kind: 'scalar',
            isRequired: true,
            isList: false,
            documentation: '@v.pipe(v.string(), v.minLength(1))',
          },
        ],
      }

      const result = valibot([model], false, false)

      expect(result).toBe(
        "import * as v from 'valibot'\n\nexport const UserSchema = v.object({\n  id: v.pipe(v.string(), v.uuid()),\n  name: v.pipe(v.string(), v.minLength(1))\n})",
      )
    })

    it('includes type inference when type is true', () => {
      const model = {
        name: 'Item',
        fields: [{ name: 'id', type: 'Int', kind: 'scalar', isRequired: true, isList: false }],
      }

      const result = valibot([model], true, false)

      expect(result).toBe(
        "import * as v from 'valibot'\n\nexport const ItemSchema = v.object({\n  id: v.number()\n})\n\nexport type Item = v.InferOutput<typeof ItemSchema>",
      )
    })

    it('generates with comment true and type true', () => {
      const model = {
        name: 'User',
        fields: [
          {
            name: 'id',
            type: 'String',
            kind: 'scalar',
            isRequired: true,
            isList: false,
            documentation: 'Primary key\n@v.pipe(v.string(), v.uuid())',
          },
        ],
      }

      const result = valibot([model], true, true)

      expect(result).toBe(
        "import * as v from 'valibot'\n\nexport const UserSchema = v.object({\n  /**\n   * Primary key\n   */\n  id: v.pipe(v.string(), v.uuid())\n})\n\nexport type User = v.InferOutput<typeof UserSchema>",
      )
    })

    it('handles enums', () => {
      const model = {
        name: 'User',
        fields: [{ name: 'role', type: 'Role', kind: 'enum', isRequired: true, isList: false }],
      }
      const enums = [{ name: 'Role', values: [{ name: 'ADMIN' }, { name: 'USER' }] }]

      const result = valibot([model], false, false, enums)

      expect(result).toBe(
        "import * as v from 'valibot'\n\nexport const UserSchema = v.object({\n  role: v.picklist(['ADMIN', 'USER'])\n})",
      )
    })
  })

  describe('makeValibotInfer', () => {
    it('generates Valibot infer type', () => {
      expect(makeValibotInfer('User')).toBe('export type User = v.InferOutput<typeof UserSchema>')
    })
  })

  describe('makeValibotSchema', () => {
    it('generates schema with fields', () => {
      const result = makeValibotSchema('User', '  id: v.string(),\n  name: v.string()')
      expect(result).toBe(
        'export const UserSchema = v.object({\n  id: v.string(),\n  name: v.string()\n})',
      )
    })
  })

  describe('makeValibotEnumExpression', () => {
    it('generates v.picklist()', () => {
      expect(makeValibotEnumExpression(['USER', 'ADMIN'])).toBe("picklist(['USER', 'ADMIN'])")
    })
    it('handles single value', () => {
      expect(makeValibotEnumExpression(['ACTIVE'])).toBe("picklist(['ACTIVE'])")
    })
  })

  // ============================================================================
  // Real-world use case tests
  // ============================================================================

  describe('E-Commerce order pattern', () => {
    const orderFields = [
      {
        documentation: '',
        modelName: 'Order',
        fieldName: 'id',
        comment: ['Order ID'],
        validation: 'pipe(v.string(), v.uuid())',
        isRequired: true,
      },
      {
        documentation: '',
        modelName: 'Order',
        fieldName: 'status',
        comment: ['Order status'],
        validation: null,
        isRequired: true,
      },
      {
        documentation: '',
        modelName: 'Order',
        fieldName: 'totalAmount',
        comment: ['Total amount in cents'],
        validation: 'pipe(v.number(), v.integer(), v.minValue(0))',
        isRequired: true,
      },
      {
        documentation: '',
        modelName: 'Order',
        fieldName: 'note',
        comment: ['Customer note', 'Optional memo from customer'],
        validation: 'string()',
        isRequired: false,
      },
    ]

    it('generates Order schema with comments, enum skipped, optional field', () => {
      const result = makeValibotSchemas(orderFields, true)
      expect(result).toBe(`export const OrderSchema = v.object({
  /**
   * Order ID
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * Total amount in cents
   */
  totalAmount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  /**
   * Customer note
   * Optional memo from customer
   */
  note: v.exactOptional(v.string())
})`)
    })

    it('generates Order schema without comments', () => {
      const result = makeValibotSchemas(orderFields, false)
      expect(result).toBe(`export const OrderSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
  totalAmount: v.pipe(v.number(), v.integer(), v.minValue(0)),
  note: v.exactOptional(v.string())
})`)
    })

    it('generates Order relations with items and customer', () => {
      const result = makeValibotRelations(
        { name: 'Order' },
        [
          { key: 'items', targetModel: 'OrderItem', isMany: true },
          { key: 'customer', targetModel: 'Customer', isMany: false },
        ],
        { includeType: true },
      )
      expect(result).toBe(
        'export const OrderRelationsSchema = v.object({\n  ...OrderSchema.entries,\n  items: v.array(OrderItemSchema),\n  customer: CustomerSchema,\n})\n\nexport type OrderRelations = v.InferOutput<typeof OrderRelationsSchema>',
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
              documentation: '@v.pipe(v.string(), v.uuid())',
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
              documentation: '@v.pipe(v.number(), v.integer(), v.minValue(0))',
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

      const result = valibot(models, true, false, enums)
      expect(result).toBe(
        "import * as v from 'valibot'\n\nexport const OrderSchema = v.object({\n  id: v.pipe(v.string(), v.uuid()),\n  status: v.picklist(['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED']),\n  totalAmount: v.pipe(v.number(), v.integer(), v.minValue(0))\n})\n\nexport type Order = v.InferOutput<typeof OrderSchema>",
      )
    })
  })

  describe('multi-line comment handling', () => {
    it('filters annotation lines from comments', () => {
      const fields = [
        {
          documentation: '',
          modelName: 'Payment',
          fieldName: 'amount',
          comment: [
            'Payment amount',
            'Stored in smallest currency unit (e.g. cents)',
            '@v.number()',
          ],
          validation: 'number()',
          isRequired: true,
        },
      ]
      const result = makeValibotSchemas(fields, true)
      expect(result).toBe(`export const PaymentSchema = v.object({
  /**
   * Payment amount
   * Stored in smallest currency unit (e.g. cents)
   */
  amount: v.number()
})`)
    })
  })

  describe('makeValibotSchema strict/loose', () => {
    it('generates v.strictObject', () => {
      expect(makeValibotSchema('User', '  id: v.string()', 'strict')).toBe(
        `export const UserSchema = v.strictObject({\n  id: v.string()\n})`,
      )
    })

    it('generates v.looseObject', () => {
      expect(makeValibotSchema('User', '  id: v.string()', 'loose')).toBe(
        `export const UserSchema = v.looseObject({\n  id: v.string()\n})`,
      )
    })

    it('generates v.object by default', () => {
      expect(makeValibotSchema('User', '  id: v.string()')).toBe(
        `export const UserSchema = v.object({\n  id: v.string()\n})`,
      )
    })
  })
})
