import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vitest'

import {
  erContent,
  extractRelations,
  extractRelationsFromDmmf,
  isRelationshipType,
  makeRelationLine,
  makeRelationLineFromRelation,
  modelFields,
  modelInfo,
  parseRelation,
  removeDuplicateRelations,
} from './mermaid-er.js'

function makeModel(overrides: Partial<DMMF.Model> & { name: string }): DMMF.Model {
  return {
    dbName: null,
    fields: [],
    uniqueFields: [],
    uniqueIndexes: [],
    primaryKey: null,
    isGenerated: false,
    schema: null,
    ...overrides,
  }
}

function makeField(overrides: Partial<DMMF.Field> & { name: string; type: string }): DMMF.Field {
  return {
    kind: 'scalar',
    isList: false,
    isRequired: true,
    isUnique: false,
    isId: false,
    isReadOnly: false,
    isGenerated: false,
    isUpdatedAt: false,
    hasDefaultValue: false,
    ...overrides,
  }
}

describe('helper/mermaid-er', () => {
  describe('makeRelationLine', () => {
    const testCases = [
      { input: 'zero-one-to-zero-one', expected: '|o--|o' },
      { input: 'zero-one-to-one', expected: '|o--||' },
      { input: 'zero-one-to-zero-many', expected: '|o--}o' },
      { input: 'zero-one-to-many', expected: '|o--}|' },
      { input: 'zero-one-to-zero-one-optional', expected: '|o..|o' },
      { input: 'zero-one-to-one-optional', expected: '|o..||' },
      { input: 'one-to-zero-one', expected: '||--|o' },
      { input: 'one-to-one', expected: '||--||' },
      { input: 'one-to-zero-many', expected: '||--}o' },
      { input: 'one-to-many', expected: '||--}|' },
      { input: 'one-to-zero-one-optional', expected: '||..|o' },
      { input: 'one-to-one-optional', expected: '||..||' },
      { input: 'many-to-zero-one', expected: '}|--|o' },
      { input: 'many-to-one', expected: '}|--||' },
      { input: 'many-to-many', expected: '}|--}|' },
      { input: 'many-to-many-optional', expected: '}|..}|' },
    ]
    it.each(testCases)('should return $expected for input $input', ({ input, expected }) => {
      const result = makeRelationLine(input)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe(expected)
      }
    })

    it('returns error for invalid input', () => {
      const result = makeRelationLine('invalid')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('Invalid input format: invalid')
      }
    })
    it('returns error for invalid from relationship', () => {
      const result = makeRelationLine('invalid-to-one')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('Invalid relationship: invalid')
      }
    })
    it('returns error for invalid to relationship', () => {
      const result = makeRelationLine('one-to-invalid')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('Invalid relationship: invalid')
      }
    })
  })

  describe('makeRelationLineFromRelation', () => {
    it('generates relation line', () => {
      const result = makeRelationLineFromRelation({
        fromModel: 'User',
        fromField: 'id',
        toModel: 'Post',
        toField: 'userId',
        type: 'one-to-many',
      })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe('    User ||--}| Post : "(id) - (userId)"')
      }
    })
    it('returns error for unknown type', () => {
      const result = makeRelationLineFromRelation({
        fromModel: 'User',
        fromField: 'id',
        toModel: 'Post',
        toField: 'userId',
        type: 'unknown-type',
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('Invalid input format: unknown-type')
      }
    })
  })

  describe('isRelationshipType', () => {
    it('returns true for valid types', () => {
      expect(isRelationshipType('zero-one')).toBe(true)
      expect(isRelationshipType('one')).toBe(true)
      expect(isRelationshipType('zero-many')).toBe(true)
      expect(isRelationshipType('many')).toBe(true)
    })
    it('returns false for invalid', () => {
      expect(isRelationshipType('invalid-key')).toBe(false)
    })
  })

  describe('parseRelation', () => {
    it('one-to-one', () => {
      expect(parseRelation('@relation User.id Profile.user_id one-to-one')).toStrictEqual({
        fromModel: 'User',
        toModel: 'Profile',
        fromField: 'id',
        toField: 'user_id',
        type: 'one-to-one',
      })
    })
    it('one-to-many', () => {
      expect(parseRelation('@relation Team.id TeamMember.team_id one-to-many')).toStrictEqual({
        fromModel: 'Team',
        toModel: 'TeamMember',
        fromField: 'id',
        toField: 'team_id',
        type: 'one-to-many',
      })
    })
    it('returns null for invalid format', () => {
      expect(parseRelation('@relation User.id Settings.user_id one-to-one-optional')).toBeNull()
    })
  })

  describe('removeDuplicateRelations', () => {
    it('removes duplicates', () => {
      expect(
        removeDuplicateRelations([
          '    Post }o--|| User : "PK(authorId) <- FK(id)"',
          '    Post }o--|| User : "PK(authorId) <- FK(id)"',
        ]),
      ).toStrictEqual(['    Post }o--|| User : "PK(authorId) <- FK(id)"'])
    })
    it('keeps unique relations', () => {
      const input = [
        '    User ||--o{ Post : "(id) - (userId)"',
        '    User ||--o{ Comment : "(id) - (userId)"',
      ]
      expect(removeDuplicateRelations(input)).toStrictEqual(input)
    })
    it('handles empty', () => {
      expect(removeDuplicateRelations([])).toStrictEqual([])
    })
  })

  describe('modelFields', () => {
    it('generates field lines with PK marker', () => {
      const model = makeModel({
        name: 'User',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'name', type: 'String' }),
        ],
      })
      const result = modelFields(model)
      expect(result).toStrictEqual(['        int id PK', '        string name'])
    })

    it('marks FK fields from relation', () => {
      const model = makeModel({
        name: 'Post',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'userId', type: 'Int' }),
          makeField({
            name: 'author',
            type: 'User',
            kind: 'object',
            relationName: 'PostToUser',
            relationFromFields: ['userId'],
            relationToFields: ['id'],
          }),
        ],
      })
      const result = modelFields(model)
      expect(result).toStrictEqual(['        int id PK', '        int userId FK'])
    })

    it('skips relation fields', () => {
      const model = makeModel({
        name: 'User',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({
            name: 'posts',
            type: 'Post',
            kind: 'object',
            isList: true,
            relationName: 'PostToUser',
          }),
        ],
      })
      const result = modelFields(model)
      expect(result).toStrictEqual(['        int id PK'])
    })

    it('includes stripped documentation as comment', () => {
      const model = makeModel({
        name: 'User',
        fields: [
          makeField({
            name: 'email',
            type: 'String',
            documentation: 'Email address\n@z.email()',
          }),
        ],
      })
      const result = modelFields(model)
      expect(result).toStrictEqual(['        string email "Email address"'])
    })

    it('handles field with no documentation', () => {
      const model = makeModel({
        name: 'User',
        fields: [makeField({ name: 'age', type: 'Int' })],
      })
      const result = modelFields(model)
      expect(result).toStrictEqual(['        int age'])
    })
  })

  describe('modelInfo', () => {
    it('wraps fields with model name braces', () => {
      const model = makeModel({
        name: 'User',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'name', type: 'String' }),
        ],
      })
      const result = modelInfo(model)
      expect(result).toStrictEqual([
        '    User {',
        '        int id PK',
        '        string name',
        '    }',
      ])
    })

    it('handles model with no fields', () => {
      const model = makeModel({ name: 'Empty' })
      const result = modelInfo(model)
      expect(result).toStrictEqual(['    Empty {', '    }'])
    })
  })

  describe('extractRelationsFromDmmf', () => {
    it('extracts one-to-many relation', () => {
      const models = [
        makeModel({
          name: 'User',
          fields: [
            makeField({ name: 'id', type: 'Int', isId: true }),
            makeField({
              name: 'posts',
              type: 'Post',
              kind: 'object',
              isList: true,
              relationName: 'PostToUser',
            }),
          ],
        }),
        makeModel({
          name: 'Post',
          fields: [
            makeField({ name: 'id', type: 'Int', isId: true }),
            makeField({ name: 'userId', type: 'Int' }),
            makeField({
              name: 'author',
              type: 'User',
              kind: 'object',
              relationName: 'PostToUser',
              relationFromFields: ['userId'],
              relationToFields: ['id'],
            }),
          ],
        }),
      ]
      const result = extractRelationsFromDmmf(models)
      expect(result).toStrictEqual(['    User ||--}| Post : "(id) - (userId)"'])
    })

    it('extracts optional relation (zero-many)', () => {
      const models = [
        makeModel({
          name: 'User',
          fields: [
            makeField({ name: 'id', type: 'Int', isId: true }),
            makeField({
              name: 'posts',
              type: 'Post',
              kind: 'object',
              isList: true,
              relationName: 'PostToUser',
            }),
          ],
        }),
        makeModel({
          name: 'Post',
          fields: [
            makeField({ name: 'id', type: 'Int', isId: true }),
            makeField({ name: 'userId', type: 'Int' }),
            makeField({
              name: 'author',
              type: 'User',
              kind: 'object',
              isRequired: false,
              relationName: 'PostToUser',
              relationFromFields: ['userId'],
              relationToFields: ['id'],
            }),
          ],
        }),
      ]
      const result = extractRelationsFromDmmf(models)
      expect(result).toStrictEqual(['    User ||--}o Post : "(id) - (userId)"'])
    })

    it('returns empty for models with no relations', () => {
      const models = [
        makeModel({
          name: 'Setting',
          fields: [makeField({ name: 'id', type: 'Int', isId: true })],
        }),
      ]
      expect(extractRelationsFromDmmf(models)).toStrictEqual([])
    })
  })

  describe('extractRelations', () => {
    it('extracts relations from model documentation', () => {
      const model = makeModel({
        name: 'User',
        documentation: '@relation User.id Post.userId one-to-many',
      })
      const result = extractRelations(model)
      expect(result).toStrictEqual(['    User ||--}| Post : "(id) - (userId)"'])
    })

    it('extracts multiple relations', () => {
      const model = makeModel({
        name: 'User',
        documentation:
          '@relation User.id Post.userId one-to-many\n@relation User.id Profile.userId one-to-one',
      })
      const result = extractRelations(model)
      expect(result).toStrictEqual([
        '    User ||--}| Post : "(id) - (userId)"',
        '    User ||--|| Profile : "(id) - (userId)"',
      ])
    })

    it('returns empty when no documentation', () => {
      const model = makeModel({ name: 'User' })
      expect(extractRelations(model)).toStrictEqual([])
    })

    it('skips invalid lines', () => {
      const model = makeModel({
        name: 'User',
        documentation: 'Some comment\n@relation User.id Post.userId one-to-many',
      })
      const result = extractRelations(model)
      expect(result).toStrictEqual(['    User ||--}| Post : "(id) - (userId)"'])
    })
  })

  describe('erContent', () => {
    it('generates complete ER diagram', () => {
      const models = [
        makeModel({
          name: 'User',
          fields: [
            makeField({ name: 'id', type: 'Int', isId: true }),
            makeField({ name: 'name', type: 'String' }),
            makeField({
              name: 'posts',
              type: 'Post',
              kind: 'object',
              isList: true,
              relationName: 'PostToUser',
            }),
          ],
        }),
        makeModel({
          name: 'Post',
          fields: [
            makeField({ name: 'id', type: 'Int', isId: true }),
            makeField({ name: 'title', type: 'String' }),
            makeField({ name: 'userId', type: 'Int' }),
            makeField({
              name: 'author',
              type: 'User',
              kind: 'object',
              relationName: 'PostToUser',
              relationFromFields: ['userId'],
              relationToFields: ['id'],
            }),
          ],
        }),
      ]
      const result = erContent(models)
      expect(result).toStrictEqual([
        '```mermaid',
        'erDiagram',
        '    User ||--}| Post : "(id) - (userId)"',
        '    User {',
        '        int id PK',
        '        string name',
        '    }',
        '    Post {',
        '        int id PK',
        '        string title',
        '        int userId FK',
        '    }',
        '```',
      ])
    })

    it('generates ER diagram with no relations', () => {
      const models = [
        makeModel({
          name: 'Setting',
          fields: [
            makeField({ name: 'id', type: 'Int', isId: true }),
            makeField({ name: 'key', type: 'String' }),
          ],
        }),
      ]
      const result = erContent(models)
      expect(result).toStrictEqual([
        '```mermaid',
        'erDiagram',
        '    Setting {',
        '        int id PK',
        '        string key',
        '    }',
        '```',
      ])
    })
  })

  // ============================================================================
  // Real-world use case tests
  // ============================================================================

  describe('E-Commerce ER diagram', () => {
    const customerModel = makeModel({
      name: 'Customer',
      fields: [
        makeField({ name: 'id', type: 'String', isId: true }),
        makeField({ name: 'email', type: 'String', isUnique: true, documentation: 'Email address' }),
        makeField({ name: 'name', type: 'String', documentation: 'Full name' }),
        makeField({
          name: 'orders',
          type: 'Order',
          kind: 'object',
          isList: true,
          relationName: 'OrderToCustomer',
        }),
      ],
    })

    const orderModel = makeModel({
      name: 'Order',
      fields: [
        makeField({ name: 'id', type: 'String', isId: true }),
        makeField({ name: 'totalAmount', type: 'Int', documentation: 'Total in cents' }),
        makeField({ name: 'customerId', type: 'String' }),
        makeField({
          name: 'customer',
          type: 'Customer',
          kind: 'object',
          relationName: 'OrderToCustomer',
          relationFromFields: ['customerId'],
          relationToFields: ['id'],
        }),
        makeField({
          name: 'items',
          type: 'OrderItem',
          kind: 'object',
          isList: true,
          relationName: 'OrderItemToOrder',
        }),
      ],
    })

    const orderItemModel = makeModel({
      name: 'OrderItem',
      fields: [
        makeField({ name: 'id', type: 'String', isId: true }),
        makeField({ name: 'quantity', type: 'Int' }),
        makeField({ name: 'unitPrice', type: 'Int', documentation: 'Price per unit in cents' }),
        makeField({ name: 'orderId', type: 'String' }),
        makeField({
          name: 'order',
          type: 'Order',
          kind: 'object',
          relationName: 'OrderItemToOrder',
          relationFromFields: ['orderId'],
          relationToFields: ['id'],
        }),
      ],
    })

    it('generates complete E-Commerce ER diagram with 3 models', () => {
      const result = erContent([customerModel, orderModel, orderItemModel])
      expect(result).toStrictEqual([
        '```mermaid',
        'erDiagram',
        '    Customer ||--}| Order : "(id) - (customerId)"',
        '    Order ||--}| OrderItem : "(id) - (orderId)"',
        '    Customer {',
        '        string id PK',
        '        string email "Email address"',
        '        string name "Full name"',
        '    }',
        '    Order {',
        '        string id PK',
        '        int totalAmount "Total in cents"',
        '        string customerId FK',
        '    }',
        '    OrderItem {',
        '        string id PK',
        '        int quantity',
        '        int unitPrice "Price per unit in cents"',
        '        string orderId FK',
        '    }',
        '```',
      ])
    })

    it('extracts correct DMMF relations for Order→Customer', () => {
      const relations = extractRelationsFromDmmf([customerModel, orderModel])
      expect(relations).toStrictEqual(['    Customer ||--}| Order : "(id) - (customerId)"'])
    })

    it('generates Customer model fields with PK and documentation', () => {
      const fields = modelFields(customerModel)
      expect(fields).toStrictEqual([
        '        string id PK',
        '        string email "Email address"',
        '        string name "Full name"',
      ])
    })

    it('generates Order model fields with FK marker', () => {
      const fields = modelFields(orderModel)
      expect(fields).toStrictEqual([
        '        string id PK',
        '        int totalAmount "Total in cents"',
        '        string customerId FK',
      ])
    })
  })

  describe('self-referencing relation (Category tree)', () => {
    it('generates self-referencing ER relation', () => {
      const categoryModel = makeModel({
        name: 'Category',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'name', type: 'String' }),
          makeField({ name: 'parentId', type: 'Int', isRequired: false }),
          makeField({
            name: 'parent',
            type: 'Category',
            kind: 'object',
            isRequired: false,
            relationName: 'CategoryToCategory',
            relationFromFields: ['parentId'],
            relationToFields: ['id'],
          }),
          makeField({
            name: 'children',
            type: 'Category',
            kind: 'object',
            isList: true,
            relationName: 'CategoryToCategory',
          }),
        ],
      })

      const relations = extractRelationsFromDmmf([categoryModel])
      expect(relations).toStrictEqual(['    Category ||--}o Category : "(id) - (parentId)"'])
    })
  })

  describe('one-to-one relation (User-Profile)', () => {
    it('generates one-to-one ER relation', () => {
      const userModel = makeModel({
        name: 'User',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({
            name: 'profile',
            type: 'Profile',
            kind: 'object',
            isList: false,
            isRequired: false,
            relationName: 'ProfileToUser',
          }),
        ],
      })

      const profileModel = makeModel({
        name: 'Profile',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'userId', type: 'Int', isUnique: true }),
          makeField({
            name: 'user',
            type: 'User',
            kind: 'object',
            relationName: 'ProfileToUser',
            relationFromFields: ['userId'],
            relationToFields: ['id'],
          }),
        ],
      })

      const relations = extractRelationsFromDmmf([userModel, profileModel])
      expect(relations).toStrictEqual(['    User ||--|| Profile : "(id) - (userId)"'])
    })
  })
})
