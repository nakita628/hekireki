import type { DMMF } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
import type { GetDMMFError } from '@prisma/get-dmmf'
import { describe, expect, it } from 'vite-plus/test'

import { adviseChecks, storedValues } from './advice.js'
import { makeExpectedTables } from './tables.js'

function expected(schema: string, provider = 'postgresql') {
  const result: DMMF.Document | GetDMMFError = getDMMF({
    datamodel: [['schema.prisma', `datasource db {\n  provider = "${provider}"\n}\n${schema}`]],
  })
  if ('type' in result) throw new Error(result.error.message)
  return makeExpectedTables(result.datamodel)
}

function column(
  name: string,
  options: {
    readonly nullable?: boolean
    readonly dataType?: string
    readonly enumValues?: readonly string[] | null
  } = {},
) {
  return {
    name,
    nullable: options.nullable ?? true,
    dataType: options.dataType ?? 'text',
    columnType: null,
    enumValues: options.enumValues ?? null,
  }
}

/** One check of a model's field, as the report gives it. */
function check(kind: string, subject: string) {
  return { kind, model: subject.split('.')[0] ?? '', subject, what: kind }
}

const SCHEMA = `
enum Role {
  ADMIN
  WRITER
  VIEWER
}

model User {
  id          Int      @id
  email       String   @unique
  name        String
  nick        String?  @unique
  displayName String?
  role        Role     @default(VIEWER)
  token       String   @default(uuid())
  score       Int
  active      Boolean
  createdAt   DateTime @default(now())
  posts       Post[]
}

model Post {
  id       Int   @id
  slug     String @unique
  views    Int?
  authorId Int?
  author   User? @relation(fields: [authorId], references: [id])
  ownerId  Int
  owner    Owner @relation(fields: [ownerId], references: [id])
}

model Owner {
  id    Int    @id
  posts Post[]
}
`

const ACTUAL = [
  {
    schema: 'public',
    table: 'User',
    columns: [
      column('id', { dataType: 'integer', nullable: false }),
      column('email'),
      column('name'),
      column('nick'),
      column('nickname'),
      column('role', { dataType: 'USER-DEFINED', enumValues: ['ADMIN', 'EDITOR', 'VIEWER'] }),
      column('score', { dataType: 'integer' }),
      column('active', { dataType: 'boolean' }),
      column('createdAt', { dataType: 'timestamp without time zone' }),
    ],
  },
  {
    schema: 'public',
    table: 'Post',
    columns: [
      column('id', { dataType: 'integer', nullable: false }),
      column('views'),
      column('authorId', { dataType: 'integer' }),
      column('ownerId', { dataType: 'integer' }),
    ],
  },
]

function advise(
  checks: readonly ReturnType<typeof check>[],
  stored: ReadonlyMap<string, readonly string[]> = new Map(),
  dialect: 'postgresql' | 'mysql' | 'sqlite' = 'postgresql',
) {
  return adviseChecks({
    dialect,
    cockroach: false,
    expected: expected(SCHEMA),
    actual: ACTUAL,
    checks,
    stored,
  })
}

