import type { DMMF } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
import type { GetDMMFError } from '@prisma/get-dmmf'
import { Effect } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import { fieldDefault, makeSeedPlan } from './plan.js'
import type { SeedTable } from './plan.js'

function parse(text: string) {
  const result: DMMF.Document | GetDMMFError = getDMMF({ datamodel: [['schema.prisma', text]] })
  if ('type' in result) throw new Error(result.error.message)
  return result.datamodel
}

function datamodel(schema: string) {
  return parse(`datasource db {\n  provider = "postgresql"\n}\n${schema}`)
}

function asModel(table: SeedTable | undefined) {
  if (table?.kind !== 'model') throw new Error('model table expected')
  return table
}

function modelNamed(tables: readonly SeedTable[], name: string) {
  return asModel(tables.find((table) => table.name === name))
}

function fieldNamed(model: DMMF.Model | undefined, name: string) {
  const found = model?.fields.find((f) => f.name === name)
  if (found === undefined) throw new Error(`no field ${name}`)
  return found
}

/** Three models whose required keys run in a circle, the last one optional when asked. */
function threeWayCycle(optional: boolean) {
  const mark = optional ? '?' : ''
  return `
model A {
  id  Int @id
  bId Int
  b   B   @relation("ab", fields: [bId], references: [id])
  cs  C[] @relation("ca")
}

model B {
  id  Int @id
  cId Int
  c   C   @relation("bc", fields: [cId], references: [id])
  as  A[] @relation("ab")
}

model C {
  id  Int  @id
  aId Int${mark}
  a   A${mark}   @relation("ca", fields: [aId], references: [id])
  bs  B[]  @relation("bc")
}
`
}

const SCHEMA = `
enum Visibility {
  PUBLIC  @map("public")
  PRIVATE @map("private")
}

model Comment {
  id       Int    @id @default(autoincrement())
  body     String
  postId   Int
  post     Post   @relation(fields: [postId], references: [id])
  authorId String?
  author   User?  @relation(fields: [authorId], references: [id])
}

model Post {
  id         Int        @id @default(autoincrement())
  title      String
  visibility Visibility @default(PUBLIC)
  authorId   String     @map("author_id")
  author     User       @relation(fields: [authorId], references: [id])
  tags       Tag[]
  comments   Comment[]
  loggedAt   DateTime   @default(dbgenerated("now()"))

  @@map("posts")
}

model Tag {
  id    Int    @id @default(autoincrement())
  label String @unique
  posts Post[]
}

model User {
  id       String    @id @default(uuid(7))
  email    String    @unique
  posts    Post[]
  comments Comment[]
  profile  Profile?
  parentId String?
  parent   User?     @relation("tree", fields: [parentId], references: [id])
  children User[]    @relation("tree")

  @@unique([parentId, email])
}

model Profile {
  id     Int    @id @default(autoincrement())
  userId String @unique
  user   User   @relation(fields: [userId], references: [id])
}

model Actor {
  id    Int    @id @default(autoincrement())
  films Film[] @relation("cast")
}

model Film {
  id     Int     @id @default(autoincrement())
  actors Actor[] @relation("cast")
}
`

