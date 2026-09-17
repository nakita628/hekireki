import type { DMMF } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
import type { GetDMMFError } from '@prisma/get-dmmf'
import { describe, expect, it } from 'vite-plus/test'

import { makeChecks } from '../checks.js'
import { makeExpectedTables } from '../tables.js'

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
  posts Post[]
}

model Post {
  id       Int   @id
  authorId Int?
  author   User? @relation(fields: [authorId], references: [id])
}
`

const ACTUAL = [
  {
    schema: 'public',
    table: 'User',
    columns: [
      column('id', { dataType: 'integer' }),
      column('email'),
      column('name', { nullable: true }),
      column('role', { dataType: 'USER-DEFINED', enumValues: ['ADMIN', 'EDITOR', 'VIEWER'] }),
    ],
    uniques: [['id']],
    foreignKeys: [],
  },
  {
    schema: 'public',
    table: 'Post',
    columns: [
      column('id', { dataType: 'integer' }),
      column('authorId', { dataType: 'integer', nullable: true }),
    ],
    uniques: [['id']],
    foreignKeys: [],
  },
]

function checks(
  fixes: Parameters<typeof makeChecks>[0]['fixes'],
  actual: Parameters<typeof makeChecks>[0]['actual'] = ACTUAL,
  schema = SCHEMA,
) {
  return makeChecks({
    dialect: 'postgresql',
    expected: expected(schema),
    actual,
    defaultSchema: 'public',
    mariadb: false,
    fixes,
  })
}

describe('fixes in the check', () => {
  const planned = checks({
    User: {
      fields: {
        name: { nulls: 'unknown' },
        role: { values: { EDITOR: 'VIEWER' } },
        email: { duplicates: { keep: 'first', others: 'delete' } },
      },
    },
    Post: { relations: { author: { orphans: 'null' } } },
  })

  it('writes each fix as the statements the plan runs, in the order the check applies them', () => {
    expect(planned.errors).toStrictEqual([])
    expect(
      planned.fixes.map((fix) => [fix.subject, fix.kind, fix.action, fix.statements]),
    ).toStrictEqual([
      [
        'User.name',
        'nulls',
        'NULLs set to "unknown"',
        [`UPDATE "User" SET "name" = 'unknown' WHERE "name" IS NULL`],
      ],
      [
        'User.role',
        'values',
        'values mapped: EDITOR → VIEWER',
        [
          `UPDATE "User" SET "role" = CASE "role" WHEN 'EDITOR' THEN 'VIEWER' ELSE "role" END WHERE "role" IN ('EDITOR')`,
        ],
      ],
      [
        'User.email',
        'duplicates',
        'duplicates: the first by id kept, the others deleted',
        [
          'DELETE FROM "User" WHERE "id" IN (SELECT "id" FROM (SELECT "id", "email", ROW_NUMBER() OVER (PARTITION BY "email" ORDER BY "id" ASC) AS "hk_rank" FROM "User") AS "hk_ranked" WHERE "hk_rank" > 1 AND "email" IS NOT NULL)',
        ],
      ],
      [
        'Post.author → User',
        'orphans',
        'orphans set to NULL',
        [
          'UPDATE "Post" AS "hk_child" SET "authorId" = NULL WHERE "hk_child"."authorId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "User" AS "hk_parent" WHERE "hk_parent"."id" = "hk_child"."authorId")',
        ],
      ],
    ])
  })

  it('reads every fixed table through the CTEs of its fixes, one column after another, parents settled before their orphans', () => {
    const notNull = planned.checks.find(
      (check) => check.subject === 'User.name' && check.kind === 'not-null',
    )
    expect(notNull?.guaranteed).toBe(false)
    expect(notNull?.statement.sql).toBe(
      [
        `WITH "hk_fix_0" AS (SELECT "id", "email", COALESCE("name", 'unknown') AS "name", "role" FROM "public"."User"),`,
        `"hk_fix_1" AS (SELECT "id", "email", "name", CASE "role" WHEN 'EDITOR' THEN 'VIEWER' ELSE "role" END AS "role" FROM "hk_fix_0"),`,
        '"hk_fix_2" AS (SELECT "id", "email", "name", "role" FROM (SELECT "id", "email", "name", "role", ROW_NUMBER() OVER (PARTITION BY "email" ORDER BY "id" ASC) AS "hk_rank" FROM "hk_fix_1") AS "hk_ranked" WHERE ("hk_rank" > 1 AND "email" IS NOT NULL) IS NOT TRUE),',
        '"hk_fix_3" AS (SELECT "hk_child"."id", CASE WHEN "hk_child"."authorId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "hk_fix_2" AS "hk_parent" WHERE "hk_parent"."id" = "hk_child"."authorId") THEN NULL ELSE "hk_child"."authorId" END AS "authorId" FROM "public"."Post" AS "hk_child")',
        'SELECT COUNT(*) AS "count" FROM "hk_fix_2" WHERE "name" IS NULL',
      ].join(' '),
    )
    const orphans = planned.checks.find((check) => check.kind === 'foreign-key')
    expect(orphans?.guaranteed).toBe(false)
    expect(orphans?.statement.sql).toContain(
      'SELECT COUNT(*) AS "count" FROM "hk_fix_3" AS "child" WHERE "child"."authorId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "hk_fix_2" AS "parent" WHERE "parent"."id" = "child"."authorId")',
    )
  })

  it('previews each fixed table as the fixes leave it, and counts each fix on the rows before it', () => {
    expect(planned.previews.map((preview) => preview.model)).toStrictEqual(['User', 'Post'])
    expect(planned.previews[1]?.sql.endsWith('SELECT * FROM "hk_fix_3" ORDER BY "id"')).toBe(true)
    expect(
      planned.fixes.map((fix) => fix.count.sql.slice(fix.count.sql.lastIndexOf(') SELECT ') + 2)),
    ).toStrictEqual([
      'SELECT COUNT(*) AS "count" FROM "public"."User" WHERE "name" IS NULL',
      `SELECT COUNT(*) AS "count" FROM "hk_fix_0" WHERE "role" IN ('EDITOR')`,
      'SELECT COUNT(*) AS "count" FROM (SELECT "id", "email", "name", "role", ROW_NUMBER() OVER (PARTITION BY "email" ORDER BY "id" ASC) AS "hk_rank" FROM "hk_fix_1") AS "hk_ranked" WHERE "hk_rank" > 1 AND "email" IS NOT NULL',
      'SELECT COUNT(*) AS "count" FROM "public"."Post" AS "hk_child" WHERE "hk_child"."authorId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "hk_fix_2" AS "hk_parent" WHERE "hk_parent"."id" = "hk_child"."authorId")',
    ])
  })

  it('leaves the tables without fixes as they are, read and trusted directly', () => {
    const plain = checks(undefined)
    expect(plain.fixes).toStrictEqual([])
    expect(plain.previews).toStrictEqual([])
    expect(plain.checks.every((check) => !check.statement.sql.startsWith('WITH'))).toBe(true)
  })
})

describe('fixes of values the new type refuses', () => {
  it('clamps, truncates, clears, deletes or sets them, on the rows the conversion would refuse', () => {
    const schema = `
