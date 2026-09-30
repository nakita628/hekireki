import { describe, expect, it } from 'vite-plus/test'

import {
  effectSchemaCode,
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
    it('generates schema', () => {
      const result = makeEffectSchemas([
        {
          documentation: '',
          modelName: 'User',
          fieldName: 'id',
          validation: 'Schema.String',
          isRequired: true,
        },
        {
          documentation: '',
          modelName: 'User',
          fieldName: 'age',
          validation: 'Schema.Number',
          isRequired: true,
        },
      ])
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
        'export const UserRelationsSchema = Schema.Struct({...UserSchema.fields,posts:Schema.Array(PostSchema),})\n\nexport type UserRelations = typeof UserRelationsSchema.Type',
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
      const result = effectSchemaCode(models, false)
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
      const result = effectSchemaCode(models, true)
      expect(result).toBe(
        "import { Schema } from 'effect'\n\nexport const PostSchema = Schema.Struct({\n  title: Schema.String,\n})\n\nexport type Post = typeof PostSchema.Type",
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
      const result = effectSchemaCode(models, false, enums)
      expect(result).toBe(
        "import { Schema } from 'effect'\n\nexport const UserSchema = Schema.Struct({\n  role: Schema.Literal('ADMIN', 'USER'),\n})",
      )
    })
  })

  describe('makeEffectInfer', () => {
    it('generates Effect infer type', () => {
      expect(makeEffectInfer('User')).toBe('export type User = typeof UserSchema.Type')
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
      },
    ]
    it('generates properties', () => {
      expect(makeEffectProperties(fields)).toBe('  id: Schema.String,')
    })
    it('uses Schema.Unknown for null validation', () => {
      const nullFields = [{ ...fields[0], validation: null }]
      expect(makeEffectProperties(nullFields)).toBe('  id: Schema.Unknown,')
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

  describe('E-Commerce order pattern', () => {
    it('generates Order schema with a nullable field', () => {
      const orderFields = [
        {
          documentation: '',
          modelName: 'Order',
          fieldName: 'id',
          validation: 'Schema.UUID',
          isRequired: true,
        },
        {
          documentation: '',
          modelName: 'Order',
          fieldName: 'totalAmount',
          validation: 'Schema.Number',
          isRequired: true,
        },
        {
          documentation: '',
          modelName: 'Order',
          fieldName: 'note',
          validation: 'Schema.NullOr(Schema.String)',
          isRequired: true,
        },
      ]

      const result = makeEffectSchemas(orderFields)
      expect(result).toBe(`export const OrderSchema = Schema.Struct({
  id: Schema.UUID,
  totalAmount: Schema.Number,
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
        'export const OrderRelationsSchema = Schema.Struct({...OrderSchema.fields,items:Schema.Array(OrderItemSchema),customer:CustomerSchema,})\n\nexport type OrderRelations = typeof OrderRelationsSchema.Type',
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

      const result = effectSchemaCode(models, true, enums)
      expect(result).toBe(
        "import { Schema } from 'effect'\n\nexport const OrderSchema = Schema.Struct({\n  id: Schema.UUID,\n  status: Schema.Literal('PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'),\n  totalAmount: Schema.Number,\n})\n\nexport type Order = typeof OrderSchema.Type",
      )
    })
  })
})
