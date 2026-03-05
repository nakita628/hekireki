import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vitest'
import { makeRelations, makeTables } from './dbml.js'

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
})
