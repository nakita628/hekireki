import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import { dbmlContent } from '../generator/dbml.js'
import { makeEnums, makeRelations, makeTables } from './dbml.js'

// Test run
// pnpm vitest run ./src/generator/dbml/dbml.test.ts

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

describe('makeEnums', () => {
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
      'Ref Post_userId_fk: Post.userId > User.id [delete: Cascade]',
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
})

describe('dbmlContent', () => {
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
