import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import { erContent } from '../generator/mermaid-er.js'
import { erRelationLine, escapeComment, modelFields, modelInfo } from './mermaid-er.js'

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
  describe('escapeComment', () => {
    it('replaces double quotes with the #quot; entity code', () => {
      expect(escapeComment('name is "dm:{a}:{b}" composite')).toBe(
        'name is #quot;dm:{a}:{b}#quot; composite',
      )
    })

    it('collapses newlines into spaces', () => {
      expect(escapeComment('first line\nsecond line')).toBe('first line second line')
    })

    it('collapses CRLF newlines into spaces', () => {
      expect(escapeComment('first line\r\nsecond line')).toBe('first line second line')
    })

    it('escapes quotes and newlines together', () => {
      expect(escapeComment('unique. DM is "dm:{x}:{y}" of the\ncomposite name')).toBe(
        'unique. DM is #quot;dm:{x}:{y}#quot; of the composite name',
      )
    })

    it('leaves plain text untouched', () => {
      expect(escapeComment('Email address')).toBe('Email address')
    })
  })

  describe('erRelationLine', () => {
    it('renders a one-to-many relation', () => {
      const result = erRelationLine({
        from: { model: 'User', field: 'id', cardinality: 'one' },
        to: { model: 'Post', field: 'userId', cardinality: 'many' },
      })
      expect(result).toBe('    User ||--|{ Post : "(id) - (userId)"')
    })

    it('renders a one-to-zero-many relation', () => {
      const result = erRelationLine({
        from: { model: 'User', field: 'id', cardinality: 'one' },
        to: { model: 'Post', field: 'userId', cardinality: 'zero-many' },
      })
      expect(result).toBe('    User ||--o{ Post : "(id) - (userId)"')
    })

    it('renders a one-to-one relation', () => {
      const result = erRelationLine({
        from: { model: 'User', field: 'id', cardinality: 'one' },
        to: { model: 'Profile', field: 'userId', cardinality: 'one' },
      })
      expect(result).toBe('    User ||--|| Profile : "(id) - (userId)"')
    })

    it('renders a one-to-zero-one relation', () => {
      const result = erRelationLine({
        from: { model: 'User', field: 'id', cardinality: 'one' },
        to: { model: 'Profile', field: 'userId', cardinality: 'zero-one' },
      })
      expect(result).toBe('    User ||--o| Profile : "(id) - (userId)"')
    })

    it('maps endpoint model names through the resolver', () => {
      const result = erRelationLine(
        {
          from: { model: 'User', field: 'id', cardinality: 'one' },
          to: { model: 'Post', field: 'userId', cardinality: 'many' },
        },
        (model) => (model === 'User' ? 'users' : model === 'Post' ? 'posts' : model),
      )
      expect(result).toBe('    users ||--|{ posts : "(id) - (userId)"')
    })

    it('renders the from-side cardinality (many-to-many)', () => {
      const result = erRelationLine({
        from: { model: 'Post', field: 'id', cardinality: 'many' },
        to: { model: 'Tag', field: 'id', cardinality: 'many' },
      })
      expect(result).toBe('    Post }|--|{ Tag : "(id) - (id)"')
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

    it('escapes double quotes and newlines in documentation', () => {
      const model = makeModel({
        name: 'Channel',
        fields: [
          makeField({
            name: 'name',
            type: 'String',
            documentation:
              'Channel name, globally unique. DM stores the "dm:{smallerUserId}:{largerUserId}"\ncomposite name',
          }),
        ],
      })
      const result = modelFields(model)
      expect(result).toStrictEqual([
        '        string name "Channel name, globally unique. DM stores the #quot;dm:{smallerUserId}:{largerUserId}#quot; composite name"',
      ])
    })

    it('marks every column of a composite primary key, and a key that is also a foreign key', () => {
      const model = makeModel({
        name: 'Follow',
        primaryKey: { name: null, fields: ['followerId', 'followingId'] },
        fields: [
          makeField({ name: 'followerId', type: 'String' }),
          makeField({ name: 'followingId', type: 'String' }),
          makeField({
            name: 'follower',
            type: 'User',
            kind: 'object',
            relationName: 'follower',
            relationFromFields: ['followerId'],
            relationToFields: ['id'],
          }),
          makeField({
            name: 'following',
            type: 'User',
            kind: 'object',
            relationName: 'following',
            relationFromFields: ['followingId'],
            relationToFields: ['id'],
          }),
        ],
      })
      expect(modelFields(model)).toStrictEqual([
        '        string followerId PK, FK',
        '        string followingId PK, FK',
      ])
    })

    it('marks every column of a composite unique, the closest Mermaid can come to one', () => {
      const model = makeModel({
        name: 'Category',
        uniqueFields: [['parentId', 'name']],
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'parentId', type: 'Int' }),
          makeField({ name: 'name', type: 'String' }),
        ],
      })
      expect(modelFields(model)).toStrictEqual([
        '        int id PK',
        '        int parentId UK',
        '        string name UK',
      ])
    })

    it('keeps the brackets of a scalar list', () => {
      const model = makeModel({
        name: 'User',
        fields: [makeField({ name: 'interests', type: 'String', isList: true })],
      })
      expect(modelFields(model)).toStrictEqual(['        string[] interests'])
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

    it('uses the @@map name as the entity name', () => {
      const model = makeModel({
        name: 'User',
        dbName: 'users',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'name', type: 'String' }),
        ],
      })
      const result = modelInfo(model)
      expect(result).toStrictEqual([
        '    users {',
        '        int id PK',
        '        string name',
        '    }',
      ])
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
        '    User ||--o{ Post : "(id) - (userId)"',
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

    it('uses @@map names for entities and relation endpoints', () => {
      const models = [
        makeModel({
          name: 'User',
          dbName: 'users',
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
          dbName: 'posts',
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
        '    users ||--o{ posts : "(id) - (userId)"',
        '    users {',
        '        int id PK',
        '        string name',
        '    }',
        '    posts {',
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

    it('draws the implicit many-to-many relation of a join table', () => {
      const models = [
        makeModel({
          name: 'Post',
          fields: [
            makeField({ name: 'id', type: 'Int', isId: true }),
            makeField({
              name: 'tags',
              type: 'Tag',
              kind: 'object',
              isList: true,
              relationName: 'PostToTag',
            }),
          ],
        }),
        makeModel({
          name: 'Tag',
          fields: [
            makeField({ name: 'id', type: 'Int', isId: true }),
            makeField({
              name: 'posts',
              type: 'Post',
              kind: 'object',
              isList: true,
              relationName: 'PostToTag',
            }),
          ],
        }),
      ]
      expect(erContent(models)).toStrictEqual([
        '```mermaid',
        'erDiagram',
        '    Post }o--o{ Tag : "(tags) - (posts)"',
        '    Post {',
        '        int id PK',
        '    }',
        '    Tag {',
        '        int id PK',
        '    }',
        '```',
      ])
    })

    it('generates a relation from an annotation only (no physical FK)', () => {
      const models = [
        makeModel({
          name: 'User',
          fields: [makeField({ name: 'id', type: 'Int', isId: true })],
        }),
        makeModel({
          name: 'Post',
          documentation: '@relation User.id Post.userId one-to-many',
          fields: [
            makeField({ name: 'id', type: 'Int', isId: true }),
            makeField({ name: 'userId', type: 'Int' }),
          ],
        }),
      ]
      const result = erContent(models)
      expect(result).toStrictEqual([
        '```mermaid',
        'erDiagram',
        '    User ||--|{ Post : "(id) - (userId)"',
        '    User {',
        '        int id PK',
        '    }',
        '    Post {',
        '        int id PK',
        '        int userId',
        '    }',
        '```',
      ])
    })
  })

  describe('E-Commerce ER diagram', () => {
    const customerModel = makeModel({
      name: 'Customer',
      fields: [
        makeField({ name: 'id', type: 'String', isId: true }),
        makeField({
          name: 'email',
          type: 'String',
          isUnique: true,
          documentation: 'Email address',
        }),
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
        '    Customer ||--o{ Order : "(id) - (customerId)"',
        '    Order ||--o{ OrderItem : "(id) - (orderId)"',
        '    Customer {',
        '        string id PK',
        '        string email UK "Email address"',
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

    it('generates Customer model fields with PK and documentation', () => {
      const fields = modelFields(customerModel)
      expect(fields).toStrictEqual([
        '        string id PK',
        '        string email UK "Email address"',
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
})