model Metric {
  id    Int     @id
  score Int?
  code  String? @db.VarChar(3)
  note  String? @db.VarChar(2)
  junk  Int?
}
`
    const actual = [
      {
        schema: 'public',
        table: 'Metric',
        columns: [
          column('id', { dataType: 'integer' }),
          column('score', { dataType: 'bigint', nullable: true }),
          column('code', { nullable: true }),
          column('note', { nullable: true }),
          column('junk', { dataType: 'bigint', nullable: true }),
        ],
        uniques: [['id']],
        foreignKeys: [],
      },
    ]
    const planned = checks(
      {
        Metric: {
          fields: {
            score: { invalid: 'clamp' },
            code: { invalid: 'truncate' },
            note: { invalid: { set: 'x' } },
            junk: { invalid: 'delete' },
          },
        },
      },
      actual,
      schema,
    )
    expect(planned.errors).toStrictEqual([])
    expect(planned.fixes.map((fix) => fix.statements[0])).toStrictEqual([
      'UPDATE "Metric" SET "score" = CASE WHEN "score" < -2147483648 THEN -2147483648 ELSE 2147483647 END WHERE ("score" < -2147483648 OR "score" > 2147483647)',
      'UPDATE "Metric" SET "code" = LEFT("code", 3) WHERE CHAR_LENGTH("code") > 3',
      `UPDATE "Metric" SET "note" = 'x' WHERE CHAR_LENGTH("note") > 2`,
      'DELETE FROM "Metric" WHERE ("junk" < -2147483648 OR "junk" > 2147483647)',
    ])
    expect(
      planned.checks
        .filter((check) => check.severity === 'blocking' && check.kind.startsWith('value-'))
        .map((check) => check.statement.sql.startsWith('WITH "hk_fix_0" AS (')),
    ).toStrictEqual([true, true, true, true])
  })

  it('writes MySQL forms: a DELETE by alias, and the parent read through a materialised copy', () => {
    const planned = makeChecks({
      dialect: 'mysql',
      expected: expected(
        `