describe('makeSeedPlan', () => {
  const tables = Effect.runSync(makeSeedPlan(datamodel(SCHEMA)))

  it('orders every model after the models its foreign keys point at, then the join tables', () => {
    expect(tables.map((table) => table.name)).toStrictEqual([
      'User',
      'Post',
      'Comment',
      'Tag',
      'Profile',
      'Actor',
      'Film',
      '_PostToTag',
      '_cast',
    ])
  })

  it('maps @@map and @map to table and column names, and leaves dbgenerated columns to the database', () => {
    const post = modelNamed(tables, 'Post')
    expect(post.table).toBe('posts')
    expect(post.columns).toStrictEqual([
      { field: 'id', column: 'id', type: 'Int', kind: 'scalar', isList: false, enumValues: null },
      {
        field: 'title',
        column: 'title',
        type: 'String',
        kind: 'scalar',
        isList: false,
        enumValues: null,
      },
      {
        field: 'visibility',
        column: 'visibility',
        type: 'Visibility',
        kind: 'enum',
        isList: false,
        enumValues: [
          { name: 'PUBLIC', dbName: 'public' },
          { name: 'PRIVATE', dbName: 'private' },
        ],
      },
      {
        field: 'authorId',
        column: 'author_id',
        type: 'String',
        kind: 'scalar',
        isList: false,
        enumValues: null,
      },
    ])
    expect(post.autoincrement).toStrictEqual(['id'])
  })

  it('describes each foreign key: required, one-to-one and self', () => {
    const comment = modelNamed(tables, 'Comment')
    const profile = modelNamed(tables, 'Profile')
    const user = modelNamed(tables, 'User')
    expect(comment.foreignKeys).toStrictEqual([
      {
        field: 'post',
        fromFields: ['postId'],
        toModel: 'Post',
        toFields: ['id'],
        required: true,
        oneToOne: false,
        self: false,
      },
      {
        field: 'author',
        fromFields: ['authorId'],
        toModel: 'User',
        toFields: ['id'],
        required: false,
        oneToOne: false,
        self: false,
      },
    ])
    expect(profile.foreignKeys).toStrictEqual([
      {
        field: 'user',
        fromFields: ['userId'],
        toModel: 'User',
        toFields: ['id'],
        required: true,
        oneToOne: true,
        self: false,
      },
    ])
    expect(user.foreignKeys).toStrictEqual([
      {
        field: 'parent',
        fromFields: ['parentId'],
        toModel: 'User',
        toFields: ['id'],
        required: false,
        oneToOne: false,
        self: true,
      },
    ])
  })

  it('collects @id, @unique, @@id and @@unique as unique constraints, once each', () => {
    const user = modelNamed(tables, 'User')
    expect(user.uniques).toStrictEqual([['id'], ['email'], ['parentId', 'email']])
  })

  it('names the implicit many-to-many join tables as Prisma does, A before B', () => {
    const joins = tables.filter((table) => table.kind === 'join')
    expect(
      joins.map((join) => [join.table, join.sides[0].model, join.sides[1].model]),
    ).toStrictEqual([
      ['_PostToTag', 'Post', 'Tag'],
      ['_cast', 'Actor', 'Film'],
    ])
    expect(joins[0]?.sides[0]).toStrictEqual({
      model: 'Post',
      field: 'tags',
      idField: 'id',
      column: 'A',
      type: 'Int',
      kind: 'scalar',
      enumValues: null,
    })
  })

  it('leaves an optional foreign key to break a cycle, and rejects a required one', () => {
    const optional = Effect.runSync(
      makeSeedPlan(
        datamodel(`
model A {
  id  Int  @id @default(autoincrement())
  bId Int?
  b   B?   @relation("ab", fields: [bId], references: [id])
  bs  B[]  @relation("ba")
}

model B {
  id  Int @id @default(autoincrement())
  aId Int
  a   A   @relation("ba", fields: [aId], references: [id])
  as  A[] @relation("ab")
}
`),
      ),
    )
    expect(optional.map((table) => table.name)).toStrictEqual(['A', 'B'])

    const required = Effect.runSync(
      Effect.flip(
        makeSeedPlan(
          datamodel(`
model A {
  id  Int @id @default(autoincrement())
  bId Int
  b   B   @relation("ab", fields: [bId], references: [id])
  bs  B[] @relation("ba")
}

model B {
  id  Int @id @default(autoincrement())
  aId Int
  a   A   @relation("ba", fields: [aId], references: [id])
  as  A[] @relation("ab")
}
`),
        ),
      ),
    )
    expect(required.message).toBe(
      'Required relations form a cycle: A -> B -> A.\n   Make one of them optional so the seeder can insert the models in order.',
    )
  })
})

describe('fieldDefault', () => {
  it('reads a function default and ignores a literal one', () => {
    const [post, user] = datamodel(SCHEMA).models.filter((m) => ['Post', 'User'].includes(m.name))
    expect(fieldDefault(fieldNamed(post, 'visibility'))).toBeNull()
    expect(fieldDefault(fieldNamed(user, 'id'))).toStrictEqual({ name: 'uuid', args: [7] })
  })
})

