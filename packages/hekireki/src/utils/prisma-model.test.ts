import type { DMMF } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
import { describe, expect, it } from 'vite-plus/test'

import {
  isAutoincrement,
  isFunctionDefault,
  isImplicitManyToMany,
  isJoinSideA,
  isNowDefault,
  isUlidDefault,
  primaryKeyFields,
  relationEnds,
  uuidDefaultVersion,
} from './prisma-model.js'

function fieldWith(type: string, def: DMMF.Field['default']): DMMF.Field {
  return {
    name: 'value',
    kind: 'scalar',
    type,
    isList: false,
    isRequired: true,
    isUnique: false,
    isId: false,
    isReadOnly: false,
    isGenerated: false,
    isUpdatedAt: false,
    hasDefaultValue: def !== undefined,
    ...(def === undefined ? {} : { default: def }),
  }
}

/** The entry of that name, which the fixture has. */
function named<T extends { readonly name: string }>(items: readonly T[], name: string): T {
  const item = items.find((entry) => entry.name === name)
  if (item === undefined) throw new Error(`fixture: no ${name}`)
  return item
}

/** What a relation end says: its kind, its field, the field at its other end, and for a
 * many-to-many which side of the join table it is. */
function endSummary(end: ReturnType<typeof relationEnds>[number]) {
  if (end.kind === 'manyToMany') {
    return {
      kind: end.kind,
      field: end.field.name,
      inverse: end.inverse.name,
      isSideA: end.isSideA,
    }
  }
  return { kind: end.kind, field: end.field.name, inverse: end.inverse?.name ?? null }
}

// DMMF carries a default as a function call (`{ name, args }`), a list, or a plain value.
describe('isFunctionDefault', () => {
  it.each([
    [{ name: 'now', args: [] }, true],
    [['a', 'b'], false],
    ['text', false],
    [3, false],
    [undefined, false],
  ])('%j: %s', (def, expected) => {
    expect(isFunctionDefault(def)).toBe(expected)
  })
})

describe('what a default asks for', () => {
  it.each([
    [
      'Int',
      { name: 'autoincrement', args: [] },
      { autoincrement: true, now: false, uuid: null, ulid: false },
    ],
    [
      'DateTime',
      { name: 'now', args: [] },
      { autoincrement: false, now: true, uuid: null, ulid: false },
    ],
    // `now()` is only the time of the insert on a DateTime.
    [
      'String',
      { name: 'now', args: [] },
      { autoincrement: false, now: false, uuid: null, ulid: false },
    ],
    [
      'String',
      { name: 'uuid', args: [] },
      { autoincrement: false, now: false, uuid: 4, ulid: false },
    ],
    [
      'String',
      { name: 'uuid', args: [4] },
      { autoincrement: false, now: false, uuid: 4, ulid: false },
    ],
    [
      'String',
      { name: 'uuid', args: [7] },
      { autoincrement: false, now: false, uuid: 7, ulid: false },
    ],
    [
      'String',
      { name: 'ulid', args: [] },
      { autoincrement: false, now: false, uuid: null, ulid: true },
    ],
    [
      'String',
      { name: 'cuid', args: [] },
      { autoincrement: false, now: false, uuid: null, ulid: false },
    ],
    ['String', 'text', { autoincrement: false, now: false, uuid: null, ulid: false }],
  ])('%s @default(%j)', (type, def, expected) => {
    const field = fieldWith(type, def)
    expect({
      autoincrement: isAutoincrement(field),
      now: isNowDefault(field),
      uuid: uuidDefaultVersion(field),
      ulid: isUlidDefault(field),
    }).toStrictEqual(expected)
  })
})

