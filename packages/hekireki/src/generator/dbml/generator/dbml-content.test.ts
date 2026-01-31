import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vitest'
import { dbmlContent, generateEnums, generateRelations, generateTables } from './dbml-content.js'

describe('generateTables', () => {
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

    const result = generateTables(models)

    expect(result[0]).toContain('Table User {')
    expect(result[0]).toContain('id Int [pk, increment]')
    expect(result[0]).toContain('name String [not null]')
    expect(result[0]).toContain('}')
  })

  it('includes field documentation as notes', () => {
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
            documentation: "User's email address",
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

    const result = generateTables(models)

    expect(result[0]).toContain("email String [unique, not null, note: 'User\\'s email address']")
  })
})

describe('generateEnums', () => {
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

    const result = generateEnums(enums)

    expect(result[0]).toContain('Enum Role {')
    expect(result[0]).toContain('USER')
    expect(result[0]).toContain('ADMIN')
    expect(result[0]).toContain('}')
  })
})

describe('generateRelations', () => {
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

    const result = generateRelations(models)

    expect(result[0]).toContain('Ref Post_userId_fk: Post.userId > User.id')
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

    const result = dbmlContent(datamodel)

    expect(result).not.toContain('THIS FILE WAS AUTOMATICALLY GENERATED')
    expect(result).toContain('Table User {')
    expect(result).toContain('id Int [pk, increment]')
  })
})
