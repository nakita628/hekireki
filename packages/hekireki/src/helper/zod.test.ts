import { describe, expect, it } from 'vite-plus/test'

import { makeValidationExtractor } from '../utils/index.js'
import { validationSchemas } from '../utils/validation-schema.js'
import {
  makeZodEnumExpression,
  makeZodInfer,
  makeZodRelations,
  makeZodSchema,
  makeZodSchemas,
  PRISMA_TO_ZOD,
  zodSchemaCode,
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
    it.concurrent('schemas', () => {
      const result = makeZodSchemas([
        {
          documentation: '',
          modelName: 'User',
          fieldName: 'id',
          validation: 'uuid()',
          isRequired: true,
        },
        {
          documentation: '',
          modelName: 'User',
          fieldName: 'name',
          validation: 'string().min(1).max(50)',
          isRequired: true,
        },
      ])
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

      const result = zodSchemaCode([model], false)

      expect(result).toBe(
        "import * as z from 'zod'\n\nexport const UserSchema = z.object({\n  id: z.uuid(),\n  name: z.string().min(1)\n})",
      )
    })

    it('uses zod/mini import when zodVersion is mini', () => {
      const model = {
        name: 'Item',
        fields: [{ name: 'id', type: 'Int', kind: 'scalar', isRequired: true, isList: false }],
      }

      const result = zodSchemaCode([model], false, 'mini')

      expect(result).toBe(
        "import * as z from 'zod/mini'\n\nexport const ItemSchema = z.object({\n  id: z.number()\n})",
      )
    })

    it('uses @hono/zod-openapi import when zodVersion matches', () => {
      const model = {
        name: 'Item',
        fields: [{ name: 'id', type: 'Int', kind: 'scalar', isRequired: true, isList: false }],
      }

      const result = zodSchemaCode([model], false, '@hono/zod-openapi')

      expect(result).toBe(
        "import { z } from '@hono/zod-openapi'\n\nexport const ItemSchema = z.object({\n  id: z.number()\n})",
      )
    })

    it('handles enums', () => {
      const model = {
        name: 'User',
        fields: [{ name: 'role', type: 'Role', kind: 'enum', isRequired: true, isList: false }],
      }
      const enums = [{ name: 'Role', values: [{ name: 'ADMIN' }, { name: 'USER' }] }]

      const result = zodSchemaCode([model], false, undefined, enums)

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

  describe('E-Commerce order pattern', () => {
    const orderFields = [
      {
        documentation: '',
        modelName: 'Order',
        fieldName: 'id',
        validation: 'uuid()',
        isRequired: true,
      },
      {
        documentation: '',
        modelName: 'Order',
        fieldName: 'status',
        validation: null,
        isRequired: true,
      },
      {
        documentation: '',
        modelName: 'Order',
        fieldName: 'totalAmount',
        validation: 'number().int().nonnegative()',
        isRequired: true,
      },
      {
        documentation: '',
        modelName: 'Order',
        fieldName: 'note',
        validation: 'string()',
        isRequired: false,
      },
    ]

    it('generates Order schema, enum skipped, optional field', () => {
      const result = makeZodSchemas(orderFields)
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

      const result = zodSchemaCode(models, true, undefined, enums)
      expect(result).toBe(
        "import * as z from 'zod'\n\nexport const OrderSchema = z.object({\n  id: z.uuid(),\n  status: z.enum(['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED']),\n  totalAmount: z.number().int().nonnegative()\n})\n\nexport type Order = z.infer<typeof OrderSchema>",
      )
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

describe('validationSchemas', () => {
  it('should generate validation schemas with type mapping', () => {
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
      },
    ]

    const result = validationSchemas(models, true, {
      importStatement: "import * as z from 'zod'",
      annotationPrefix: '@z.',
      extractValidation: makeValidationExtractor('@z.'),
      inferType: makeZodInfer,
      schemas: makeZodSchemas,
      typeMapping: PRISMA_TO_ZOD,
    })

    expect(result).toBe(
      "import * as z from 'zod'\n\nexport const UserSchema = z.object({\n  id: z.uuid(),\n  name: z.string().min(1)\n})\n\nexport type User = z.infer<typeof UserSchema>",
    )
  })

  it('should generate schemas without type inference when type is false', () => {
    const models = [
      {
        name: 'Post',
        fields: [
          {
            name: 'title',
            type: 'String',
            kind: 'scalar',
            isRequired: true,
            isList: false,
            documentation: '@z.string()',
          },
        ],
      },
    ]

    const result = validationSchemas(models, false, {
      importStatement: "import * as z from 'zod'",
      annotationPrefix: '@z.',
      extractValidation: makeValidationExtractor('@z.'),
      inferType: makeZodInfer,
      schemas: makeZodSchemas,
      typeMapping: PRISMA_TO_ZOD,
    })

    expect(result).toBe(
      "import * as z from 'zod'\n\nexport const PostSchema = z.object({\n  title: z.string()\n})",
    )
  })

  it('should use typeMapping fallback when no annotation is present', () => {
    const models = [
      {
        name: 'Item',
        fields: [{ name: 'count', type: 'Int', kind: 'scalar', isRequired: true, isList: false }],
      },
    ]

    const result = validationSchemas(models, false, {
      importStatement: "import * as z from 'zod'",
      annotationPrefix: '@z.',
      extractValidation: makeValidationExtractor('@z.'),
      inferType: makeZodInfer,
      schemas: makeZodSchemas,
      typeMapping: PRISMA_TO_ZOD,
    })

    expect(result).toBe(
      "import * as z from 'zod'\n\nexport const ItemSchema = z.object({\n  count: z.number()\n})",
    )
  })

  it('should resolve enum fields via formatEnum', () => {
    const models = [
      {
        name: 'User',
        fields: [
          {
            name: 'role',
            type: 'Role',
            kind: 'enum',
            isRequired: true,
            isList: false,
          },
        ],
      },
    ]

    const enums = [{ name: 'Role', values: [{ name: 'ADMIN' }, { name: 'USER' }] }]

    const result = validationSchemas(models, false, {
      importStatement: "import * as z from 'zod'",
      annotationPrefix: '@z.',
      extractValidation: makeValidationExtractor('@z.'),
      inferType: makeZodInfer,
      schemas: makeZodSchemas,
      typeMapping: PRISMA_TO_ZOD,
      enums,
      formatEnum: (values) => `enum([${values.map((v) => `'${v}'`).join(', ')}])`,
    })

    expect(result).toBe(
      "import * as z from 'zod'\n\nexport const UserSchema = z.object({\n  role: z.enum(['ADMIN', 'USER'])\n})",
    )
  })

  it('should call onWarning for fields with no annotation or typeMapping', () => {
    const warnings: string[] = []
    const models = [
      {
        name: 'User',
        fields: [
          {
            name: 'mystery',
            type: 'CustomType',
            kind: 'scalar',
            isRequired: true,
            isList: false,
          },
        ],
      },
    ]

    validationSchemas(models, false, {
      importStatement: '',
      annotationPrefix: '@z.',
      extractValidation: makeValidationExtractor('@z.'),
      inferType: makeZodInfer,
      schemas: makeZodSchemas,
      onWarning: (msg) => {
        warnings.push(msg)
      },
    })

    expect(warnings).toStrictEqual([
      'Warning: Field "User.mystery" has no @z. annotation and will be omitted from the schema',
    ])
  })

  it('should not call onWarning when all fields have annotations', () => {
    const warnings: string[] = []
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
            documentation: '@z.uuid()',
          },
        ],
      },
    ]

    validationSchemas(models, false, {
      importStatement: "import * as z from 'zod'",
      annotationPrefix: '@z.',
      extractValidation: makeValidationExtractor('@z.'),
      inferType: makeZodInfer,
      schemas: makeZodSchemas,
      onWarning: (msg) => {
        warnings.push(msg)
      },
    })

    expect(warnings).toStrictEqual([])
  })
})
