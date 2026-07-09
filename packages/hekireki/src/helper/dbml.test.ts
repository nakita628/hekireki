import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import { dbmlContent } from '../generator/dbml.js'
import {
  annotatedDbmlRefs,
  combineKeys,
  escapeNote,
  formatConstraints,
  makeEnum,
  makeEnums,
  makeRefName,
  makeRelations,
  makeTables,
} from './dbml.js'
import { modelFields } from './mermaid-er.js'

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

describe('helper/dbml', () => {
  describe('noteLiteral', () => {
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

    it('generates enum definition', () => {
      const enums: DMMF.DatamodelEnum[] = [
        {
          name: 'Role',
          values: [
            { name: 'USER', dbName: null },
            { name: 'ADMIN', dbName: null },
          ],
          dbName: null,
        },
      ]
      expect(makeEnums(enums)).toStrictEqual(['Enum Role {\n  USER\n  ADMIN\n}'])
    })

    it('returns empty array for empty enums', () => {
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
        'Table Post {\n  id String [pk]\n  userId String [not null]\n}\n\nTable User {\n  id String [pk]\n}\n\nRef Post_userId_fk: Post.userId > User.id',
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

    it('generates complete DBML without header', () => {
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
                hasDefaultValue: true,
                type: 'Int',
                default: { name: 'autoincrement', args: [] },
                isGenerated: false,
                isUpdatedAt: false,
              },
            ],
            primaryKey: null,
            uniqueFields: [],
            uniqueIndexes: [],
            isGenerated: false,
          },
        ],
        enums: [],
        types: [],
      }
      expect(dbmlContent(datamodel)).toBe('Table User {\n  id Int [pk, increment]\n}')
    })

    it('returns empty string for empty datamodel', () => {
      expect(dbmlContent({ models: [], enums: [], types: [] })).toBe('')
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
        "Table Order {\n  id String [pk, note: 'Order ID']\n  totalAmount Int [not null, note: 'Total amount in cents']\n  customerId String [not null]\n}",
      )
    })

    it('uses dbName when mapToDbSchema is true', () => {
      const tables = makeTables([orderModel], true)
      expect(tables[0]).toBe(
        "Table orders {\n  id String [pk, note: 'Order ID']\n  totalAmount Int [not null, note: 'Total amount in cents']\n  customerId String [not null]\n}",
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
        "Enum OrderStatus {\n  PENDING\n  CONFIRMED\n  SHIPPED\n  DELIVERED\n  CANCELLED\n}\n\nTable Order {\n  id String [pk, note: 'Order ID']\n  totalAmount Int [not null, note: 'Total amount in cents']\n  customerId String [not null]\n}\n\nTable Customer {\n  id String [pk]\n  email String [unique, not null, note: 'Unique email address']\n}\n\nRef Order_customerId_fk: Order.customerId > Customer.id",
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

  describe('makeTables', () => {
    it('strips Zod annotations from field documentation', () => {
      const models: DMMF.Model[] = [
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
              documentation: 'Unique user ID\n@z.cuid()',
              isGenerated: false,
              isUpdatedAt: false,
            },
          ],
          primaryKey: null,
          uniqueFields: [],
          uniqueIndexes: [],
          isGenerated: false,
        },
      ]
      expect(makeTables(models)).toStrictEqual([
        "Table User {\n  id String [pk, note: 'Unique user ID']\n}",
      ])
    })

    it('strips Valibot annotations from field documentation', () => {
      const models: DMMF.Model[] = [
        {
          name: 'User',
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
              documentation: 'Email address\n@v.pipe(v.string(), v.email())',
              isGenerated: false,
              isUpdatedAt: false,
            },
          ],
          primaryKey: null,
          uniqueFields: [],
          uniqueIndexes: [],
          isGenerated: false,
        },
      ]
      expect(makeTables(models)).toStrictEqual([
        "Table User {\n  email String [unique, not null, note: 'Email address']\n}",
      ])
    })

    it('strips @relation annotations from model documentation', () => {
      const models: DMMF.Model[] = [
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
          documentation: '@relation User.id Post.userId one-to-many',
        },
      ]
      expect(makeTables(models)).toStrictEqual(['Table User {\n  id String [pk]\n}'])
    })

    it('generates basic table definition', () => {
      const models: DMMF.Model[] = [
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
              hasDefaultValue: true,
              type: 'Int',
              default: { name: 'autoincrement', args: [] },
              isGenerated: false,
              isUpdatedAt: false,
            },
            {
              name: 'name',
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
          uniqueFields: [],
          uniqueIndexes: [],
          isGenerated: false,
        },
      ]
      expect(makeTables(models)).toStrictEqual([
        'Table User {\n  id Int [pk, increment]\n  name String [not null]\n}',
      ])
    })

    it('generates table with composite unique index', () => {
      const models: DMMF.Model[] = [
        {
          name: 'Account',
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
              name: 'provider',
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
              name: 'providerAccountId',
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
          uniqueFields: [['provider', 'providerAccountId']],
          uniqueIndexes: [],
          isGenerated: false,
        },
      ]
      expect(makeTables(models)).toStrictEqual([
        'Table Account {\n  id String [pk]\n  provider String [not null]\n  providerAccountId String [not null]\n\n  indexes {\n    (provider, providerAccountId) [unique]\n  }\n}',
      ])
    })
  })

  describe('makeRelations', () => {
    it('generates foreign key reference', () => {
      const models: DMMF.Model[] = [
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
              hasDefaultValue: true,
              type: 'Int',
              default: { name: 'autoincrement', args: [] },
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
              relationName: 'PostToUser',
              isGenerated: false,
              isUpdatedAt: false,
            },
          ],
          primaryKey: null,
          uniqueFields: [],
          uniqueIndexes: [],
          isGenerated: false,
        },
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
              hasDefaultValue: true,
              type: 'Int',
              default: { name: 'autoincrement', args: [] },
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
              type: 'Int',
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
              relationName: 'PostToUser',
              relationFromFields: ['userId'],
              relationToFields: ['id'],
              isGenerated: false,
              isUpdatedAt: false,
            },
          ],
          primaryKey: null,
          uniqueFields: [],
          uniqueIndexes: [],
          isGenerated: false,
        },
      ]
      expect(makeRelations(models)).toStrictEqual(['Ref Post_userId_fk: Post.userId > User.id'])
    })

    it('generates relation with onDelete cascade', () => {
      const models: DMMF.Model[] = [
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
              relationName: 'PostToUser',
              isGenerated: false,
              isUpdatedAt: false,
            },
          ],
          primaryKey: null,
          uniqueFields: [],
          uniqueIndexes: [],
          isGenerated: false,
        },
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
              relationName: 'PostToUser',
              relationFromFields: ['userId'],
              relationToFields: ['id'],
              relationOnDelete: 'Cascade',
              isGenerated: false,
              isUpdatedAt: false,
            },
          ],
          primaryKey: null,
          uniqueFields: [],
          uniqueIndexes: [],
          isGenerated: false,
        },
      ]
      expect(makeRelations(models)).toStrictEqual([
        'Ref Post_userId_fk: Post.userId > User.id [delete: cascade]',
      ])
    })

    it('converts all Prisma referential actions to DBML lowercase values', () => {
      const models: DMMF.Model[] = [
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
              relationName: 'PostToUser',
              isGenerated: false,
              isUpdatedAt: false,
            },
          ],
          primaryKey: null,
          uniqueFields: [],
          uniqueIndexes: [],
          isGenerated: false,
        },
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
              name: 'cascadeUserId',
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
              name: 'setNullUserId',
              kind: 'scalar',
              isList: false,
              isRequired: false,
              isUnique: false,
              isId: false,
              isReadOnly: false,
              hasDefaultValue: false,
              type: 'String',
              isGenerated: false,
              isUpdatedAt: false,
            },
            {
              name: 'setDefaultUserId',
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
              name: 'noActionUserId',
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
              name: 'restrictUserId',
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
              name: 'cascadeUser',
              kind: 'object',
              isList: false,
              isRequired: true,
              isUnique: false,
              isId: false,
              isReadOnly: false,
              hasDefaultValue: false,
              type: 'User',
              relationName: 'PostToUser',
              relationFromFields: ['cascadeUserId'],
              relationToFields: ['id'],
              relationOnDelete: 'Cascade',
              isGenerated: false,
              isUpdatedAt: false,
            },
            {
              name: 'setNullUser',
              kind: 'object',
              isList: false,
              isRequired: false,
              isUnique: false,
              isId: false,
              isReadOnly: false,
              hasDefaultValue: false,
              type: 'User',
              relationName: 'PostSetNullToUser',
              relationFromFields: ['setNullUserId'],
              relationToFields: ['id'],
              relationOnDelete: 'SetNull',
              isGenerated: false,
              isUpdatedAt: false,
            },
            {
              name: 'setDefaultUser',
              kind: 'object',
              isList: false,
              isRequired: true,
              isUnique: false,
              isId: false,
              isReadOnly: false,
              hasDefaultValue: false,
              type: 'User',
              relationName: 'PostSetDefaultToUser',
              relationFromFields: ['setDefaultUserId'],
              relationToFields: ['id'],
              relationOnDelete: 'SetDefault',
              isGenerated: false,
              isUpdatedAt: false,
            },
            {
              name: 'noActionUser',
              kind: 'object',
              isList: false,
              isRequired: true,
              isUnique: false,
              isId: false,
              isReadOnly: false,
              hasDefaultValue: false,
              type: 'User',
              relationName: 'PostNoActionToUser',
              relationFromFields: ['noActionUserId'],
              relationToFields: ['id'],
              relationOnDelete: 'NoAction',
              isGenerated: false,
              isUpdatedAt: false,
            },
            {
              name: 'restrictUser',
              kind: 'object',
              isList: false,
              isRequired: true,
              isUnique: false,
              isId: false,
              isReadOnly: false,
              hasDefaultValue: false,
              type: 'User',
              relationName: 'PostRestrictToUser',
              relationFromFields: ['restrictUserId'],
              relationToFields: ['id'],
              relationOnDelete: 'Restrict',
              isGenerated: false,
              isUpdatedAt: false,
            },
          ],
          primaryKey: null,
          uniqueFields: [],
          uniqueIndexes: [],
          isGenerated: false,
        },
      ]
      expect(makeRelations(models)).toStrictEqual([
        'Ref Post_cascadeUserId_fk: Post.cascadeUserId > User.id [delete: cascade]',
        'Ref Post_setNullUserId_fk: Post.setNullUserId > User.id [delete: set null]',
        'Ref Post_setDefaultUserId_fk: Post.setDefaultUserId > User.id [delete: set default]',
        'Ref Post_noActionUserId_fk: Post.noActionUserId > User.id [delete: no action]',
        'Ref Post_restrictUserId_fk: Post.restrictUserId > User.id [delete: restrict]',
      ])
    })

    it('returns empty array when no relations exist', () => {
      const models: DMMF.Model[] = [
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
        },
      ]
      expect(makeRelations(models)).toStrictEqual([])
    })

    it('converts all Prisma referential actions in onUpdate to DBML lowercase values', () => {
      const models = [
        makeModel({
          name: 'User',
          fields: [
            makeField({ name: 'id', type: 'String', isId: true }),
            makeField({
              name: 'posts',
              type: 'Post',
              kind: 'object',
              isList: true,
              isRequired: false,
              relationName: 'PostToUser',
            }),
          ],
        }),
        makeModel({
          name: 'Post',
          fields: [
            makeField({ name: 'id', type: 'String', isId: true }),
            makeField({ name: 'cascadeUserId', type: 'String' }),
            makeField({ name: 'setNullUserId', type: 'String' }),
            makeField({ name: 'setDefaultUserId', type: 'String' }),
            makeField({ name: 'noActionUserId', type: 'String' }),
            makeField({ name: 'restrictUserId', type: 'String' }),
            makeField({
              name: 'cascadeUser',
              type: 'User',
              kind: 'object',
              relationName: 'CascadePostToUser',
              relationFromFields: ['cascadeUserId'],
              relationToFields: ['id'],
              relationOnUpdate: 'Cascade',
            }),
            makeField({
              name: 'setNullUser',
              type: 'User',
              kind: 'object',
              relationName: 'SetNullPostToUser',
              relationFromFields: ['setNullUserId'],
              relationToFields: ['id'],
              relationOnUpdate: 'SetNull',
            }),
            makeField({
              name: 'setDefaultUser',
              type: 'User',
              kind: 'object',
              relationName: 'SetDefaultPostToUser',
              relationFromFields: ['setDefaultUserId'],
              relationToFields: ['id'],
              relationOnUpdate: 'SetDefault',
            }),
            makeField({
              name: 'noActionUser',
              type: 'User',
              kind: 'object',
              relationName: 'NoActionPostToUser',
              relationFromFields: ['noActionUserId'],
              relationToFields: ['id'],
              relationOnUpdate: 'NoAction',
            }),
            makeField({
              name: 'restrictUser',
              type: 'User',
              kind: 'object',
              relationName: 'RestrictPostToUser',
              relationFromFields: ['restrictUserId'],
              relationToFields: ['id'],
              relationOnUpdate: 'Restrict',
            }),
          ],
        }),
      ]
      expect(makeRelations(models)).toStrictEqual([
        'Ref Post_cascadeUserId_fk: Post.cascadeUserId > User.id [update: cascade]',
        'Ref Post_setNullUserId_fk: Post.setNullUserId > User.id [update: set null]',
        'Ref Post_setDefaultUserId_fk: Post.setDefaultUserId > User.id [update: set default]',
        'Ref Post_noActionUserId_fk: Post.noActionUserId > User.id [update: no action]',
        'Ref Post_restrictUserId_fk: Post.restrictUserId > User.id [update: restrict]',
      ])
    })

    it('emits both delete and update actions in one Ref', () => {
      const models = [
        makeModel({
          name: 'User',
          fields: [
            makeField({ name: 'id', type: 'String', isId: true }),
            makeField({
              name: 'posts',
              type: 'Post',
              kind: 'object',
              isList: true,
              isRequired: false,
              relationName: 'PostToUser',
            }),
          ],
        }),
        makeModel({
          name: 'Post',
          fields: [
            makeField({ name: 'id', type: 'String', isId: true }),
            makeField({ name: 'userId', type: 'String' }),
            makeField({
              name: 'user',
              type: 'User',
              kind: 'object',
              relationName: 'PostToUser',
              relationFromFields: ['userId'],
              relationToFields: ['id'],
              relationOnDelete: 'Cascade',
              relationOnUpdate: 'Restrict',
            }),
          ],
        }),
      ]
      expect(makeRelations(models)).toStrictEqual([
        'Ref Post_userId_fk: Post.userId > User.id [delete: cascade, update: restrict]',
      ])
    })

    it('emits only the update action when onDelete is absent', () => {
      const models = [
        makeModel({
          name: 'User',
          fields: [
            makeField({ name: 'id', type: 'String', isId: true }),
            makeField({
              name: 'posts',
              type: 'Post',
              kind: 'object',
              isList: true,
              isRequired: false,
              relationName: 'PostToUser',
            }),
          ],
        }),
        makeModel({
          name: 'Post',
          fields: [
            makeField({ name: 'id', type: 'String', isId: true }),
            makeField({ name: 'userId', type: 'String' }),
            makeField({
              name: 'user',
              type: 'User',
              kind: 'object',
              relationName: 'PostToUser',
              relationFromFields: ['userId'],
              relationToFields: ['id'],
              relationOnUpdate: 'SetNull',
            }),
          ],
        }),
      ]
      expect(makeRelations(models)).toStrictEqual([
        'Ref Post_userId_fk: Post.userId > User.id [update: set null]',
      ])
    })

    it('passes an unrecognized referential action through verbatim', () => {
      const models = [
        makeModel({
          name: 'User',
          fields: [
            makeField({ name: 'id', type: 'String', isId: true }),
            makeField({
              name: 'posts',
              type: 'Post',
              kind: 'object',
              isList: true,
              isRequired: false,
              relationName: 'PostToUser',
            }),
          ],
        }),
        makeModel({
          name: 'Post',
          fields: [
            makeField({ name: 'id', type: 'String', isId: true }),
            makeField({ name: 'userId', type: 'String' }),
            makeField({
              name: 'user',
              type: 'User',
              kind: 'object',
              relationName: 'PostToUser',
              relationFromFields: ['userId'],
              relationToFields: ['id'],
              relationOnDelete: 'FutureAction',
            }),
          ],
        }),
      ]
      expect(makeRelations(models)).toStrictEqual([
        'Ref Post_userId_fk: Post.userId > User.id [delete: FutureAction]',
      ])
    })

    it('emits a composite foreign key with a referential action', () => {
      const models = [
        makeModel({
          name: 'User',
          fields: [
            makeField({ name: 'tenantId', type: 'String' }),
            makeField({ name: 'id', type: 'String', isId: true }),
            makeField({
              name: 'memberships',
              type: 'Membership',
              kind: 'object',
              isList: true,
              isRequired: false,
              relationName: 'MembershipToUser',
            }),
          ],
        }),
        makeModel({
          name: 'Membership',
          fields: [
            makeField({ name: 'tenantId', type: 'String' }),
            makeField({ name: 'userId', type: 'String' }),
            makeField({
              name: 'user',
              type: 'User',
              kind: 'object',
              relationName: 'MembershipToUser',
              relationFromFields: ['tenantId', 'userId'],
              relationToFields: ['tenantId', 'id'],
              relationOnDelete: 'Cascade',
            }),
          ],
        }),
      ]
      expect(makeRelations(models)).toStrictEqual([
        'Ref Membership_(tenantId, userId)_fk: Membership.(tenantId, userId) > User.(tenantId, id) [delete: cascade]',
      ])
    })

    it('emits a self-relation with a referential action', () => {
      const models = [
        makeModel({
          name: 'Employee',
          fields: [
            makeField({ name: 'id', type: 'String', isId: true }),
            makeField({ name: 'managerId', type: 'String', isRequired: false }),
            makeField({
              name: 'manager',
              type: 'Employee',
              kind: 'object',
              isRequired: false,
              relationName: 'EmployeeToManager',
              relationFromFields: ['managerId'],
              relationToFields: ['id'],
              relationOnDelete: 'SetNull',
            }),
            makeField({
              name: 'reports',
              type: 'Employee',
              kind: 'object',
              isList: true,
              isRequired: false,
              relationName: 'EmployeeToManager',
            }),
          ],
        }),
      ]
      expect(makeRelations(models)).toStrictEqual([
        'Ref Employee_managerId_fk: Employee.managerId - Employee.id [delete: set null]',
      ])
    })
  })

  describe('annotatedDbmlRefs', () => {
    it('emits a logical ref for an annotation-only relation (no physical FK)', () => {
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
      expect(annotatedDbmlRefs(models)).toStrictEqual([
        'Ref Post_userId_User_id: Post.userId > User.id',
      ])
    })

    it('uses the dash operator for a one-to-one logical relation', () => {
      const models = [
        makeModel({
          name: 'User',
          fields: [makeField({ name: 'id', type: 'Int', isId: true })],
        }),
        makeModel({
          name: 'Profile',
          documentation: '@relation User.id Profile.userId one-to-one',
          fields: [
            makeField({ name: 'id', type: 'Int', isId: true }),
            makeField({ name: 'userId', type: 'Int' }),
          ],
        }),
      ]
      expect(annotatedDbmlRefs(models)).toStrictEqual([
        'Ref Profile_userId_User_id: Profile.userId - User.id',
      ])
    })

    it('skips annotations already backed by a physical FK (FK ref wins)', () => {
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
          documentation: '@relation User.id Post.userId one-to-many',
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
      expect(annotatedDbmlRefs(models)).toStrictEqual([])
    })

    it('returns empty when there are no annotations', () => {
      expect(annotatedDbmlRefs([makeModel({ name: 'User' })])).toStrictEqual([])
    })
  })

  describe('dbmlContent with annotation-only relation', () => {
    it('appends the logical ref after the tables', () => {
      const datamodel: DMMF.Datamodel = {
        models: [
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
        ],
        enums: [],
        types: [],
      }
      expect(dbmlContent(datamodel)).toBe(
        [
          'Table User {\n  id Int [pk]\n}',
          'Table Post {\n  id Int [pk]\n  userId Int [not null]\n}',
          'Ref Post_userId_User_id: Post.userId > User.id',
        ].join('\n\n'),
      )
    })
  })
  describe('multiline notes', () => {
    it('emits a triple-quoted column note when the note contains a newline', () => {
      const tables = makeTables([
        {
          name: 'User',
          dbName: null,
          fields: [
            {
              name: 'bio',
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
              documentation: 'line1\nline2',
            },
          ],
          primaryKey: null,
          uniqueFields: [],
          uniqueIndexes: [],
          isGenerated: false,
        } as DMMF.Model,
      ])
      expect(tables[0]).toBe("Table User {\n  bio String [not null, note: '''line1\nline2''']\n}")
    })

    it('keeps a single-quoted column note when the note is single line', () => {
      const tables = makeTables([
        {
          name: 'User',
          dbName: null,
          fields: [
            {
              name: 'bio',
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
              documentation: 'a single line',
            },
          ],
          primaryKey: null,
          uniqueFields: [],
          uniqueIndexes: [],
          isGenerated: false,
        } as DMMF.Model,
      ])
      expect(tables[0]).toBe("Table User {\n  bio String [not null, note: 'a single line']\n}")
    })

    it('escapes backslash before apostrophe in a triple-quoted column note', () => {
      const tables = makeTables([
        {
          name: 'User',
          dbName: null,
          fields: [
            {
              name: 'bio',
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
              documentation: 'a\\nb\nc',
            },
          ],
          primaryKey: null,
          uniqueFields: [],
          uniqueIndexes: [],
          isGenerated: false,
        } as DMMF.Model,
      ])
      expect(tables[0]).toBe("Table User {\n  bio String [not null, note: '''a\\\\nb\nc''']\n}")
    })

    it('escapes embedded triple quotes in a multiline column note', () => {
      const tables = makeTables([
        {
          name: 'User',
          dbName: null,
          fields: [
            {
              name: 'bio',
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
              documentation: "x'''y\nz",
            },
          ],
          primaryKey: null,
          uniqueFields: [],
          uniqueIndexes: [],
          isGenerated: false,
        } as DMMF.Model,
      ])
      expect(tables[0]).toBe("Table User {\n  bio String [not null, note: '''x\\'\\'\\'y\nz''']\n}")
    })

    it('emits a triple-quoted table Note when the model documentation contains a newline', () => {
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
            },
          ],
          primaryKey: null,
          uniqueFields: [],
          uniqueIndexes: [],
          isGenerated: false,
          documentation: 'Account\nmulti line note',
        } as DMMF.Model,
      ])
      expect(tables[0]).toBe(
        "Table User {\n  id String [pk]\n\n  Note: '''Account\nmulti line note'''\n}",
      )
    })

    it('escapes an apostrophe once in a multiline table Note', () => {
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
            },
          ],
          primaryKey: null,
          uniqueFields: [],
          uniqueIndexes: [],
          isGenerated: false,
          documentation: "user's\nnote",
        } as DMMF.Model,
      ])
      expect(tables[0]).toBe("Table User {\n  id String [pk]\n\n  Note: '''user\\'s\nnote'''\n}")
    })

    it('keeps a single-quoted table Note when the model documentation is single line', () => {
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
            },
          ],
          primaryKey: null,
          uniqueFields: [],
          uniqueIndexes: [],
          isGenerated: false,
          documentation: 'Account note',
        } as DMMF.Model,
      ])
      expect(tables[0]).toBe("Table User {\n  id String [pk]\n\n  Note: 'Account note'\n}")
    })
  })

  describe('relation field exclusion', () => {
    it('drops object relation navigation fields but keeps the FK scalar column and Ref', () => {
      const result = dbmlContent({
        models: [
          makeModel({
            name: 'Reservation',
            fields: [
              makeField({ name: 'id', type: 'String', isId: true }),
              makeField({ name: 'roomId', type: 'String' }),
              makeField({
                name: 'room',
                type: 'Room',
                kind: 'object',
                relationName: 'ReservationToRoom',
                relationFromFields: ['roomId'],
                relationToFields: ['id'],
              }),
            ],
          }),
          makeModel({
            name: 'Room',
            fields: [
              makeField({ name: 'id', type: 'String', isId: true }),
              makeField({
                name: 'reservations',
                type: 'Reservation',
                kind: 'object',
                isList: true,
                isRequired: false,
                relationName: 'ReservationToRoom',
              }),
            ],
          }),
        ],
        enums: [],
        types: [],
      })
      expect(result).toBe(
        'Table Reservation {\n  id String [pk]\n  roomId String [not null]\n}\n\nTable Room {\n  id String [pk]\n}\n\nRef Reservation_roomId_fk: Reservation.roomId > Room.id',
      )
    })

    it('keeps scalar list columns (exclusion is by relationName, not isList)', () => {
      const tables = makeTables([
        makeModel({
          name: 'Post',
          fields: [
            makeField({ name: 'id', type: 'String', isId: true }),
            makeField({ name: 'tags', type: 'String', isList: true }),
            makeField({ name: 'userId', type: 'String' }),
            makeField({
              name: 'user',
              type: 'User',
              kind: 'object',
              relationName: 'PostToUser',
              relationFromFields: ['userId'],
              relationToFields: ['id'],
            }),
          ],
        }),
      ])
      expect(tables[0]).toBe(
        'Table Post {\n  id String [pk]\n  tags String[] [not null]\n  userId String [not null]\n}',
      )
    })

    it('keeps both scalar columns of a composite-key relation and drops the navigation field', () => {
      const tables = makeTables([
        makeModel({
          name: 'ReservationParticipant',
          fields: [
            makeField({ name: 'reservationId', type: 'String' }),
            makeField({ name: 'userId', type: 'String' }),
            makeField({
              name: 'reservation',
              type: 'Reservation',
              kind: 'object',
              relationName: 'ReservationParticipantToReservation',
              relationFromFields: ['reservationId'],
              relationToFields: ['id'],
            }),
          ],
          primaryKey: { fields: ['reservationId', 'userId'], name: null },
        }),
      ])
      expect(tables[0]).toBe(
        'Table ReservationParticipant {\n  reservationId String [not null]\n  userId String [not null]\n\n  indexes {\n    (reservationId, userId) [pk]\n  }\n}',
      )
    })

    it('excludes the same navigation fields as the Mermaid-ER generator', () => {
      const post = makeModel({
        name: 'Post',
        fields: [
          makeField({ name: 'id', type: 'String', isId: true }),
          makeField({ name: 'userId', type: 'String' }),
          makeField({
            name: 'user',
            type: 'User',
            kind: 'object',
            relationName: 'PostToUser',
            relationFromFields: ['userId'],
            relationToFields: ['id'],
          }),
        ],
      })
      expect(makeTables([post])[0]).toBe(
        'Table Post {\n  id String [pk]\n  userId String [not null]\n}',
      )
      expect(modelFields(post)).toStrictEqual(['        string id PK', '        string userId FK'])
    })
  })
})