model Category {
  id       Int        @id
  parentId Int?
  parent   Category?  @relation("tree", fields: [parentId], references: [id])
  children Category[] @relation("tree")
}
`,
        'mysql',
      ),
      actual: [
        {
          schema: null,
          table: 'Category',
          columns: [
            column('id', { dataType: 'int', columnType: 'int' }),
            column('parentId', { dataType: 'int', columnType: 'int', nullable: true }),
          ],
          uniques: [['id']],
          foreignKeys: [],
        },
      ],
      defaultSchema: null,
      mariadb: false,
      fixes: { Category: { relations: { parent: { orphans: 'delete' } } } },
    })
    expect(planned.fixes.map((fix) => fix.statements[0])).toStrictEqual([
      'DELETE `hk_child` FROM `Category` AS `hk_child` WHERE `hk_child`.`parentId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM (SELECT DISTINCT `id` FROM `Category`) AS `hk_parent` WHERE `hk_parent`.`id` = `hk_child`.`parentId`)',
    ])
    // A self relation is settled against the table's own rows before its orphans are, as the
    // one DELETE of the plan reads them.
    expect(planned.previews[0]?.sql).toBe(
      'WITH `hk_fix_0` AS (SELECT `hk_child`.`id`, `hk_child`.`parentId` FROM `Category` AS `hk_child` WHERE (`hk_child`.`parentId` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `Category` AS `hk_parent` WHERE `hk_parent`.`id` = `hk_child`.`parentId`)) IS NOT TRUE) SELECT * FROM `hk_fix_0` ORDER BY `id`',
    )
  })
})