describe('adviseChecks', () => {
  it('fills a column that becomes required by its type, and a unique one from the key', () => {
    const [name, score, active, nick] = advise([
      check('not-null', 'User.name'),
      check('not-null', 'User.score'),
      check('not-null', 'User.active'),
      check('not-null', 'User.nick'),
    ])
    expect(name?.suggestion).toStrictEqual({ choice: 'value', value: '', reason: 'empty-string' })
    expect(score?.suggestion).toStrictEqual({ choice: 'value', value: '0', reason: 'zero' })
    expect(active?.suggestion).toStrictEqual({ choice: 'sql', value: 'FALSE', reason: 'false' })
    expect(nick?.suggestion).toStrictEqual({
      choice: 'sql',
      value: `'nick-' || "id"`,
      reason: 'from-key',
    })
    expect(name?.facts).toMatchObject({ model: 'User', field: 'name', type: 'String' })
  })

  it('fills an added column as its @default would: the literal, or a UUID the database makes', () => {
    const [role, token] = advise([
      check('column-added', 'User.role'),
      check('column-added', 'User.token'),
    ])
    expect(role?.suggestion).toStrictEqual({
      choice: 'value',
      value: 'VIEWER',
      reason: 'schema-default',
    })
    expect(role?.facts.default).toBe('VIEWER')
    expect(token?.suggestion).toStrictEqual({
      choice: 'sql',
      value: 'gen_random_uuid()::text',
      reason: 'uuid',
    })
    expect(
      advise([check('column-added', 'User.token')], new Map(), 'mysql')[0]?.suggestion,
    ).toMatchObject({ value: 'UUID()' })
  })

  it('reads a member gone and one come as a rename of it', () => {
    const [role] = advise(
      [check('enum', 'User.role')],
      new Map([['User.role', ['ADMIN', 'EDITOR', 'VIEWER']]]),
    )
    expect(role?.suggestion).toStrictEqual({
      choice: 'map',
      value: 'EDITOR=WRITER',
      reason: 'enum-replaced',
    })
    expect(role?.facts).toMatchObject({ enum: 'Role', removed: 'EDITOR', member: 'WRITER' })
  })

  it('moves the values of several members gone to the @default, when no one member replaces them', () => {
    const [role] = advise(
      [check('enum', 'User.role')],
      new Map([['User.role', ['ADMIN', 'EDITOR', 'GUEST', 'VIEWER', 'WRITER']]]),
    )
    expect(role?.suggestion).toStrictEqual({
      choice: 'map',
      value: 'EDITOR=VIEWER, GUEST=VIEWER',
      reason: 'enum-default',
    })
  })

  it('keeps the oldest of a group of duplicates, and empties the others where the key may be NULL', () => {
    const [email, nick] = advise([check('unique', 'User.email'), check('unique', 'User.nick')])
    expect(email?.suggestion).toStrictEqual({
      choice: 'keep-first-delete',
      value: 'createdAt',
      reason: 'oldest',
    })
    expect(nick?.suggestion).toMatchObject({ choice: 'keep-first-null', reason: 'oldest' })
  })

  it('clears the orphans of an optional relation, and deletes those of a required one', () => {
    const [author, owner] = advise([
      check('foreign-key', 'Post.author → User'),
      check('foreign-key', 'Post.owner → Owner'),
    ])
    expect(author?.suggestion).toMatchObject({ choice: 'null', reason: 'optional-relation' })
    expect(author?.facts.target).toBe('User')
    expect(owner?.suggestion).toMatchObject({ choice: 'delete', reason: 'required-relation' })
  })

  it('reads a dropped column as renamed to the column of its type the table gains', () => {
    const [nickname] = advise([check('column-dropped', 'User.nickname')])
    expect(nickname?.suggestion).toStrictEqual({
      choice: 'rename',
      value: 'displayName',
      reason: 'renamed',
    })
  })

  it('moves values spelled otherwise to the member of the same name, and the rest to the @default', () => {
    const [role] = advise(
      [check('enum', 'User.role')],
      new Map([['User.role', ['admin', 'Writer', 'guest', 'VIEWER']]]),
    )
    expect(role?.suggestion).toStrictEqual({
      choice: 'map',
      value: 'admin=ADMIN, Writer=WRITER, guest=VIEWER',
      reason: 'enum-same-name',
    })
    expect(role?.facts.member).toBe('VIEWER')
  })

  it('gives a column added to two dropped ones to the one it reads as, and not to both', () => {
    const facts = adviseChecks({
      dialect: 'sqlite',
      cockroach: false,
      expected: expected('model User {\n  id   Int    @id\n  name String\n}\n', 'sqlite'),
      actual: [
        {
          schema: null,
          table: 'User',
          columns: [
            column('id', { dataType: 'INTEGER', nullable: false }),
            column('fullName', { dataType: 'TEXT', nullable: false }),
            column('nickname', { dataType: 'TEXT' }),
          ],
        },
      ],
      checks: [check('column-dropped', 'User.fullName'), check('column-dropped', 'User.nickname')],
      stored: new Map(),
    })
    expect(facts.map((one) => one.suggestion)).toStrictEqual([
      { choice: 'rename', value: 'name', reason: 'renamed' },
      null,
    ])
  })

  it('fills a foreign key that becomes required with a row it can point at', () => {
    const [owner] = advise([check('not-null', 'Post.ownerId')])
    expect(owner?.suggestion).toStrictEqual({
      choice: 'sql',
      value: '(SELECT MIN("id") FROM "Owner")',
      reason: 'first-referenced',
    })
    expect(owner?.facts.target).toBe('Owner')
  })

  it('reads a column a related model gains under the same name as moved there', () => {
    const facts = adviseChecks({
      dialect: 'sqlite',
      cockroach: false,
      expected: expected(
        'model User {\n  id      Int      @id\n  profile Profile?\n}\n\nmodel Profile {\n  id     Int     @id\n  userId Int     @unique\n  user   User    @relation(fields: [userId], references: [id])\n  bio    String?\n}\n',
        'sqlite',
      ),
      actual: [
        {
          schema: null,
          table: 'User',
          columns: [
            column('id', { dataType: 'INTEGER', nullable: false }),
            column('bio', { dataType: 'TEXT' }),
          ],
        },
      ],
      checks: [check('column-dropped', 'User.bio')],
      stored: new Map(),
    })
    expect(facts[0]?.suggestion).toStrictEqual({
      choice: 'move',
      value: 'Profile.bio',
      reason: 'moved',
    })
    expect(facts[0]?.facts.movedTo).toBe('Profile.bio')
    // The places to complete the decision with come with the suggestion too.
    expect(facts[0]?.destinations.map((place) => place.value)).toStrictEqual(['Profile.bio'])
  })

  it('ranks every place a dropped column could have gone, and suggests none of two alike', () => {
    const [bio] = adviseChecks({
      dialect: 'sqlite',
      cockroach: false,
      expected: expected(
        'model User {\n  id      Int      @id\n  bioText String?\n  profile Profile?\n}\n\nmodel Profile {\n  id        Int     @id\n  userId    Int     @unique\n  user      User    @relation(fields: [userId], references: [id])\n  biography String?\n  score     Int?\n}\n',
        'sqlite',
      ),
      actual: [
        {
          schema: null,
          table: 'User',
          columns: [
            column('id', { dataType: 'INTEGER', nullable: false }),
            column('bio', { dataType: 'TEXT' }),
          ],
        },
      ],
      checks: [check('column-dropped', 'User.bio')],
      stored: new Map(),
    })
    // Text does not become a number by name alone: score is no place for it.
    expect(bio?.candidates).toStrictEqual([
      { choice: 'rename', value: 'bioText', reason: 'similar-name' },
      { choice: 'move', value: 'Profile.biography', reason: 'similar-name-related' },
    ])
    expect(bio?.suggestion).toBeNull()
    // Every place is there to complete a decision with, whatever its name, and how it relates.
    expect(bio?.destinations).toStrictEqual([
      {
        choice: 'rename',
        value: 'bioText',
        type: 'String',
        fits: true,
        relation: 'same',
        via: null,
        created: false,
      },
      {
        choice: 'move',
        value: 'Profile.biography',
        type: 'String',
        fits: true,
        relation: 'points-here',
        via: 'Profile.userId → User.id',
        created: true,
      },
      {
        choice: 'move',
        value: 'Profile.score',
        type: 'Int',
        fits: false,
        relation: 'points-here',
        via: 'Profile.userId → User.id',
        created: true,
      },
    ])
  })

  it('suggests nothing for a dropped column with nothing to have become', () => {
    const [views] = advise([check('column-dropped', 'Post.views')])
    expect(views?.suggestion).toBeNull()
    expect(views?.candidates).toStrictEqual([])
    expect(views?.facts.column).toBe('views')
  })

  it('converts text to a number with the cast of each database, blanks read as NULL', () => {
    const cast = (dialect: 'postgresql' | 'mysql' | 'sqlite') =>
      advise([check('column-recreated', 'Post.views')], new Map(), dialect)[0]
    expect(cast('postgresql')?.suggestion).toStrictEqual({
      choice: 'sql',
      value: `CAST(NULLIF(TRIM("views"), '') AS INTEGER)`,
      reason: 'convert-number',
    })
    expect(cast('postgresql')?.facts).toMatchObject({ from: 'text', to: 'Int' })
    expect(cast('mysql')?.suggestion?.value).toBe("CAST(NULLIF(TRIM(`views`), '') AS SIGNED)")
  })

  it('says what becomes of a value the new type refuses, by whether the column may be empty', () => {
    const [range, long, views, score] = advise([
      check('value-out-of-range', 'User.score'),
      check('value-too-long', 'User.email'),
      check('value-not-convertible', 'Post.views'),
      check('value-not-convertible', 'User.score'),
    ])
    expect(range?.suggestion?.choice).toBe('clamp')
    expect(long?.suggestion?.choice).toBe('truncate')
    expect(views?.suggestion?.choice).toBe('null')
    expect(score?.suggestion?.choice).toBe('delete')
  })
})

describe('storedValues', () => {
  it('reads the distinct values a column holds, NULLs aside', () => {
    expect(storedValues('postgresql', { schema: 'app', table: 'User' }, 'role')).toStrictEqual({
      sql: 'SELECT DISTINCT "role" AS "value" FROM "app"."User" WHERE "role" IS NOT NULL LIMIT 100',
      params: [],
    })
  })
})