describe('makeSeedPlan, the shapes it has to get right', () => {
  it('orders a diamond so every model follows all of its parents, whatever the schema order', () => {
    const tables = Effect.runSync(
      makeSeedPlan(
        datamodel(`
model D {
  id  Int @id @default(autoincrement())
  bId Int
  b   B   @relation(fields: [bId], references: [id])
  cId Int
  c   C   @relation(fields: [cId], references: [id])
}

model C {
  id  Int @id @default(autoincrement())
  aId Int
  a   A   @relation(fields: [aId], references: [id])
  ds  D[]
}

model B {
  id  Int @id @default(autoincrement())
  aId Int
  a   A   @relation(fields: [aId], references: [id])
  ds  D[]
}

model A {
  id Int @id @default(autoincrement())
  bs B[]
  cs C[]
}
`),
      ),
    )
    expect(tables.map((table) => table.name)).toStrictEqual(['A', 'B', 'C', 'D'])
  })

  it('names every model of a three-way required cycle, and breaks it at one optional key', () => {
    expect(Effect.runSync(Effect.flip(makeSeedPlan(datamodel(threeWayCycle(false))))).message).toBe(
      'Required relations form a cycle: A -> B -> C -> A.\n   Make one of them optional so the seeder can insert the models in order.',
    )
    expect(
      Effect.runSync(makeSeedPlan(datamodel(threeWayCycle(true)))).map((table) => table.name),
    ).toStrictEqual(['C', 'B', 'A'])
  })

  it('leaves out what cannot be seeded and keeps composite keys, mapped uniques and self many-to-many', () => {
    const tables = Effect.runSync(
      makeSeedPlan(
        datamodel(`
enum Role {
  ADMIN
  VIEWER @map("viewer")
}

model Warehouse {
  country String
  code    String
  stocks  Stock[]

  @@id([country, code])
}

model Stock {
  id        Int       @id @default(autoincrement())
  country   String
  code      String
  warehouse Warehouse @relation(fields: [country, code], references: [country, code])
  note      Unsupported("geometry")?
  secret    String    @ignore
  slug      String?   @unique
  a         Int
  b         Int
  roles     Role[]
  meta      Json?

  @@unique([a, b], map: "ab_key")
}

model Ghost {
  id Int @id

  @@ignore
}

model Category {
  id        Int        @id @default(autoincrement())
  related   Category[] @relation("rel")
  relatedBy Category[] @relation("rel")
}
`),
      ),
    )
    expect(tables.map((table) => table.name)).toStrictEqual([
      'Warehouse',
      'Stock',
      'Category',
      '_rel',
    ])
    const [warehouse, stock, , rel] = tables
    expect(asModel(warehouse).uniques).toStrictEqual([['country', 'code']])
    expect(asModel(warehouse).autoincrement).toStrictEqual([])
    expect(asModel(stock).columns.map((c) => c.field)).toStrictEqual([
      'id',
      'country',
      'code',
      'slug',
      'a',
      'b',
      'roles',
      'meta',
    ])
    expect(asModel(stock).columns.find((c) => c.field === 'roles')).toStrictEqual({
      field: 'roles',
      column: 'roles',
      type: 'Role',
      kind: 'enum',
      isList: true,
      enumValues: [
        { name: 'ADMIN', dbName: 'ADMIN' },
        { name: 'VIEWER', dbName: 'viewer' },
      ],
    })
    expect(asModel(stock).foreignKeys).toStrictEqual([
      {
        field: 'warehouse',
        fromFields: ['country', 'code'],
        toModel: 'Warehouse',
        toFields: ['country', 'code'],
        required: true,
        oneToOne: false,
        self: false,
      },
    ])
    expect(asModel(stock).uniques).toStrictEqual([['id'], ['slug'], ['a', 'b']])
    expect(rel).toStrictEqual({
      kind: 'join',
      name: '_rel',
      table: '_rel',
      schema: null,
      sides: [
        {
          model: 'Category',
          field: 'related',
          idField: 'id',
          column: 'A',
          type: 'Int',
          kind: 'scalar',
          enumValues: null,
        },
        {
          model: 'Category',
          field: 'relatedBy',
          idField: 'id',
          column: 'B',
          type: 'Int',
          kind: 'scalar',
          enumValues: null,
        },
      ],
    })
  })

  it('carries the @@schema and @@map of a model into the table it writes to', () => {
    const parsed = parse(`datasource db {
  provider = "postgresql"
  schemas  = ["inventory", "public"]
}

model Item {
  id Int @id

  @@schema("inventory")
  @@map("items")
}
`)
    const [item] = Effect.runSync(makeSeedPlan(parsed))
    expect({ table: asModel(item).table, schema: asModel(item).schema }).toStrictEqual({
      table: 'items',
      schema: 'inventory',
    })
  })

  it('reads every function default with its arguments, and nothing for literals and dbgenerated', () => {
    const fields = datamodel(`
model Defaults {
  id    String   @id @default(cuid(2))
  n     String   @default(nanoid(12))
  u     String   @default(uuid())
  l     String   @default(ulid())
  seq   Int      @default(autoincrement())
  at    DateTime @default(now())
  text  String   @default("hello")
  flag  Boolean  @default(true)
  count Int      @default(0)
  gen   DateTime @default(dbgenerated("now()"))
  up    DateTime @updatedAt
}
`).models.flatMap((model) => model.fields)
    const defaults = Object.fromEntries(fields.map((field) => [field.name, fieldDefault(field)]))
    expect(defaults).toStrictEqual({
      id: { name: 'cuid', args: [2] },
      n: { name: 'nanoid', args: [12] },
      u: { name: 'uuid', args: [4] },
      l: { name: 'ulid', args: [] },
      seq: { name: 'autoincrement', args: [] },
      at: { name: 'now', args: [] },
      text: null,
      flag: null,
      count: null,
      gen: { name: 'dbgenerated', args: ['now()'] },
      up: null,
    })
  })
})