describe('decisions the check cannot use', () => {
  it('names every field, relation, key and value that does not fit the schema or the database', () => {
    const planned = checks(
      {
        Ghost: {},
        User: {
          fields: {
            nmae: { nulls: 'x' },
            role: { values: { EDITOR: 'OWNER', GONE: 'ADMIN' } },
            name: { duplicates: { keep: 'first', others: 'delete' }, invalid: 'clamp' },
            email: { values: { a: 'b' } },
          },
          relations: { posts: { orphans: 'null' } },
          unique: [{ fields: ['name'], keep: 'last', orderBy: 'age', others: 'null' }],
        },
        Post: { fields: { title: { invalid: 'null' } } },
      },
      ACTUAL,
      SCHEMA.replace(
        '  id       Int   @id\n  authorId',
        '  id       Int   @id\n  title    String\n  authorId',
      ),
    )
    expect(planned.errors).toStrictEqual([
      'Ghost: the schema has no model Ghost.',
      'User.nmae: User has no field nmae.',
      'User.role: OWNER, for EDITOR, is not a member of Role.',
      'User.name: clamp applies to values out of range, and the type change of User.name has none.',
      'User.email: User.email is not an enum.',
      'User.posts: User has no relation posts that holds a foreign key.',
      'User.name: User has no unique key over name.',
      'User.name: User has no unique key over name.',
      'User.name: User has no field age to order the duplicates by.',
      'Post.title: the migration adds Post.title; only filling the rows already there applies to it.',
    ])
  })

  it('refuses a duplicates fix on the only key the table has, which cannot name one row of a group', () => {
    // The table is told apart by its id alone, so a fix on the id cannot keep one and drop the rest.
    const onlyKey = [
      {
        schema: 'public',
        table: 'User',
        columns: [column('id', { dataType: 'integer' }), column('email'), column('name')],
        uniques: [['id']],
        foreignKeys: [],
      },
    ]
    const schema = `
model User {
  id    Int    @id
  email String
  name  String
}
`
    expect(
      checks(
        { User: { fields: { id: { duplicates: { keep: 'first', others: 'delete' } } } } },
        onlyKey,
        schema,
      ).errors,
    ).toStrictEqual([
      'User.id: User has no key that tells the rows of one id apart, so the plan cannot keep one of them and drop the rest. Settle these rows by hand before the migration.',
    ])
    // With another key of its own, the same fix goes through, naming the rows by that key.
    const withEmail = [{ ...onlyKey[0], uniques: [['id'], ['email']] }].flatMap((table) =>
      table === undefined ? [] : [table],
    )
    const planned = checks(
      { User: { fields: { id: { duplicates: { keep: 'first', others: 'delete' } } } } },
      withEmail,
      schema.replace('  email String', '  email String @unique'),
    )
    expect(planned.errors).toStrictEqual([])
    expect(planned.fixes[0]?.statements[0]).toContain('DELETE FROM "User" WHERE "email" IN')
  })

  it('refuses truncate where nothing is too long, and invalid next to convert', () => {
    const shorter = SCHEMA.replace(
      '  email String @unique',
      '  email String @unique @db.VarChar(5)',
    )
    expect(
      checks({ User: { fields: { name: { invalid: 'truncate' } } } }, ACTUAL, SCHEMA).errors,
    ).toStrictEqual([
      'User.name: truncate applies to values too long, and the type change of User.name has none.',
    ])
    expect(
      checks(
        {
          User: { fields: { email: { invalid: 'truncate', convert: { sql: 'left(email, 5)' } } } },
        },
        ACTUAL,
        shorter,
      ).errors,
    ).toStrictEqual([
      'User.email: a conversion says how every value becomes the new type, which leaves what becomes of the values it refuses nothing to do; keep one of the two.',
    ])
  })

  it('maps a value to a member the column cannot hold yet in the migration, not before it', () => {
    const planned = checks(
      { User: { fields: { role: { values: { EDITOR: 'VIEWER' } } } } },
      [
        {
          ...ACTUAL[0],
          columns: [
            column('id', { dataType: 'integer' }),
            column('email'),
            column('name'),
            column('role', { dataType: 'USER-DEFINED', enumValues: ['ADMIN', 'EDITOR'] }),
          ],
        },
        ACTUAL[1],
      ].flatMap((table) => (table === undefined ? [] : [table])),
    )
    expect(planned.errors).toStrictEqual([])
    expect(planned.fixes.map((fix) => [fix.kind, fix.inMigration, fix.statements])).toStrictEqual([
      ['values', true, []],
    ])
    // The check reads the role as text, mapped, as the migration's cast will leave it.
    expect(planned.previews[0]?.sql).toContain(
      `CASE CAST("role" AS TEXT) WHEN 'EDITOR' THEN 'VIEWER' ELSE CAST("role" AS TEXT) END AS "role"`,
    )
    expect(planned.rewrite.tables[0]?.enumMaps).toStrictEqual([
      {
        column: 'role',
        type: 'Role',
        mapping: [{ from: 'EDITOR', to: 'VIEWER' }],
        existing: ['ADMIN', 'EDITOR'],
        members: ['ADMIN', 'VIEWER'],
      },
    ])
  })
})

