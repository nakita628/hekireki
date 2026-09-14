import type { DMMF } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
import type { GetDMMFError } from '@prisma/get-dmmf'
import { Effect } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import { fieldDefault, makeSeedPlan } from './plan.js'

function datamodel(schema: string) {
  const result: DMMF.Document | GetDMMFError = getDMMF({
    datamodel: [['schema.prisma', `datasource db {\n  provider = "postgresql"\n}\n${schema}`]],
  })
  if ('type' in result) throw new Error(result.error.message)
  return result.datamodel
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
    const post = tables.find((table) => table.name === 'Post')
    expect(post?.kind).toBe('model')
    if (post?.kind !== 'model') return
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
    const byName = new Map(tables.map((table) => [table.name, table] as const))
    const comment = byName.get('Comment')
    const profile = byName.get('Profile')
    const user = byName.get('User')
    if (comment?.kind !== 'model' || profile?.kind !== 'model' || user?.kind !== 'model') {
      throw new Error('model tables expected')
    }
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
    const user = tables.find((table) => table.name === 'User')
    if (user?.kind !== 'model') throw new Error('model table expected')
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
    const visibility = post?.fields.find((f) => f.name === 'visibility')
    const id = user?.fields.find((f) => f.name === 'id')
    expect(visibility === undefined ? null : fieldDefault(visibility)).toBeNull()
    expect(id === undefined ? null : fieldDefault(id)).toStrictEqual({ name: 'uuid', args: [7] })
  })
})
