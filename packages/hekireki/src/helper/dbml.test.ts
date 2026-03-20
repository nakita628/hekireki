import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vitest'

import {
  combineKeys,
  dbmlContent,
  escapeNote,
  formatConstraints,
  makeEnum,
  makeEnums,
  makeRefName,
  makeRelations,
  makeTables,
} from './dbml.js'

describe('helper/dbml', () => {
  describe('quote', () => {
    it('wraps and escapes via makePrismaColumn note', () => {
      const tables = makeTables([
        {
          name: 'User',
          dbName: null,
          fields: [
            {
              name: 'id',
              kind: 'scalar',
              isList: false,
              isRequired: true,
              isUnique: false,
              isId: true,
              isReadOnly: false,
              hasDefaultValue: false,
              type: 'String',
              isGenerated: false,
              isUpdatedAt: false,
              documentation: "User's ID",
            },
          ],
          primaryKey: null,
          uniqueFields: [],
          uniqueIndexes: [],
          isGenerated: false,
        } as DMMF.Model,
      ])
      expect(tables[0]).toBe("Table User {\n  id String [pk, note: 'User\\'s ID']\n}")
    })
  })

  describe('makeIndex', () => {
    it('generates pk index', () => {
      const tables = makeTables([
        {
          name: 'User',
          dbName: null,
          fields: [
            {
              name: 'id',
              kind: 'scalar',
              isList: false,
              isRequired: true,
              isUnique: false,
              isId: false,
              isReadOnly: false,
              hasDefaultValue: false,
              type: 'String',
              isGenerated: false,
              isUpdatedAt: false,
            },
          ],
          primaryKey: { fields: ['id', 'name'], name: null },
          uniqueFields: [],
          uniqueIndexes: [],
          isGenerated: false,
        } as DMMF.Model,
      ])
      expect(tables[0]).toBe(
        'Table User {\n  id String [not null]\n\n  indexes {\n    (id, name) [pk]\n  }\n}',
      )
    })
    it('generates composite unique index', () => {
      const tables = makeTables([
        {
          name: 'User',
          dbName: null,
          fields: [
            {
              name: 'a',
              kind: 'scalar',
              isList: false,
              isRequired: true,
              isUnique: false,
              isId: false,
              isReadOnly: false,
              hasDefaultValue: false,
              type: 'String',
              isGenerated: false,
              isUpdatedAt: false,
            },
            {
              name: 'b',
              kind: 'scalar',
              isList: false,
              isRequired: true,
              isUnique: false,
              isId: false,
              isReadOnly: false,
              hasDefaultValue: false,
              type: 'String',
              isGenerated: false,
              isUpdatedAt: false,
            },
          ],
          primaryKey: null,
          uniqueFields: [['a', 'b']],
          uniqueIndexes: [],
          isGenerated: false,
        } as DMMF.Model,
      ])
      expect(tables[0]).toBe(
        'Table User {\n  a String [not null]\n  b String [not null]\n\n  indexes {\n    (a, b) [unique]\n  }\n}',
      )
    })
  })

  describe('makeRef', () => {
    it('generates simple ref', () => {
      const refs = makeRelations([
        {
          name: 'Post',
          dbName: null,
          fields: [
            {
              name: 'userId',
              kind: 'scalar',
              isList: false,
              isRequired: true,
              isUnique: false,
              isId: false,
              isReadOnly: false,
              hasDefaultValue: false,
              type: 'String',
              isGenerated: false,
              isUpdatedAt: false,
            },
            {
              name: 'user',
              kind: 'object',
              isList: false,
              isRequired: true,
              isUnique: false,
              isId: false,
              isReadOnly: false,
              hasDefaultValue: false,
              type: 'User',
              isGenerated: false,
              isUpdatedAt: false,
              relationName: 'PostToUser',
              relationFromFields: ['userId'],
              relationToFields: ['id'],
            },
          ],
          primaryKey: null,
          uniqueFields: [],
          uniqueIndexes: [],
          isGenerated: false,
        } as DMMF.Model,
        {
          name: 'User',
          dbName: null,
          fields: [
            {
              name: 'id',
              kind: 'scalar',
              isList: false,
              isRequired: true,
              isUnique: false,
              isId: true,
              isReadOnly: false,
              hasDefaultValue: false,
              type: 'String',
              isGenerated: false,
              isUpdatedAt: false,
            },
            {
              name: 'posts',
              kind: 'object',
              isList: true,
              isRequired: false,
              isUnique: false,
              isId: false,
              isReadOnly: false,
              hasDefaultValue: false,
              type: 'Post',
              isGenerated: false,
              isUpdatedAt: false,
              relationName: 'PostToUser',
            },
          ],
          primaryKey: null,
          uniqueFields: [],
          uniqueIndexes: [],
          isGenerated: false,
        } as DMMF.Model,
      ])
      expect(refs[0]).toBe('Ref Post_userId_fk: Post.userId > User.id')
    })
  })

  describe('makePrismaColumn', () => {
    it('generates pk column', () => {
      const tables = makeTables([
        {
          name: 'Test',
          dbName: null,
          fields: [
            {
              name: 'id',
              kind: 'scalar',
              isList: false,
              isRequired: true,
              isUnique: false,
              isId: true,
              isReadOnly: false,
              hasDefaultValue: false,
              type: 'String',
              isGenerated: false,
              isUpdatedAt: false,
            },
          ],
          primaryKey: null,
          uniqueFields: [],
          uniqueIndexes: [],
          isGenerated: false,
        } as DMMF.Model,
      ])
      expect(tables[0]).toBe('Table Test {\n  id String [pk]\n}')
    })
    it('generates column with all constraints', () => {
      const tables = makeTables([
        {
          name: 'Test',
          dbName: null,
          fields: [
            {
              name: 'email',
              kind: 'scalar',
              isList: false,
              isRequired: true,
              isUnique: true,
              isId: false,
              isReadOnly: false,
              hasDefaultValue: false,
              type: 'String',
              isGenerated: false,
              isUpdatedAt: false,
              documentation: "User's email",
            },
          ],
          primaryKey: null,
          uniqueFields: [],
          uniqueIndexes: [],
          isGenerated: false,
        } as DMMF.Model,
      ])
      expect(tables[0]).toBe(
        "Table Test {\n  email String [unique, not null, note: 'User\\'s email']\n}",
      )
    })
  })

  describe('makeEnums', () => {
    it('generates enum definitions', () => {
      const enums: DMMF.DatamodelEnum[] = [
        {
          name: 'Role',
          values: [
            { name: 'ADMIN', dbName: null },
            { name: 'USER', dbName: null },
          ],
        },
      ]
      const result = makeEnums(enums)
      expect(result).toStrictEqual(['Enum Role {\n  ADMIN\n  USER\n}'])
    })

    it('handles multiple enums', () => {
      const enums: DMMF.DatamodelEnum[] = [
        {
          name: 'Role',
          values: [{ name: 'ADMIN', dbName: null }],
        },
        {
          name: 'Status',
          values: [
            { name: 'ACTIVE', dbName: null },
            { name: 'INACTIVE', dbName: null },
          ],
        },
      ]
      const result = makeEnums(enums)
      expect(result).toStrictEqual([
        'Enum Role {\n  ADMIN\n}',
        'Enum Status {\n  ACTIVE\n  INACTIVE\n}',
      ])
    })

    it('returns empty array for no enums', () => {
      expect(makeEnums([])).toStrictEqual([])
    })
  })

  describe('dbmlContent', () => {
    it('combines enums, tables, and refs into full DBML output', () => {
      const datamodel: DMMF.Datamodel = {
        models: [
          {
            name: 'User',
            dbName: null,
            fields: [
              {
                name: 'id',
                kind: 'scalar',
                isList: false,
                isRequired: true,
                isUnique: false,
                isId: true,
                isReadOnly: false,
                hasDefaultValue: false,
                type: 'String',
                isGenerated: false,
                isUpdatedAt: false,
              },
            ],
            primaryKey: null,
            uniqueFields: [],
            uniqueIndexes: [],
            isGenerated: false,
          } as DMMF.Model,
        ],
        enums: [
          {
            name: 'Role',
            values: [
              { name: 'ADMIN', dbName: null },
              { name: 'USER', dbName: null },
            ],
          },
        ],
        types: [],
      }
      const result = dbmlContent(datamodel)
      expect(result).toBe('Enum Role {\n  ADMIN\n  USER\n}\n\nTable User {\n  id String [pk]\n}')
    })

    it('generates output with relations', () => {
      const datamodel: DMMF.Datamodel = {
        models: [
          {
            name: 'Post',
            dbName: null,
            fields: [
              {
                name: 'id',
                kind: 'scalar',
                isList: false,
                isRequired: true,
                isUnique: false,
                isId: true,
                isReadOnly: false,
                hasDefaultValue: false,
                type: 'String',
                isGenerated: false,
                isUpdatedAt: false,
              },
              {
                name: 'userId',
                kind: 'scalar',
                isList: false,
                isRequired: true,
                isUnique: false,
                isId: false,
                isReadOnly: false,
                hasDefaultValue: false,
                type: 'String',
                isGenerated: false,
                isUpdatedAt: false,
              },
              {
                name: 'user',
                kind: 'object',
                isList: false,
                isRequired: true,
                isUnique: false,
                isId: false,
                isReadOnly: false,
                hasDefaultValue: false,
                type: 'User',
                isGenerated: false,
                isUpdatedAt: false,
                relationName: 'PostToUser',
                relationFromFields: ['userId'],
                relationToFields: ['id'],
              },
            ],
            primaryKey: null,
            uniqueFields: [],
            uniqueIndexes: [],
            isGenerated: false,
          } as DMMF.Model,
          {
            name: 'User',
            dbName: null,
            fields: [
              {
                name: 'id',
                kind: 'scalar',
                isList: false,
                isRequired: true,
                isUnique: false,
                isId: true,
                isReadOnly: false,
                hasDefaultValue: false,
                type: 'String',
                isGenerated: false,
                isUpdatedAt: false,
              },
              {
                name: 'posts',
                kind: 'object',
                isList: true,
                isRequired: false,
                isUnique: false,
                isId: false,
                isReadOnly: false,
                hasDefaultValue: false,
                type: 'Post',
                isGenerated: false,
                isUpdatedAt: false,
                relationName: 'PostToUser',
              },
            ],
            primaryKey: null,
            uniqueFields: [],
            uniqueIndexes: [],
            isGenerated: false,
          } as DMMF.Model,
        ],
        enums: [],
        types: [],
      }
      const result = dbmlContent(datamodel)
      expect(result).toBe(
        'Table Post {\n  id String [pk]\n  userId String [not null]\n  user User [not null]\n}\n\nTable User {\n  id String [pk]\n  posts Post\n}\n\nRef Post_userId_fk: Post.userId > User.id',
      )
    })

    it('uses dbName when mapToDbSchema is true', () => {
      const datamodel: DMMF.Datamodel = {
        models: [
          {
            name: 'User',
            dbName: 'users',
            fields: [
              {
                name: 'id',
                kind: 'scalar',
                isList: false,
                isRequired: true,
                isUnique: false,
                isId: true,
                isReadOnly: false,
                hasDefaultValue: false,
                type: 'String',
                isGenerated: false,
                isUpdatedAt: false,
              },
            ],
            primaryKey: null,
            uniqueFields: [],
            uniqueIndexes: [],
            isGenerated: false,
          } as DMMF.Model,
        ],
        enums: [],
        types: [],
      }
      const result = dbmlContent(datamodel, true)
      expect(result).toBe('Table users {\n  id String [pk]\n}')
    })
  })

  describe('escapeNote', () => {
    it('escapes single quotes', () => {
      expect(escapeNote("User's bio")).toBe("User\\'s bio")
    })
  })

  describe('formatConstraints', () => {
    it('formats non-empty', () => {
      expect(formatConstraints(['pk', 'not null'])).toBe(' [pk, not null]')
    })
    it('returns empty for empty', () => {
      expect(formatConstraints([])).toBe('')
    })
  })

  describe('makeEnum', () => {
    it('generates enum', () => {
      expect(makeEnum({ name: 'Role', values: ['USER', 'ADMIN'] })).toBe(
        'Enum Role {\n  USER\n  ADMIN\n}',
      )
    })
  })

  describe('makeRefName', () => {
    it('uses provided name', () => {
      expect(
        makeRefName({
          name: 'custom_fk',
          fromTable: 'Post',
          fromColumn: 'userId',
          toTable: 'User',
          toColumn: 'id',
        }),
      ).toBe('custom_fk')
    })
    it('generates name from table/column when no name', () => {
      expect(
        makeRefName({
          fromTable: 'Post',
          fromColumn: 'userId',
          toTable: 'User',
          toColumn: 'id',
        }),
      ).toBe('Post_userId_User_id_fk')
    })
  })

  describe('combineKeys', () => {
    it('returns single key as-is', () => {
      expect(combineKeys(['id'])).toBe('id')
    })
    it('wraps multiple keys in parentheses', () => {
      expect(combineKeys(['id', 'name'])).toBe('(id, name)')
    })
    it('handles three keys', () => {
      expect(combineKeys(['a', 'b', 'c'])).toBe('(a, b, c)')
    })
  })

  // ============================================================================
  // Real-world use case tests
  // ============================================================================

  describe('E-Commerce schema', () => {
    const orderModel: DMMF.Model = {
      name: 'Order',
      dbName: 'orders',
      fields: [
        {
          name: 'id',
          kind: 'scalar',
          isList: false,
          isRequired: true,
          isUnique: false,
          isId: true,
          isReadOnly: false,
          hasDefaultValue: false,
          type: 'String',
          isGenerated: false,
          isUpdatedAt: false,
          documentation: 'Order ID',
        },
        {
          name: 'totalAmount',
          kind: 'scalar',
          isList: false,
          isRequired: true,
          isUnique: false,
          isId: false,
          isReadOnly: false,
          hasDefaultValue: false,
          type: 'Int',
          isGenerated: false,
          isUpdatedAt: false,
          documentation: 'Total amount in cents',
        },
        {
          name: 'customerId',
          kind: 'scalar',
          isList: false,
          isRequired: true,
          isUnique: false,
          isId: false,
          isReadOnly: false,
          hasDefaultValue: false,
          type: 'String',
          isGenerated: false,
          isUpdatedAt: false,
        },
        {
          name: 'customer',
          kind: 'object',
          isList: false,
          isRequired: true,
          isUnique: false,
          isId: false,
          isReadOnly: false,
          hasDefaultValue: false,
          type: 'Customer',
          isGenerated: false,
          isUpdatedAt: false,
          relationName: 'OrderToCustomer',
          relationFromFields: ['customerId'],
          relationToFields: ['id'],
        },
      ],
      primaryKey: null,
      uniqueFields: [],
      uniqueIndexes: [],
      isGenerated: false,
    } as DMMF.Model

    const customerModel: DMMF.Model = {
      name: 'Customer',
      dbName: 'customers',
      fields: [
        {
          name: 'id',
          kind: 'scalar',
          isList: false,
          isRequired: true,
          isUnique: false,
          isId: true,
          isReadOnly: false,
          hasDefaultValue: false,
          type: 'String',
          isGenerated: false,
          isUpdatedAt: false,
        },
        {
          name: 'email',
          kind: 'scalar',
          isList: false,
          isRequired: true,
          isUnique: true,
          isId: false,
          isReadOnly: false,
          hasDefaultValue: false,
          type: 'String',
          isGenerated: false,
          isUpdatedAt: false,
          documentation: 'Unique email address',
        },
        {
          name: 'orders',
          kind: 'object',
          isList: true,
          isRequired: false,
          isUnique: false,
          isId: false,
          isReadOnly: false,
          hasDefaultValue: false,
          type: 'Order',
          isGenerated: false,
          isUpdatedAt: false,
          relationName: 'OrderToCustomer',
        },
      ],
      primaryKey: null,
      uniqueFields: [],
      uniqueIndexes: [],
      isGenerated: false,
    } as DMMF.Model

    it('generates Order table with note and FK', () => {
      const tables = makeTables([orderModel])
      expect(tables[0]).toBe(
        "Table Order {\n  id String [pk, note: 'Order ID']\n  totalAmount Int [not null, note: 'Total amount in cents']\n  customerId String [not null]\n  customer Customer [not null]\n}",
      )
    })

    it('uses dbName when mapToDbSchema is true', () => {
      const tables = makeTables([orderModel], true)
      expect(tables[0]).toBe(
        "Table orders {\n  id String [pk, note: 'Order ID']\n  totalAmount Int [not null, note: 'Total amount in cents']\n  customerId String [not null]\n  customer Customer [not null]\n}",
      )
    })

    it('generates FK reference from Order to Customer', () => {
      const refs = makeRelations([orderModel, customerModel])
      expect(refs).toStrictEqual(['Ref Order_customerId_fk: Order.customerId > Customer.id'])
    })

    it('generates complete DBML with enum', () => {
      const datamodel: DMMF.Datamodel = {
        models: [orderModel, customerModel],
        enums: [
          {
            name: 'OrderStatus',
            values: [
              { name: 'PENDING', dbName: null },
              { name: 'CONFIRMED', dbName: null },
              { name: 'SHIPPED', dbName: null },
              { name: 'DELIVERED', dbName: null },
              { name: 'CANCELLED', dbName: null },
            ],
          },
        ],
        types: [],
      }
      const result = dbmlContent(datamodel)
      expect(result).toBe(
        "Enum OrderStatus {\n  PENDING\n  CONFIRMED\n  SHIPPED\n  DELIVERED\n  CANCELLED\n}\n\nTable Order {\n  id String [pk, note: 'Order ID']\n  totalAmount Int [not null, note: 'Total amount in cents']\n  customerId String [not null]\n  customer Customer [not null]\n}\n\nTable Customer {\n  id String [pk]\n  email String [unique, not null, note: 'Unique email address']\n  orders Order\n}\n\nRef Order_customerId_fk: Order.customerId > Customer.id",
      )
    })
  })

  describe('edge cases', () => {
    it('escapes apostrophe in note', () => {
      expect(escapeNote("Customer's order total")).toBe("Customer\\'s order total")
    })

    it('escapes multiple apostrophes', () => {
      expect(escapeNote("It's the user's data")).toBe("It\\'s the user\\'s data")
    })

    it('handles empty string', () => {
      expect(escapeNote('')).toBe('')
    })
  })
})