describe('renamedFrom', () => {
  const RENAMED = SCHEMA.replace('  name  String', '  fullName String')

  it('reads the column under the name it has now, so nothing of it is dropped', () => {
    const planned = checks(
      { User: { fields: { fullName: { renamedFrom: 'name', nulls: 'unknown' } } } },
      ACTUAL,
      RENAMED,
    )
    expect(planned.errors).toStrictEqual([])
    // The NULLs are counted in the column as it is now, and nothing of it is dropped.
    expect(
      planned.checks
        .filter((check) => check.subject === 'User.fullName' || check.subject === 'User.name')
        .map((check) => [check.kind, check.subject, check.statement.sql]),
    ).toStrictEqual([
      [
        'not-null',
        'User.fullName',
        expect.stringContaining('WHERE "name" IS NULL') as unknown as string,
      ],
    ])
    expect(planned.fixes.map((fix) => [fix.subject, fix.kind, fix.statements])).toStrictEqual([
      ['User.fullName', 'nulls', [`UPDATE "User" SET "name" = 'unknown' WHERE "name" IS NULL`]],
    ])
    expect(planned.rewrite.renames).toStrictEqual([
      { table: { schema: null, table: 'User' }, from: 'name', to: 'fullName' },
    ])
  })

  it('says when there is no column to rename, none of that name, or one of both names', () => {
    const where = 'User.fullName'
    expect(
      checks({ User: { fields: { fullName: { renamedFrom: 'nickname' } } } }, ACTUAL, RENAMED)
        .errors,
    ).toStrictEqual([`${where}: User has no column nickname.`])
    const both = [
      { ...ACTUAL[0], columns: [...(ACTUAL[0]?.columns ?? []), column('fullName')] },
      ACTUAL[1],
    ].flatMap((table) => (table === undefined ? [] : [table]))
    expect(
      checks({ User: { fields: { fullName: { renamedFrom: 'name' } } } }, both, RENAMED).errors,
    ).toStrictEqual([`${where}: User already has a column fullName; there is nothing to rename.`])
    expect(
      checks(
        { User: { fields: { fullName: { renamedFrom: 'name' } } } },
        [ACTUAL[1]].flatMap((t) => (t === undefined ? [] : [t])),
        RENAMED,
      ).errors,
    ).toStrictEqual([
      `${where}: the migration creates User; there is no column to rename.`,
      'User: the migration creates User, so there are no rows of it to fix.',
    ])
  })
})

