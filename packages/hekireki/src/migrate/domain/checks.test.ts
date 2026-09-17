import type { DMMF } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
import type { GetDMMFError } from '@prisma/get-dmmf'
import { describe, expect, it } from 'vite-plus/test'

import { makeChecks } from './checks.js'
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
    readonly columnType?: string | null
    readonly maxLength?: number | null
    readonly enumValues?: readonly string[] | null
  } = {},
) {
  return {
    name,
    nullable: options.nullable ?? false,
    dataType: options.dataType ?? 'text',
    columnType: options.columnType ?? null,
    maxLength: options.maxLength ?? null,
    precision: null,
    scale: null,
    datetimePrecision: null,
    enumValues: options.enumValues ?? null,
  }
}

const SCHEMA = `
enum Role {
  ADMIN
  VIEWER
}

model User {
  id    Int    @id
  email String @unique
  name  String
  role  Role
  bio   String
  posts Post[]
}

model Post {
  id       Int  @id
  authorId Int
  author   User @relation(fields: [authorId], references: [id])
}
`

describe('makeChecks', () => {
  it('asks each change of the schema a count query, PostgreSQL spelling', () => {
    const { checks, added } = makeChecks({
      dialect: 'postgresql',
      expected: expected(SCHEMA),
      actual: [
        {
          schema: 'public',
          table: 'User',
          columns: [
            column('id', { dataType: 'integer' }),
            column('email'),
            column('name', { nullable: true }),
            column('role', { dataType: 'USER-DEFINED', enumValues: ['ADMIN', 'EDITOR', 'VIEWER'] }),
            column('nickname', { nullable: true }),
          ],
          uniques: [['id']],
          foreignKeys: [],
        },
        {
          schema: 'public',
          table: 'Post',
          columns: [
            column('id', { dataType: 'integer' }),
            column('authorId', { dataType: 'integer' }),
          ],
          uniques: [['id']],
          foreignKeys: [],
        },
        {
          schema: 'public',
          table: 'Legacy',
          columns: [column('id')],
          uniques: [],
          foreignKeys: [],
        },
      ],
      defaultSchema: 'public',
      mariadb: false,
    })
    expect(added).toStrictEqual([])
    expect(
      checks.map((check) => [check.kind, check.subject, check.guaranteed, check.statement.sql]),
    ).toStrictEqual([
      ['not-null', 'User.id', true, 'SELECT COUNT(*) AS "count" FROM "User" WHERE "id" IS NULL'],
      [
        'not-null',
        'User.email',
        true,
        'SELECT COUNT(*) AS "count" FROM "User" WHERE "email" IS NULL',
      ],
      [
        'not-null',
        'User.name',
        false,
        'SELECT COUNT(*) AS "count" FROM "User" WHERE "name" IS NULL',
      ],
      [
        'not-null',
        'User.role',
        true,
        'SELECT COUNT(*) AS "count" FROM "User" WHERE "role" IS NULL',
      ],
      [
        'enum',
        'User.role',
        false,
        'SELECT COUNT(*) AS "count" FROM "User" WHERE "role" IS NOT NULL AND "role"::text NOT IN ($1, $2)',
      ],
      ['column-added', 'User.bio', false, 'SELECT COUNT(*) AS "count" FROM "User"'],
      [
        'unique',
        'User.id',
        true,
        'SELECT COUNT(*) AS "count" FROM (SELECT 1 AS "one" FROM "User" WHERE "id" IS NOT NULL GROUP BY "id" HAVING COUNT(*) > 1) AS "duplicates"',
      ],
      [
        'unique',
        'User.email',
        false,
        'SELECT COUNT(*) AS "count" FROM (SELECT 1 AS "one" FROM "User" WHERE "email" IS NOT NULL GROUP BY "email" HAVING COUNT(*) > 1) AS "duplicates"',
      ],
      [
        'column-dropped',
        'User.nickname',
        false,
        'SELECT COUNT(*) AS "count" FROM "User" WHERE "nickname" IS NOT NULL',
      ],
      ['not-null', 'Post.id', true, 'SELECT COUNT(*) AS "count" FROM "Post" WHERE "id" IS NULL'],
      [
        'not-null',
        'Post.authorId',
        true,
        'SELECT COUNT(*) AS "count" FROM "Post" WHERE "authorId" IS NULL',
      ],
      [
        'unique',
        'Post.id',
        true,
        'SELECT COUNT(*) AS "count" FROM (SELECT 1 AS "one" FROM "Post" WHERE "id" IS NOT NULL GROUP BY "id" HAVING COUNT(*) > 1) AS "duplicates"',
      ],
      [
        'foreign-key',
        'Post.author → User',
        false,
        'SELECT COUNT(*) AS "count" FROM "Post" AS "child" WHERE "child"."authorId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" AS "parent" WHERE "parent"."id" = "child"."authorId")',
      ],
      ['table-dropped', 'Legacy', false, 'SELECT COUNT(*) AS "count" FROM "public"."Legacy"'],
    ])
    expect(checks.find((check) => check.kind === 'enum')?.statement.params).toStrictEqual([
      'ADMIN',
      'VIEWER',
    ])
  })

  it('finds a MySQL table whatever case the server reports its name in', () => {
    const { checks, added } = makeChecks({
      dialect: 'mysql',
      expected: expected('model User {\n  id Int @id\n}\n', 'mysql'),
      actual: [
        {
          schema: null,
          table: 'user',
          columns: [column('id', { dataType: 'int', columnType: 'int' })],
          uniques: [['id']],
          foreignKeys: [],
        },
      ],
      defaultSchema: null,
      mariadb: false,
    })
    expect(added).toStrictEqual([])
    expect(checks.map((check) => check.kind)).toStrictEqual(['not-null', 'unique'])
  })

  it('writes MySQL backticks and ? placeholders', () => {
    const { checks } = makeChecks({
      dialect: 'mysql',
      expected: expected(
        `
enum Role {
  ADMIN
}

model User {
  id   Int  @id
  role Role
}
`,
        'mysql',
      ),
      actual: [
        {
          schema: null,
          table: 'User',
          columns: [
            column('id', { dataType: 'int', columnType: 'int' }),
            column('role', {
              dataType: 'enum',
              columnType: "enum('ADMIN','VIEWER')",
              enumValues: ['ADMIN', 'VIEWER'],
            }),
          ],
          uniques: [['id']],
          foreignKeys: [],
        },
      ],
      defaultSchema: null,
      mariadb: false,
    })
    const check = checks.find((c) => c.kind === 'enum')
    expect(check?.guaranteed).toBe(false)
    expect(check?.statement).toStrictEqual({
      sql: 'SELECT COUNT(*) AS `count` FROM `User` WHERE `role` IS NOT NULL AND `role` NOT IN (?)',
      params: ['ADMIN'],
    })
  })

  it('leaves to the database what its constraints already guarantee', () => {
    const { checks } = makeChecks({
      dialect: 'postgresql',
      expected: expected(`
enum Role {
  ADMIN
  VIEWER
}

model User {
  id     Int    @id
  tenant Int
  email  String
  role   Role
  posts  Post[]

  @@unique([tenant, email])
}

model Post {
  id       Int  @id
  authorId Int
  author   User @relation(fields: [authorId], references: [id])
}
`),
      actual: [
        {
          schema: 'public',
          table: 'User',
          columns: [
            column('id', { dataType: 'integer' }),
            column('tenant', { dataType: 'integer' }),
            column('email'),
            // Fewer labels than the schema's: every row already holds a member that stays.
            column('role', { dataType: 'USER-DEFINED', enumValues: ['ADMIN'] }),
          ],
          // A unique email alone makes (tenant, email) unique.
          uniques: [['id'], ['email']],
          foreignKeys: [],
        },
        {
          schema: 'public',
          table: 'Post',
          columns: [
            column('id', { dataType: 'integer' }),
            column('authorId', { dataType: 'integer' }),
          ],
          uniques: [['id']],
          foreignKeys: [
            {
              columns: ['authorId'],
              refSchema: 'public',
              refTable: 'User',
              refColumns: ['id'],
              enforced: true,
              onDelete: 'no action',
              onUpdate: 'no action',
            },
          ],
        },
      ],
      defaultSchema: 'public',
      mariadb: false,
    })
    expect(checks.filter((check) => !check.guaranteed)).toStrictEqual([])
  })

  it('checks a foreign key the database has not validated, and one to other columns', () => {
    const { checks } = makeChecks({
      dialect: 'postgresql',
      expected: expected(`
model User {
  id    Int    @id
  code  String @unique
  posts Post[]
}

model Post {
  id       Int    @id
  authorId String
  author   User   @relation(fields: [authorId], references: [code])
}
`),
      actual: [
        {
          schema: 'public',
          table: 'User',
          columns: [column('id', { dataType: 'integer' }), column('code')],
          uniques: [['id'], ['code']],
          foreignKeys: [],
        },
        {
          schema: 'public',
          table: 'Post',
          columns: [column('id', { dataType: 'integer' }), column('authorId')],
          uniques: [['id']],
          foreignKeys: [
            {
              columns: ['authorId'],
              refSchema: 'public',
              refTable: 'User',
              refColumns: ['id'],
              enforced: true,
              onDelete: 'no action',
              onUpdate: 'no action',
            },
          ],
        },
      ],
      defaultSchema: 'public',
      mariadb: false,
    })
    expect(checks.find((check) => check.kind === 'foreign-key')?.guaranteed).toBe(false)
  })

  it('lists new tables apart, and the columns and tables the schema does not have as dropped', () => {
    const { checks, added } = makeChecks({
      dialect: 'sqlite',
      expected: expected(
        `
model User {
  id Int @id
}

model Tag {
  id Int @id
}
`,
        'sqlite',
      ),
      actual: [
        {
          schema: null,
          table: 'User',
          columns: [column('id', { dataType: 'INTEGER' }), column('location', { nullable: true })],
          uniques: [['id']],
          foreignKeys: [],
        },
        { schema: null, table: 'audit_log', columns: [column('id')], uniques: [], foreignKeys: [] },
      ],
      defaultSchema: null,
      mariadb: false,
    })
    expect(added).toStrictEqual(['Tag'])
    // A column or a table the schema does not have is dropped by the migration, with its values.
    expect(checks.map((check) => [check.kind, check.subject])).toStrictEqual([
      ['not-null', 'User.id'],
      ['unique', 'User.id'],
      ['column-dropped', 'User.location'],
      ['table-dropped', 'audit_log'],
    ])
  })

  it('counts the values a PostgreSQL column loses when it is re-added, and lets a widening pass', () => {
    const { checks } = makeChecks({
      dialect: 'postgresql',
      expected: expected(`
model Metric {
  id    BigInt @id
  views Int?
}
`),
      actual: [
        {
          schema: 'public',
          table: 'Metric',
          columns: [column('id', { dataType: 'integer' }), column('views', { nullable: true })],
          uniques: [['id']],
          foreignKeys: [],
        },
      ],
      defaultSchema: 'public',
      mariadb: false,
    })
    const types = checks.filter((check) => check.kind === 'column-recreated')
    expect(
      types.map((check) => [check.subject, check.what, check.severity, check.statement.sql]),
    ).toStrictEqual([
      [
        'Metric.views',
        'column is dropped and re-added (text to Int)',
        'warning',
        'SELECT COUNT(*) AS "count" FROM "Metric" WHERE "views" IS NOT NULL',
      ],
    ])
  })

  it('blocks a required column Prisma Client fills, as the database has nothing for the rows there', () => {
    const { checks } = makeChecks({
      dialect: 'postgresql',
      expected: expected(`
model User {
  id        Int      @id
  token     String   @default(uuid())
  touchedAt DateTime @updatedAt
  createdAt DateTime @default(now())
  plan      String   @default("free")
}
`),
      actual: [
        {
          schema: 'public',
          table: 'User',
          columns: [column('id', { dataType: 'integer' })],
          uniques: [['id']],
          foreignKeys: [],
        },
      ],
      defaultSchema: 'public',
      mariadb: false,
    })
    expect(
      checks.filter((check) => check.kind === 'column-added').map((check) => check.subject),
    ).toStrictEqual(['User.token', 'User.touchedAt'])
  })

  it('asks nothing of the values of a column PostgreSQL drops and adds again', () => {
    const { checks } = makeChecks({
      dialect: 'postgresql',
      expected: expected(`
model User {
  id    Int    @id
  posts Post[]
}

model Post {
  id       Int   @id
  code     Int   @unique
  authorId Int?
  author   User? @relation(fields: [authorId], references: [id])
}
`),
      actual: [
        {
          schema: 'public',
          table: 'User',
          columns: [column('id', { dataType: 'integer' })],
          uniques: [['id']],
          foreignKeys: [],
        },
        {
          schema: 'public',
          table: 'Post',
          columns: [
            column('id', { dataType: 'integer' }),
            column('code', { nullable: true }),
            column('authorId', { nullable: true }),
          ],
          uniques: [['id']],
          foreignKeys: [],
        },
      ],
      defaultSchema: 'public',
      mariadb: false,
    })
    expect(
      checks
        .filter((check) => check.model === 'Post' && !check.guaranteed)
        .map((check) => [check.kind, check.subject, check.severity]),
    ).toStrictEqual([
      ['column-recreated', 'Post.code', 'blocking'],
      ['column-recreated', 'Post.authorId', 'warning'],
    ])
  })

  it('qualifies a model that names its @@schema, and finds its table there', () => {
    const { checks, added } = makeChecks({
      dialect: 'postgresql',
      expected: [
        {
          model: 'Event',
          table: 'Event',
          schema: 'audit',
          primaryKey: ['id'],
          columns: [],
          uniques: [{ fields: ['id'], columns: ['id'] }],
          foreignKeys: [],
        },
      ],
      actual: [
        { schema: 'audit', table: 'Event', columns: [column('id')], uniques: [], foreignKeys: [] },
      ],
      defaultSchema: 'public',
      mariadb: false,
    })
    expect(added).toStrictEqual([])
    expect(checks[0]?.statement.sql).toBe(
      'SELECT COUNT(*) AS "count" FROM (SELECT 1 AS "one" FROM "audit"."Event" WHERE "id" IS NOT NULL GROUP BY "id" HAVING COUNT(*) > 1) AS "duplicates"',
    )
  })
})