describe('primaryKeyFields', () => {
  const result = getDMMF({
    datamodel: [
      [
        'schema.prisma',
        `datasource db {
  provider = "postgresql"
}
model WithId {
  code String @unique
  id   Int    @id
}
model WithCompositeId {
  a Int
  b Int
  @@id([a, b])
}
model WithUnique {
  nickname String? @unique
  token    String  @unique
  email    String  @unique
}
model WithCompoundUnique {
  identifier String
  token      String
  @@unique([identifier, token])
}
`,
      ],
    ],
  })
  if ('type' in result) throw new Error(result.error.message)
  const models = result.datamodel.models

  it.each([
    ['WithId', ['id']],
    ['WithCompositeId', ['a', 'b']],
    ['WithUnique', ['token']],
    ['WithCompoundUnique', ['identifier', 'token']],
  ])('%s: %j', (name, expected) => {
    expect(primaryKeyFields(named(models, name))).toStrictEqual(expected)
  })
})

describe('isImplicitManyToMany', () => {
  const result = getDMMF({
    datamodel: [
      [
        'schema.prisma',
        `datasource db {
  provider = "postgresql"
}
model Employee {
  id        Int        @id
  reports   Employee[] @relation("Mgr")
  managerId Int?
  manager   Employee?  @relation("Mgr", fields: [managerId], references: [id])
  friends   Employee[] @relation("Friends")
  friendOf  Employee[] @relation("Friends")
}
`,
      ],
    ],
  })
  if ('type' in result) throw new Error(result.error.message)
  const models = result.datamodel.models
  const [employee] = models
  if (employee === undefined) throw new Error('fixture')

  it.each([
    ['reports', false],
    ['manager', false],
    ['friends', true],
    ['friendOf', true],
  ])('%s: %s', (name, expected) => {
    expect(isImplicitManyToMany(named(employee.fields, name), employee, models)).toBe(expected)
  })
})

describe('isJoinSideA', () => {
  const result = getDMMF({
    datamodel: [
      [
        'schema.prisma',
        `datasource db {
  provider = "postgresql"
}
model User {
  id         Int    @id
  zFollowers User[] @relation("Follow")
  aFollowing User[] @relation("Follow")
  tags       Tag[]
}
model Tag {
  id    Int    @id
  users User[]
}
`,
      ],
    ],
  })
  if ('type' in result) throw new Error(result.error.message)
  const models = result.datamodel.models

  // Prisma's `_Follow` and `_TagToUser`: `A` is the model that sorts first, and in a self-relation
  // the field that sorts first.
  it.each([
    ['User', 'aFollowing', 'zFollowers', true],
    ['User', 'zFollowers', 'aFollowing', false],
    ['Tag', 'users', 'tags', true],
    ['User', 'tags', 'users', false],
  ])('%s.%s: %s', (modelName, fieldName, inverseName, expected) => {
    const owner = named(models, modelName)
    const field = named(owner.fields, fieldName)
    const inverse = named(
      models.flatMap((m) => m.fields),
      inverseName,
    )
    expect(isJoinSideA(field, owner, inverse)).toBe(expected)
  })
})

describe('relationEnds', () => {
  const result = getDMMF({
    datamodel: [
      [
        'schema.prisma',
        `datasource db {
  provider = "postgresql"
}
model User {
  id        Int    @id
  reports   User[] @relation("management")
  managerId Int?
  manager   User?  @relation("management", fields: [managerId], references: [id])
  profile   Profile?
  tags      Tag[]
}
model Profile {
  id     Int  @id
  userId Int  @unique
  user   User @relation(fields: [userId], references: [id])
}
model Tag {
  id    Int    @id
  users User[]
}
`,
      ],
    ],
  })
  if ('type' in result) throw new Error(result.error.message)
  const { models } = result.datamodel

  it('names each relation field of a model, in declaration order, with its other end', () => {
    expect(relationEnds(named(models, 'User'), models).map(endSummary)).toStrictEqual([
      { kind: 'hasMany', field: 'reports', inverse: 'manager' },
      { kind: 'belongsTo', field: 'manager', inverse: 'reports' },
      { kind: 'hasOne', field: 'profile', inverse: 'user' },
      { kind: 'manyToMany', field: 'tags', inverse: 'users', isSideA: false },
    ])
  })
})