// What the database does with the rows that point at the ones a fix deletes or changes, and
// what it only counts: a rule it does not follow, a cascade that comes back on itself, and a
// change of the key the cascade would be paired by.
describe('the rules the checks count but do not follow', () => {
  const postFk = (onDelete: string, onUpdate = 'no action') => ({
    columns: ['authorId'],
    refSchema: 'public',
    refTable: 'User',
    refColumns: ['id'],
    enforced: true,
    onDelete,
    onUpdate,
  })
  const withFk = (fk: ReturnType<typeof postFk>) =>
    [ACTUAL[0], { ...ACTUAL[1], schema: 'public', table: 'Post', foreignKeys: [fk] }].flatMap(
      (table) => (table === undefined ? [] : [table]),
    )
  const DELETE_DUPLICATES: Parameters<typeof checks>[0] = {
    User: { fields: { email: { duplicates: { keep: 'first', others: 'delete' } } } },
  }

  it('counts the rows ON DELETE SET DEFAULT resets, and does not follow them', () => {
    const planned = checks(DELETE_DUPLICATES, withFk(postFk('set default')))
    expect(
      planned.checks
        .filter((check) => check.kind === 'delete-cascades')
        .map((check) => [check.subject, check.what, check.hint]),
    ).toStrictEqual([
      [
        'Post.authorId → User.email',
        'ON DELETE SET DEFAULT resets the key, which the checks do not follow',
        'The database sets these keys to their default: check the rows after the plan.',
      ],
    ])
  })

  it('stops a cascade that comes back to a table it has been through', () => {
    // Post points at User, and User at Post: deleting a user deletes its posts, and those
    // would delete users again.
    const userFk = {
      columns: ['id'],
      refSchema: 'public',
      refTable: 'Post',
      refColumns: ['id'],
      enforced: true,
      onDelete: 'cascade',
      onUpdate: 'no action',
    }
    const actual = [
      { ...ACTUAL[0], foreignKeys: [userFk] },
      { ...ACTUAL[1], schema: 'public', table: 'Post', foreignKeys: [postFk('cascade')] },
    ]
    const planned = checks(DELETE_DUPLICATES, actual)
    expect(
      planned.checks
        .filter((check) => check.kind === 'delete-cascades')
        .map((check) => [check.subject, check.what]),
    ).toStrictEqual([
      ['Post.authorId → User.email', 'ON DELETE CASCADE deletes them too'],
      // The users those posts point at go too, and there the cascade stops.
      ['User.id → Post.authorId → User.email', 'ON DELETE CASCADE deletes them too'],
      [
        'User.id → Post.authorId → User.email',
        'the cascade comes back to a table it went through, and the checks stop following it there',
      ],
    ])
  })

  it('counts an ON UPDATE rule it does not follow, and a cascade off a key the fix itself changes', () => {
    // The fix sets the duplicate emails to NULL, so the rows that point at them are changed by
    // the database, not deleted.
    const nulled: Parameters<typeof checks>[0] = {
      User: { fields: { email: { duplicates: { keep: 'first', others: 'null' } } } },
    }
    const emailFk = (onUpdate: string) => ({
      columns: ['authorId'],
      refSchema: 'public',
      refTable: 'User',
      refColumns: ['email'],
      enforced: true,
      onDelete: 'no action',
      onUpdate,
    })
    const setDefault = checks(nulled, withFk(emailFk('set default')))
    expect(
      setDefault.checks
        .filter((check) => check.kind === 'update-cascades')
        .map((check) => [check.subject, check.what]),
    ).toStrictEqual([
      [
        'Post.authorId → User.email',
        'ON UPDATE SET DEFAULT resets the key, which the checks do not follow',
      ],
    ])
    // The key the rows would be paired by is the one the fix changes: counted, not followed.
    const clamped: Parameters<typeof checks>[0] = { User: { fields: { id: { invalid: 'clamp' } } } }
    const wideId = [
      {
        ...ACTUAL[0],
        schema: 'public',
        table: 'User',
        columns: [
          column('id', { dataType: 'bigint' }),
          column('email'),
          column('name'),
          column('role', { dataType: 'USER-DEFINED', enumValues: ['ADMIN', 'EDITOR', 'VIEWER'] }),
        ],
        uniques: [['id']],
        foreignKeys: [],
      },
      {
        ...ACTUAL[1],
        schema: 'public',
        table: 'Post',
        foreignKeys: [{ ...emailFk('cascade'), refColumns: ['id'] }],
      },
    ]
    const byId = checks(clamped, wideId)
    expect(
      byId.checks
        .filter((check) => check.kind === 'update-cascades')
        .map((check) => [check.subject, check.what]),
    ).toStrictEqual([
      [
        'Post.authorId → User.id',
        'ON UPDATE CASCADE follows the change, which the checks do not follow here',
      ],
    ])
  })
})

