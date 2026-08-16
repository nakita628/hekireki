import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import { kyselySchema } from './kysely.js'

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

function makeDatamodel(models: DMMF.Model[], enums: DMMF.DatamodelEnum[] = []): DMMF.Datamodel {
  return { models, enums, types: [], indexes: [] }
}

describe('kyselySchema', () => {
  it('should generate basic User + Post types with Generated and Timestamp', () => {
    const datamodel = makeDatamodel([
      makeModel({
        name: 'User',
        fields: [
          makeField({
            name: 'id',
            type: 'Int',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'autoincrement', args: [] },
          }),
          makeField({ name: 'name', type: 'String' }),
          makeField({ name: 'email', type: 'String', isUnique: true }),
          makeField({
            name: 'posts',
            kind: 'object',
            type: 'Post',
            isList: true,
            isRequired: false,
          }),
        ],
      }),
      makeModel({
        name: 'Post',
        fields: [
          makeField({
            name: 'id',
            type: 'Int',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'autoincrement', args: [] },
          }),
          makeField({ name: 'title', type: 'String' }),
          makeField({ name: 'content', type: 'String', isRequired: false }),
          makeField({ name: 'userId', type: 'Int' }),
          makeField({
            name: 'createdAt',
            type: 'DateTime',
            hasDefaultValue: true,
            default: { name: 'now', args: [] },
          }),
          makeField({
            name: 'author',
            kind: 'object',
            type: 'User',
            isList: false,
            isRequired: true,
            relationName: 'PostToUser',
            relationFromFields: ['userId'],
            relationToFields: ['id'],
          }),
        ],
      }),
    ])

    const result = kyselySchema(datamodel)

    expect(result).toBe(
      "import type { ColumnType } from 'kysely'\n\nexport type Generated<T> = T extends ColumnType<infer S, infer I, infer U>\n  ? ColumnType<S, I | undefined, U>\n  : ColumnType<T, T | undefined, T>\n\nexport type Timestamp = ColumnType<Date, Date | string, Date | string>\n\nexport interface User {\n  id: Generated<number>\n  name: string\n  email: string\n}\n\nexport interface Post {\n  id: Generated<number>\n  title: string\n  content: string | null\n  userId: number\n  createdAt: Generated<Timestamp>\n}\n\nexport interface DB {\n  User: User\n  Post: Post\n}",
    )
  })

  it('should map every scalar type and honor @map/@@map database names', () => {
    const datamodel = makeDatamodel([
      makeModel({
        name: 'Account',
        dbName: 'accounts',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [] },
          }),
          makeField({ name: 'bigNum', type: 'BigInt' }),
          makeField({ name: 'price', type: 'Decimal' }),
          makeField({ name: 'data', type: 'Json' }),
          makeField({ name: 'meta', type: 'Json', isRequired: false }),
          makeField({ name: 'raw', type: 'Bytes' }),
          makeField({ name: 'ratio', type: 'Float' }),
          makeField({ name: 'flag', type: 'Boolean' }),
          makeField({ name: 'count', type: 'Int' }),
          makeField({
            name: 'createdAt',
            type: 'DateTime',
            dbName: 'created_at',
            hasDefaultValue: true,
            default: { name: 'now', args: [] },
          }),
          makeField({ name: 'tags', type: 'String', isList: true }),
        ],
      }),
    ])

    const result = kyselySchema(datamodel)

    expect(result).toBe(
      "import type { ColumnType } from 'kysely'\n\nexport type Generated<T> = T extends ColumnType<infer S, infer I, infer U>\n  ? ColumnType<S, I | undefined, U>\n  : ColumnType<T, T | undefined, T>\n\nexport type Timestamp = ColumnType<Date, Date | string, Date | string>\n\nexport interface Account {\n  id: Generated<string>\n  bigNum: bigint\n  price: string\n  data: unknown\n  meta: unknown\n  raw: Buffer\n  ratio: number\n  flag: boolean\n  count: number\n  created_at: Generated<Timestamp>\n  tags: string[]\n}\n\nexport interface DB {\n  accounts: Account\n}",
    )
  })

  it('should generate enum unions from @map-ped database values', () => {
    const datamodel = makeDatamodel(
      [
        makeModel({
          name: 'Board',
          fields: [
            makeField({
              name: 'id',
              type: 'Int',
              isId: true,
              hasDefaultValue: true,
              default: { name: 'autoincrement', args: [] },
            }),
            makeField({
              name: 'visibility',
              kind: 'enum',
              type: 'Visibility',
              hasDefaultValue: true,
              default: 'LINK_ONLY',
            }),
            makeField({ name: 'fallback', kind: 'enum', type: 'Visibility', isRequired: false }),
            makeField({ name: 'audiences', kind: 'enum', type: 'Visibility', isList: true }),
          ],
        }),
      ],
      [
        {
          name: 'Visibility',
          dbName: 'visibility_level',
          values: [
            { name: 'PUBLIC', dbName: 'public' },
            { name: 'PRIVATE', dbName: 'private' },
            { name: 'LINK_ONLY', dbName: 'link_only' },
          ],
        },
      ],
    )

    const result = kyselySchema(datamodel)

    expect(result).toBe(
      "import type { ColumnType } from 'kysely'\n\nexport type Generated<T> = T extends ColumnType<infer S, infer I, infer U>\n  ? ColumnType<S, I | undefined, U>\n  : ColumnType<T, T | undefined, T>\n\nexport type Visibility = 'public' | 'private' | 'link_only'\n\nexport interface Board {\n  id: Generated<number>\n  visibility: Generated<Visibility>\n  fallback: Visibility | null\n  audiences: Visibility[]\n}\n\nexport interface DB {\n  Board: Board\n}",
    )
  })

  it('should emit the implicit m2m join table with PK-typed A/B columns', () => {
    const datamodel = makeDatamodel([
      makeModel({
        name: 'Post',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [] },
          }),
          makeField({ name: 'title', type: 'String' }),
          makeField({
            name: 'tags',
            kind: 'object',
            type: 'Tag',
            isList: true,
            isRequired: false,
            relationName: 'PostToTag',
            relationFromFields: [],
            relationToFields: [],
          }),
        ],
      }),
      makeModel({
        name: 'Tag',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'uuid', args: [] },
          }),
          makeField({ name: 'label', type: 'String', isUnique: true }),
          makeField({
            name: 'posts',
            kind: 'object',
            type: 'Post',
            isList: true,
            isRequired: false,
            relationName: 'PostToTag',
            relationFromFields: [],
            relationToFields: [],
          }),
        ],
      }),
    ])

    const result = kyselySchema(datamodel)

    expect(result).toBe(
      "import type { ColumnType } from 'kysely'\n\nexport type Generated<T> = T extends ColumnType<infer S, infer I, infer U>\n  ? ColumnType<S, I | undefined, U>\n  : ColumnType<T, T | undefined, T>\n\nexport interface Post {\n  id: Generated<string>\n  title: string\n}\n\nexport interface Tag {\n  id: Generated<string>\n  label: string\n}\n\nexport interface PostToTag {\n  A: string\n  B: string\n}\n\nexport interface DB {\n  Post: Post\n  Tag: Tag\n  _PostToTag: PostToTag\n}",
    )
  })

  it('should PascalCase the interface of a named m2m relation while keeping the _table name', () => {
    const datamodel = makeDatamodel([
      makeModel({
        name: 'Actor',
        fields: [
          makeField({
            name: 'id',
            type: 'Int',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'autoincrement', args: [] },
          }),
          makeField({
            name: 'films',
            kind: 'object',
            type: 'Film',
            isList: true,
            isRequired: false,
            relationName: 'cast',
            relationFromFields: [],
            relationToFields: [],
          }),
        ],
      }),
      makeModel({
        name: 'Film',
        fields: [
          makeField({
            name: 'id',
            type: 'Int',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'autoincrement', args: [] },
          }),
          makeField({
            name: 'actors',
            kind: 'object',
            type: 'Actor',
            isList: true,
            isRequired: false,
            relationName: 'cast',
            relationFromFields: [],
            relationToFields: [],
          }),
        ],
      }),
    ])

    const result = kyselySchema(datamodel)

    expect(result).toBe(
      "import type { ColumnType } from 'kysely'\n\nexport type Generated<T> = T extends ColumnType<infer S, infer I, infer U>\n  ? ColumnType<S, I | undefined, U>\n  : ColumnType<T, T | undefined, T>\n\nexport interface Actor {\n  id: Generated<number>\n}\n\nexport interface Film {\n  id: Generated<number>\n}\n\nexport interface Cast {\n  A: number\n  B: number\n}\n\nexport interface DB {\n  Actor: Actor\n  Film: Film\n  _cast: Cast\n}",
    )
  })

  it('should wrap a nullable column with a default as Generated<T | null>', () => {
    const datamodel = makeDatamodel([
      makeModel({
        name: 'Profile',
        fields: [
          makeField({
            name: 'id',
            type: 'Int',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'autoincrement', args: [] },
          }),
          makeField({
            name: 'nickname',
            type: 'String',
            isRequired: false,
            hasDefaultValue: true,
            default: 'anonymous',
          }),
          makeField({
            name: 'deletedAt',
            type: 'DateTime',
            isRequired: false,
            hasDefaultValue: true,
            default: { name: 'now', args: [] },
          }),
        ],
      }),
    ])

    const result = kyselySchema(datamodel)

    expect(result).toBe(
      "import type { ColumnType } from 'kysely'\n\nexport type Generated<T> = T extends ColumnType<infer S, infer I, infer U>\n  ? ColumnType<S, I | undefined, U>\n  : ColumnType<T, T | undefined, T>\n\nexport type Timestamp = ColumnType<Date, Date | string, Date | string>\n\nexport interface Profile {\n  id: Generated<number>\n  nickname: Generated<string | null>\n  deletedAt: Generated<Timestamp | null>\n}\n\nexport interface DB {\n  Profile: Profile\n}",
    )
  })

  it('should quote column and table keys that are not valid identifiers', () => {
    const datamodel = makeDatamodel([
      makeModel({
        name: 'OrderItem',
        dbName: 'order-items',
        fields: [
          makeField({
            name: 'id',
            type: 'Int',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'autoincrement', args: [] },
          }),
          makeField({
            name: 'createdAt',
            type: 'DateTime',
            dbName: 'created-at',
            hasDefaultValue: true,
            default: { name: 'now', args: [] },
          }),
        ],
      }),
    ])

    const result = kyselySchema(datamodel)

    expect(result).toBe(
      "import type { ColumnType } from 'kysely'\n\nexport type Generated<T> = T extends ColumnType<infer S, infer I, infer U>\n  ? ColumnType<S, I | undefined, U>\n  : ColumnType<T, T | undefined, T>\n\nexport type Timestamp = ColumnType<Date, Date | string, Date | string>\n\nexport interface OrderItem {\n  id: Generated<number>\n  'created-at': Generated<Timestamp>\n}\n\nexport interface DB {\n  'order-items': OrderItem\n}",
    )
  })

  it('should omit an enum no model field references', () => {
    const datamodel = makeDatamodel(
      [
        makeModel({
          name: 'Note',
          fields: [
            makeField({
              name: 'id',
              type: 'Int',
              isId: true,
              hasDefaultValue: true,
              default: { name: 'autoincrement', args: [] },
            }),
            makeField({ name: 'title', type: 'String' }),
          ],
        }),
      ],
      [
        {
          name: 'Status',
          values: [
            { name: 'ACTIVE', dbName: null },
            { name: 'INACTIVE', dbName: null },
          ],
        },
      ],
    )

    const result = kyselySchema(datamodel)

    expect(result).toBe(
      "import type { ColumnType } from 'kysely'\n\nexport type Generated<T> = T extends ColumnType<infer S, infer I, infer U>\n  ? ColumnType<S, I | undefined, U>\n  : ColumnType<T, T | undefined, T>\n\nexport interface Note {\n  id: Generated<number>\n  title: string\n}\n\nexport interface DB {\n  Note: Note\n}",
    )
  })

  it('should emit a single join table for an implicit self m2m', () => {
    const datamodel = makeDatamodel([
      makeModel({
        name: 'Person',
        fields: [
          makeField({
            name: 'id',
            type: 'Int',
            isId: true,
            hasDefaultValue: true,
            default: { name: 'autoincrement', args: [] },
          }),
          makeField({
            name: 'friends',
            kind: 'object',
            type: 'Person',
            isList: true,
            isRequired: false,
            relationName: 'friends',
            relationFromFields: [],
            relationToFields: [],
          }),
          makeField({
            name: 'friendOf',
            kind: 'object',
            type: 'Person',
            isList: true,
            isRequired: false,
            relationName: 'friends',
            relationFromFields: [],
            relationToFields: [],
          }),
        ],
      }),
    ])

    const result = kyselySchema(datamodel)

    expect(result).toBe(
      "import type { ColumnType } from 'kysely'\n\nexport type Generated<T> = T extends ColumnType<infer S, infer I, infer U>\n  ? ColumnType<S, I | undefined, U>\n  : ColumnType<T, T | undefined, T>\n\nexport interface Person {\n  id: Generated<number>\n}\n\nexport interface Friends {\n  A: number\n  B: number\n}\n\nexport interface DB {\n  Person: Person\n  _friends: Friends\n}",
    )
  })

  it('should generate an empty DB interface for an empty datamodel', () => {
    const result = kyselySchema(makeDatamodel([]))

    expect(result).toBe('export interface DB {}')
  })

  it('should omit the kysely import when no column needs Generated or Timestamp', () => {
    const datamodel = makeDatamodel([
      makeModel({
        name: 'Follow',
        primaryKey: { name: null, fields: ['followerId', 'followingId'] },
        fields: [
          makeField({ name: 'followerId', type: 'String' }),
          makeField({ name: 'followingId', type: 'String' }),
        ],
      }),
    ])

    const result = kyselySchema(datamodel)

    expect(result).toBe(
      'export interface Follow {\n  followerId: string\n  followingId: string\n}\n\nexport interface DB {\n  Follow: Follow\n}',
    )
  })
})
