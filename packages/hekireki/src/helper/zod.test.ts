import { describe, expect, it } from 'vitest'

import {
  makeZodEnumExpression,
  makeZodInfer,
  makeZodRelations,
  makeZodSchema,
  makeZodSchemas,
  PRISMA_TO_ZOD,
  zod,
} from './zod.js'

describe('helper/zod', () => {
  describe('PRISMA_TO_ZOD', () => {
    it('PRISMA_TO_ZOD maps String to string()', () => {
      expect(PRISMA_TO_ZOD.String).toBe('string()')
      expect(PRISMA_TO_ZOD.Int).toBe('number()')
      expect(PRISMA_TO_ZOD.Boolean).toBe('boolean()')
      expect(PRISMA_TO_ZOD.DateTime).toBe('iso.datetime()')
      expect(PRISMA_TO_ZOD.BigInt).toBe('bigint()')
    })
  })

  describe('makeZodSchemas', () => {
    it.concurrent('schemas comment true', () => {
      const result = makeZodSchemas(
        [
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'id',
            comment: ['Primary key', '@v.pipe(v.string(), v.uuid())'],
            validation: 'uuid()',
            isRequired: true,
          },
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'name',
            comment: ['Display name', '@v.pipe(v.string(), v.minLength(1), v.maxLength(50))'],
            validation: 'string().min(1).max(50)',
            isRequired: true,
          },
        ],
        true,
      )
      const expected = `export const UserSchema = z.object({
  /**
   * Primary key
   */
  id: z.uuid(),
  /**
   * Display name
   */
  name: z.string().min(1).max(50)
})`
      expect(result).toBe(expected)
    })
    it.concurrent('schemas comment false', () => {
      const result = makeZodSchemas(
        [
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'id',
            comment: ['Primary key', '@v.pipe(v.string(), v.uuid())'],
            validation: 'uuid()',
            isRequired: true,
          },
          {
            documentation: '',
            modelName: 'User',
            fieldName: 'name',
            comment: ['Display name', '@v.pipe(v.string(), v.minLength(1), v.maxLength(50))'],
            validation: 'string().min(1).max(50)',
            isRequired: true,
          },
        ],
        false,
      )
      const expected = `export const UserSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(50)
})`
      expect(result).toBe(expected)
    })
  })

  describe('makeZodRelations', () => {
    it('returns null when no relations', () => {
      const result = makeZodRelations({ name: 'User' }, [])
      expect(result).toBeNull()
    })

    it('generates relation schema with spread and relation fields', () => {
      const relProps = [
        { key: 'posts', targetModel: 'Post', isMany: true },
        { key: 'profile', targetModel: 'Profile', isMany: false },
      ]

      const result = makeZodRelations({ name: 'User' }, relProps)

      expect(result).toBe(
        'export const UserRelationsSchema = z.object({\n  ...UserSchema.shape,\n  posts: z.array(PostSchema),\n  profile: ProfileSchema,\n})',
      )
    })

    it('includes type export when includeType is true', () => {
      const relProps = [{ key: 'posts', targetModel: 'Post', isMany: true }]

      const result = makeZodRelations({ name: 'User' }, relProps, { includeType: true })

      expect(result).toBe(
        'export const UserRelationsSchema = z.object({\n  ...UserSchema.shape,\n  posts: z.array(PostSchema),\n})\n\nexport type UserRelations = z.infer<typeof UserRelationsSchema>',
      )
    })
  })

  describe('zod', () => {
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
            documentation: '@z.uuid()',
          },
          {
            name: 'name',
            type: 'String',
            kind: 'scalar',
            isRequired: true,
            isList: false,
            documentation: '@z.string().min(1)',
          },
        ],
      }

      const result = zod([model], false, false)

      expect(result).toBe(
        "import * as z from 'zod'\n\nexport const UserSchema = z.object({\n  id: z.uuid(),\n  name: z.string().min(1)\n})",
      )
    })

    it('uses zod/mini import when zodVersion is mini', () => {
      const model = {
        name: 'Item',
        fields: [{ name: 'id', type: 'Int', kind: 'scalar', isRequired: true, isList: false }],
      }

      const result = zod([model], false, false, 'mini')

      expect(result).toBe(
        "import * as z from 'zod/mini'\n\nexport const ItemSchema = z.object({\n  id: z.number()\n})",
      )
    })

    it('uses @hono/zod-openapi import when zodVersion matches', () => {
      const model = {
        name: 'Item',
        fields: [{ name: 'id', type: 'Int', kind: 'scalar', isRequired: true, isList: false }],
      }

      const result = zod([model], false, false, '@hono/zod-openapi')

      expect(result).toBe(
        "import { z } from '@hono/zod-openapi'\n\nexport const ItemSchema = z.object({\n  id: z.number()\n})",
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
            documentation: 'Primary key\n@z.uuid()',
          },
        ],
      }

      const result = zod([model], true, true)

      expect(result).toBe(
        "import * as z from 'zod'\n\nexport const UserSchema = z.object({\n  /**\n   * Primary key\n   */\n  id: z.uuid()\n})\n\nexport type User = z.infer<typeof UserSchema>",
      )
    })

    it('handles enums', () => {
      const model = {
        name: 'User',
        fields: [{ name: 'role', type: 'Role', kind: 'enum', isRequired: true, isList: false }],
      }
      const enums = [{ name: 'Role', values: [{ name: 'ADMIN' }, { name: 'USER' }] }]

      const result = zod([model], false, false, undefined, enums)

      expect(result).toBe(
        "import * as z from 'zod'\n\nexport const UserSchema = z.object({\n  role: z.enum(['ADMIN', 'USER'])\n})",
      )
    })
  })

  describe('makeZodInfer', () => {
    it('generates Zod infer type', () => {
      expect(makeZodInfer('User')).toBe('export type User = z.infer<typeof UserSchema>')
    })
  })

  describe('makeZodSchema', () => {
    it('generates schema with fields', () => {
      const result = makeZodSchema('Post', '  id: z.uuid(),\n  title: z.string()')
      expect(result).toBe(
        'export const PostSchema = z.object({\n  id: z.uuid(),\n  title: z.string()\n})',
      )
    })
  })

  describe('makeZodEnumExpression', () => {
    it('generates z.enum()', () => {
      expect(makeZodEnumExpression(['USER', 'ADMIN'])).toBe("enum(['USER', 'ADMIN'])")
    })
    it('handles single value', () => {
      expect(makeZodEnumExpression(['ACTIVE'])).toBe("enum(['ACTIVE'])")
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
        validation: 'uuid()',
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
        validation: 'number().int().nonnegative()',
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
      const result = makeZodSchemas(orderFields, true)
      expect(result).toBe(`export const OrderSchema = z.object({
  /**
   * Order ID
   */
  id: z.uuid(),
  /**
   * Total amount in cents
   */
  totalAmount: z.number().int().nonnegative(),
  /**
   * Customer note
   * Optional memo from customer
   */
  note: z.string().exactOptional()
})`)
    })

    it('generates Order schema without comments', () => {
      const result = makeZodSchemas(orderFields, false)
      expect(result).toBe(`export const OrderSchema = z.object({
  id: z.uuid(),
  totalAmount: z.number().int().nonnegative(),
  note: z.string().exactOptional()
})`)
    })

    it('generates Order relations with items and customer', () => {
      const result = makeZodRelations(
        { name: 'Order' },
        [
          { key: 'items', targetModel: 'OrderItem', isMany: true },
          { key: 'customer', targetModel: 'Customer', isMany: false },
        ],
        { includeType: true },
      )
      expect(result).toBe(
        'export const OrderRelationsSchema = z.object({\n  ...OrderSchema.shape,\n  items: z.array(OrderItemSchema),\n  customer: CustomerSchema,\n})\n\nexport type OrderRelations = z.infer<typeof OrderRelationsSchema>',
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
              documentation: '@z.uuid()',
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
              documentation: '@z.number().int().nonnegative()',
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

      const result = zod(models, true, false, undefined, enums)
      expect(result).toBe(
        "import * as z from 'zod'\n\nexport const OrderSchema = z.object({\n  id: z.uuid(),\n  status: z.enum(['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED']),\n  totalAmount: z.number().int().nonnegative()\n})\n\nexport type Order = z.infer<typeof OrderSchema>",
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
            '@z.number()',
          ],
          validation: 'number()',
          isRequired: true,
        },
      ]
      const result = makeZodSchemas(fields, true)
      expect(result).toBe(`export const PaymentSchema = z.object({
  /**
   * Payment amount
   * Stored in smallest currency unit (e.g. cents)
   */
  amount: z.number()
})`)
    })
  })

  describe('makeZodSchema strict/loose', () => {
    it('generates z.strictObject', () => {
      expect(makeZodSchema('User', '  id: z.string()', 'strict')).toBe(
        `export const UserSchema = z.strictObject({\n  id: z.string()\n})`,
      )
    })

    it('generates z.looseObject', () => {
      expect(makeZodSchema('User', '  id: z.string()', 'loose')).toBe(
        `export const UserSchema = z.looseObject({\n  id: z.string()\n})`,
      )
    })

    it('generates z.object by default', () => {
      expect(makeZodSchema('User', '  id: z.string()')).toBe(
        `export const UserSchema = z.object({\n  id: z.string()\n})`,
      )
    })
  })
})