describe('values moved to a related model', () => {
  const MOVED = `
model User {
  id         Int     @id
  authorName String?
  posts      Post[]
}

model Post {
  id       Int  @id
  authorId Int
  author   User @relation(fields: [authorId], references: [id])
}
`
  const tables = (postTable: string, moving: string) => [
    {
      schema: 'public',
      table: 'User',
      columns: [column('id', { dataType: 'integer' })],
      uniques: [['id']],
      foreignKeys: [],
    },
    {
      schema: 'public',
      table: postTable,
      columns: [
        column('id', { dataType: 'integer' }),
        column(moving, { nullable: true }),
        column('authorId', { dataType: 'integer' }),
      ],
      uniques: [['id']],
      foreignKeys: [],
    },
  ]
  const moved = {
    User: { fields: { authorName: { movedFrom: { model: 'Post', column: 'authorName' } } } },
  }

  it('keeps the values with the key that orders them, and fills from the first row that has one', () => {
    const planned = checks(moved, tables('Post', 'authorName'), MOVED)
    expect(planned.errors).toStrictEqual([])
    expect(planned.fixes.map((fix) => fix.statements)).toStrictEqual([
      [
        'CREATE TABLE "hk_move_Post_authorName" AS SELECT "authorId" AS "hk_key", "authorName" AS "hk_value", "id" AS "hk_order_0" FROM "public"."Post"',
      ],
    ])
    expect(planned.rewrite.tables.flatMap((table) => table.fills)).toStrictEqual([
      {
        column: 'authorName',
        sql: '(SELECT "hk_value" FROM "hk_move_Post_authorName" WHERE "hk_key" = "id" AND "hk_value" IS NOT NULL ORDER BY "hk_order_0", "hk_value" LIMIT 1)',
      },
    ])
    expect(planned.rewrite.after).toStrictEqual(['DROP TABLE "hk_move_Post_authorName"'])
    // Several posts of one user can disagree: counted, by the users it happens to.
    expect(
      planned.checks
        .filter((check) => check.kind === 'move-ambiguous')
        .map((check) => [check.subject, check.severity, check.statement.sql]),
    ).toStrictEqual([
      [
        'User.authorName',
        'warning',
        'WITH "hk_fix_0" AS (SELECT "id", (SELECT "hk_value" FROM (SELECT "authorId" AS "hk_key", "authorName" AS "hk_value", "id" AS "hk_order_0" FROM "public"."Post") AS "hk_move" WHERE "hk_key" = "id" AND "hk_value" IS NOT NULL ORDER BY "hk_order_0", "hk_value" LIMIT 1) AS "authorName" FROM "public"."User") SELECT COUNT(*) AS "count" FROM (SELECT "authorId" FROM "public"."Post" WHERE "authorId" IS NOT NULL AND "authorName" IS NOT NULL GROUP BY "authorId" HAVING COUNT(DISTINCT "authorName") > 1) AS "hk_ambiguous"',
      ],
    ])
  })

  it('gives the kept values a name every database takes, however long the table and the column are', () => {
    const long = 'a_column_with_a_name_long_enough_to_pass_what_a_database_allows'
    const planned = checks(
      { User: { fields: { authorName: { movedFrom: { model: 'Post', column: long } } } } },
      tables('Post', long),
      MOVED,
    )
    expect(planned.errors).toStrictEqual([])
    expect(planned.rewrite.after).toStrictEqual([
      'DROP TABLE "hk_move_Post_a_column_with_a_name_long_enough_to_pa_1072cd97"',
    ])
  })
})

