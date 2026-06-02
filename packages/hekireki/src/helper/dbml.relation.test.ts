import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import { dbmlContent } from '../generator/dbml.js'
import { annotatedDbmlRefs } from './dbml.js'

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
