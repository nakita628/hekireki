import { describe, expect, it } from 'vite-plus/test'

import type { Schema } from '../../../server/routes/index.js'
import { localCompletions } from './completion.js'

const SCHEMA: Schema = {
  files: [],
  provider: null,
  models: [
    {
      name: 'User',
      dbName: null,
      documentation: null,
      annotations: [],
      fields: [
        {
          name: 'id',
          dbName: null,
          kind: 'scalar',
          type: 'Int',
          isList: false,
          isRequired: true,
          isId: true,
          isUnique: false,
          isUpdatedAt: false,
          isForeignKey: false,
          default: null,
          nativeType: null,
          documentation: null,
          annotations: [],
          relation: null,
          attributes: [],
        },
        {
          name: 'email',
          dbName: null,
          kind: 'scalar',
          type: 'String',
          isList: false,
          isRequired: true,
          isId: false,
          isUnique: true,
          isUpdatedAt: false,
          isForeignKey: false,
          default: null,
          nativeType: null,
          documentation: null,
          annotations: [],
          relation: null,
          attributes: [],
        },
        {
          name: 'posts',
          dbName: null,
          kind: 'object',
          type: 'Post',
          isList: true,
          isRequired: true,
          isId: false,
          isUnique: false,
          isUpdatedAt: false,
          isForeignKey: false,
          default: null,
          nativeType: null,
          documentation: null,
          annotations: [],
          relation: null,
          attributes: [],
        },
      ],
      primaryKey: null,
      indexes: [],
      attributes: [],
      location: null,
    },
  ],
  enums: [
    {
      name: 'Role',
      dbName: null,
      documentation: null,
      values: [
        { name: 'ADMIN', dbName: null },
        { name: 'VIEWER', dbName: null },
      ],
      location: null,
    },
  ],
  relations: [],
}

const TEXT = `model User {
  id Int @id
}

model Post {
  id Int @id
  role Role @default(
  authorId Int
  author User @relation(fields: [
}
`

function labels(text: string, cursorMarker: string) {
  const offset = text.indexOf(cursorMarker) + cursorMarker.length
  return localCompletions(text, offset, SCHEMA)?.options.map((o) => o.label) ?? null
}

describe('localCompletions', () => {
  it('offers block keywords at the top level only', () => {
    expect(labels('mod', 'mod')).toStrictEqual(['model', 'enum', 'datasource', 'generator'])
    expect(localCompletions('model User {\n  \n}\n', 14, SCHEMA)).toBeNull()
  })

  it('offers scalar types, models and enums in the type position', () => {
    expect(labels(TEXT, '  authorId ')).toStrictEqual([
      'String',
      'Int',
      'BigInt',
      'Float',
      'Decimal',
      'Boolean',
      'DateTime',
      'Json',
      'Bytes',
      'User',
      'Role',
    ])
  })

  it('offers field attributes after @ and block attributes after @@', () => {
    expect(labels('model A {\n  id Int @', '@')).toStrictEqual([
      '@id',
      '@unique',
      '@default',
      '@map',
      '@relation',
      '@updatedAt',
      '@db',
      '@ignore',
    ])
    expect(labels('model A {\n  @@', '@@')).toStrictEqual([
      '@@id',
      '@@unique',
      '@@index',
      '@@map',
      '@@schema',
      '@@fulltext',
      '@@ignore',
    ])
  })

  it('offers enum values before functions inside @default of an enum field', () => {
    expect(labels(TEXT, '@default(')?.slice(0, 4)).toStrictEqual([
      'ADMIN',
      'VIEWER',
      'autoincrement()',
      'now()',
    ])
  })

  it('offers relation arguments, own fields and referenced fields', () => {
    expect(labels('model A {\n  b B @relation(', '@relation(')).toStrictEqual([
      'fields',
      'references',
      'onDelete',
      'onUpdate',
      'name',
      'map',
    ])
    expect(labels(TEXT, 'fields: [')).toStrictEqual(['id', 'role', 'authorId'])
    expect(
      labels(
        'model Post {\n  author User @relation(fields: [authorId], references: [',
        'references: [',
      ),
    ).toStrictEqual(['id', 'email'])
    expect(
      labels(
        'model Post {\n  author User @relation(fields: [authorId], references: [id], onDelete: ',
        'onDelete: ',
      ),
    ).toStrictEqual(['Cascade', 'Restrict', 'NoAction', 'SetNull', 'SetDefault'])
  })

  it('anchors the replacement at the start of the current word', () => {
    const text = 'model A {\n  id In'
    expect(localCompletions(text, text.length, SCHEMA)?.from).toBe(text.length - 2)
    const attr = 'model A {\n  id Int @un'
    expect(localCompletions(attr, attr.length, SCHEMA)?.from).toBe(attr.length - 3)
  })

  it('stays quiet inside enums and on comment-only positions', () => {
    expect(localCompletions('enum Role {\n  AD', 15, SCHEMA)).toBeNull()
  })
})