describe('an enum value mapped by the migration on MySQL', () => {
  it('writes a backslash in a stored value as MySQL reads it, in the check as in the migration', () => {
    const planned = makeChecks({
      dialect: 'mysql',
      expected: expected(
        `
enum Role {
  ADMIN
  WRITER
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
            column('id', { dataType: 'int' }),
            column('role', {
              dataType: 'enum',
              columnType: "enum('ADMIN','ED\\\\ITOR')",
              enumValues: ['ADMIN', 'ED\\ITOR'],
            }),
          ],
          uniques: [['id']],
          foreignKeys: [],
        },
      ],
      defaultSchema: null,
      mariadb: false,
      fixes: { User: { fields: { role: { values: { 'ED\\ITOR': 'WRITER' } } } } },
    })
    expect(planned.errors).toStrictEqual([])
    expect(planned.fixes.map((fix) => [fix.kind, fix.inMigration, fix.count.sql])).toStrictEqual([
      [
        'values',
        true,
        "WITH `hk_fix_0` AS (SELECT `id`, CASE `role` WHEN 'ED\\\\ITOR' THEN 'WRITER' ELSE `role` END AS `role` FROM `User`) SELECT COUNT(*) AS `count` FROM `User` WHERE `role` IN ('ED\\\\ITOR')",
      ],
    ])
  })
})

describe('what the schema does not describe', () => {
  const withGuards = ACTUAL.map((table) =>
    table.table === 'User'
      ? {
          ...table,
          triggers: ['User_audit', 'User_touch'],
          checks: [{ name: 'User_name_check', clause: `(name <> ''::text)` }],
        }
      : table,
  )

  it('counts the rows a CHECK constraint refuses as the fixes leave them, and names the triggers', () => {
    const planned = checks({ User: { fields: { name: { nulls: '' } } } }, withGuards)
    expect(planned.errors).toStrictEqual([])
    expect(
      planned.checks
        .filter((check) => check.kind === 'check-constraint' || check.kind === 'trigger-unfollowed')
        .map((check) => [check.kind, check.severity, check.subject, check.statement.sql]),
    ).toStrictEqual([
      [
        'check-constraint',
        'blocking',
        'User User_name_check',
        `WITH "hk_fix_0" AS (SELECT "id", "email", COALESCE("name", '') AS "name", "role" FROM "public"."User") SELECT COUNT(*) AS "count" FROM "hk_fix_0" WHERE NOT ((name <> ''::text))`,
      ],
      ['trigger-unfollowed', 'warning', 'User', 'SELECT 2 AS "count"'],
    ])
  })

  it('refuses a fix of a column the database generates', () => {
    const planned = checks({ User: { fields: { name: { nulls: 'unknown' } } } }, [
      {
        schema: 'public',
        table: 'User',
        columns: [
          column('id', { dataType: 'integer' }),
          column('email'),
          { ...column('name', { nullable: true }), generated: true },
          column('role', { dataType: 'USER-DEFINED', enumValues: ['ADMIN', 'VIEWER'] }),
        ],
        uniques: [['id']],
        foreignKeys: [],
      },
      ...ACTUAL.filter((table) => table.table !== 'User'),
    ])
    expect(planned.errors).toStrictEqual([
      'User.name: User.name is generated by the database, which refuses a statement that writes to it. Change what it is generated from, or settle its rows by hand.',
    ])
  })
})

describe('a CHECK constraint asked again of what the migration makes of the rows', () => {
  const schema = `
model Post {
  id    Int  @id
  views Int?
}
`
  const actual = [
    {
      schema: 'public',
      table: 'Post',
      columns: [column('id', { dataType: 'integer' }), column('views', { nullable: true })],
      uniques: [['id']],
      foreignKeys: [],
      checks: [{ name: 'Post_views_check', clause: `(views <> 'none'::text)` }],
    },
  ]

  it('counts the rows a conversion leaves that the constraint refuses', () => {
    const planned = checks(
      { Post: { fields: { views: { convert: { sql: `CAST(NULLIF(views, '') AS INTEGER)` } } } } },
      actual,
      schema,
    )
    expect(planned.errors).toStrictEqual([])
    expect(
      planned.checks
        .filter((check) => check.kind === 'check-constraint')
        .map((check) => [check.subject, check.statement.sql]),
    ).toStrictEqual([
      [
        'Post Post_views_check (after the migration)',
        `WITH "hk_fix_0" AS (SELECT "id", CAST((CAST(NULLIF(views, '') AS INTEGER)) AS INTEGER) AS "views" FROM "public"."Post") SELECT COUNT(*) AS "count" FROM "hk_fix_0" WHERE NOT ((views <> 'none'::text))`,
      ],
    ])
  })
})
