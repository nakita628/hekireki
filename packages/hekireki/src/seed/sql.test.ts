import type { DMMF } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
import type { GetDMMFError } from '@prisma/get-dmmf'
import { Effect } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import { makeSeedPlan } from './plan.js'
import type { SeedTable } from './plan.js'
import {
  driverValue,
  insertSql,
  insertStatements,
  makeSeedSql,
  renderLiteral,
  resetStatements,
  sequenceStatements,
} from './sql.js'

const SCHEMA = `
datasource db {
  provider = "postgresql"
}

enum Role {
  ADMIN @map("admin")
  USER  @map("user")
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  role      Role
  tags      String[]
  active    Boolean
  createdAt DateTime @map("created_at")
  meta      Json?
  avatar    Bytes?
  balance   Decimal
  big       BigInt
  posts     Post[]

  @@map("users")
}

model Post {
  id       Int  @id @default(autoincrement())
  authorId Int
  author   User @relation(fields: [authorId], references: [id])
  tags     Tag[]
}

model Tag {
  id    Int    @id @default(autoincrement())
  posts Post[]
}
`

function tables(): readonly SeedTable[] {
  const result: DMMF.Document | GetDMMFError = getDMMF({ datamodel: [['schema.prisma', SCHEMA]] })
  if ('type' in result) throw new Error(result.error.message)
  return Effect.runSync(makeSeedPlan(result.datamodel))
}

const TABLES = tables()

function table(name: string) {
  const found = TABLES.find((t) => t.name === name)
  if (found === undefined) throw new Error(`no table ${name}`)
  return found
}

const text = {
  column: 'c',
  type: 'String',
  kind: 'scalar',
  isList: false,
  enumValues: null,
} as const
const role = {
  column: 'role',
  type: 'Role',
  kind: 'enum',
  isList: false,
  enumValues: [{ name: 'ADMIN', dbName: 'admin' }],
} as const
const list = { ...text, isList: true } as const
const json = { ...text, type: 'Json' } as const
const DATE = new Date('2025-03-04T05:06:07.089Z')

describe('renderLiteral', () => {
  it('quotes strings per dialect, escaping quotes and MySQL backslashes', () => {
    expect(renderLiteral('postgresql', text, "it's a\\b")).toBe("'it''s a\\b'")
    expect(renderLiteral('mysql', text, "it's a\\b")).toBe("'it''s a\\\\b'")
    expect(renderLiteral('sqlite', text, 'plain')).toBe("'plain'")
  })

  it('stores the @map name of an enum member', () => {
    expect(renderLiteral('postgresql', role, 'ADMIN')).toBe("'admin'")
    expect(renderLiteral('postgresql', role, 'UNKNOWN')).toBe("'UNKNOWN'")
  })

  it('writes numbers, bigints, booleans and NULL', () => {
    expect(renderLiteral('postgresql', text, 12.5)).toBe('12.5')
    expect(renderLiteral('postgresql', text, 9_007_199_254_740_993n)).toBe('9007199254740993')
    expect(renderLiteral('postgresql', text, true)).toBe('TRUE')
    expect(renderLiteral('mysql', text, false)).toBe('FALSE')
    expect(renderLiteral('sqlite', text, true)).toBe('1')
    expect(renderLiteral('sqlite', text, null)).toBe('NULL')
    expect(renderLiteral('postgresql', text, Number.NaN)).toBe('NULL')
  })

  it('writes timestamps in UTC as each dialect reads them', () => {
    expect(renderLiteral('postgresql', text, DATE)).toBe("'2025-03-04 05:06:07.089+00'")
    expect(renderLiteral('mysql', text, DATE)).toBe("'2025-03-04 05:06:07.089'")
    expect(renderLiteral('sqlite', text, DATE)).toBe("'2025-03-04T05:06:07.089Z'")
  })

  it('writes bytes as hex in the dialect syntax', () => {
    const bytes = Uint8Array.from([0xde, 0xad])
    expect(renderLiteral('postgresql', text, bytes)).toBe("'\\xdead'")
    expect(renderLiteral('mysql', text, bytes)).toBe("X'dead'")
    expect(renderLiteral('sqlite', text, bytes)).toBe("X'dead'")
  })

  it('writes a PostgreSQL array literal and JSON text elsewhere', () => {
    expect(renderLiteral('postgresql', list, ['a b', 'say "hi"', null])).toBe(
      '\'{"a b","say \\"hi\\"",NULL}\'',
    )
    expect(renderLiteral('postgresql', list, [])).toBe("'{}'")
    expect(renderLiteral('postgresql', { ...list, type: 'Int' }, [1, 2])).toBe("'{1,2}'")
    expect(renderLiteral('mysql', list, ['a'])).toBe('\'["a"]\'')
  })

  it('writes JSON with bigints and dates as strings', () => {
    expect(renderLiteral('postgresql', json, { n: 1n, at: DATE, list: [true] })).toBe(
      '\'{"n":"1","at":"2025-03-04T05:06:07.089Z","list":[true]}\'',
    )
    expect(renderLiteral('postgresql', json, [1, 'two'])).toBe('\'[1,"two"]\'')
  })
})

describe('driverValue', () => {
  it('binds what each driver expects', () => {
    expect(driverValue('postgresql', text, 1n)).toBe('1')
    expect(driverValue('sqlite', text, 1n)).toBe(1n)
    expect(driverValue('sqlite', text, true)).toBe(1)
    expect(driverValue('postgresql', text, true)).toBe(true)
    expect(driverValue('sqlite', text, DATE)).toBe('2025-03-04T05:06:07.089Z')
    expect(driverValue('mysql', text, DATE)).toStrictEqual(DATE)
    expect(driverValue('postgresql', role, 'ADMIN')).toBe('admin')
    expect(driverValue('postgresql', list, ['x'])).toStrictEqual(['x'])
    expect(
      driverValue('postgresql', { ...list, kind: 'enum', enumValues: role.enumValues }, ['ADMIN']),
    ).toStrictEqual(['admin'])
    expect(driverValue('mysql', list, ['x'])).toBe('["x"]')
    expect(driverValue('postgresql', json, { a: 1 })).toBe('{"a":1}')
    expect(driverValue('postgresql', text, Uint8Array.from([1]))).toStrictEqual(Buffer.from([1]))
    expect(driverValue('postgresql', text, null)).toBeNull()
  })
})

const USER_ROWS = [
  {
    id: 1,
    email: 'ann@example.com',
    role: 'ADMIN',
    tags: ['a', 'b'],
    active: true,
    createdAt: DATE,
    meta: { k: 'v' },
    avatar: Uint8Array.from([1, 2]),
    balance: '10.50',
    big: 5n,
  },
  {
    id: 2,
    email: "bob@o'neil.example",
    role: 'USER',
    tags: [],
    active: false,
    createdAt: DATE,
    meta: null,
    avatar: null,
    balance: '0.00',
    big: 6n,
  },
]

describe('insertSql', () => {
  it('writes one multi-row INSERT with column names from @map', () => {
    expect(insertSql('postgresql', { table: table('User'), rows: USER_ROWS })).toStrictEqual([
      `INSERT INTO "users" ("id", "email", "role", "tags", "active", "created_at", "meta", "avatar", "balance", "big") VALUES
  (1, 'ann@example.com', 'admin', '{"a","b"}', TRUE, '2025-03-04 05:06:07.089+00', '{"k":"v"}', '\\x0102', '10.50', 5),
  (2, 'bob@o''neil.example', 'user', '{}', FALSE, '2025-03-04 05:06:07.089+00', NULL, NULL, '0.00', 6);`,
    ])
  })

  it('splits rows into chunks and quotes MySQL identifiers with backticks', () => {
    expect(
      insertSql('mysql', { table: table('Tag'), rows: [{ id: 1 }, { id: 2 }, { id: 3 }] }, 2),
    ).toStrictEqual([
      'INSERT INTO `Tag` (`id`) VALUES\n  (1),\n  (2);',
      'INSERT INTO `Tag` (`id`) VALUES\n  (3);',
    ])
  })

  it('writes the join table with its A and B columns', () => {
    expect(
      insertSql('sqlite', { table: table('_PostToTag'), rows: [{ A: 1, B: 2 }] }),
    ).toStrictEqual(['INSERT INTO "_PostToTag" ("A", "B") VALUES\n  (1, 2);'])
  })
})

describe('insertStatements', () => {
  it('numbers PostgreSQL placeholders across the rows and binds converted values', () => {
    expect(
      insertStatements('postgresql', {
        table: table('Post'),
        rows: [
          { id: 1, authorId: 2 },
          { id: 3, authorId: 4 },
        ],
      }),
    ).toStrictEqual([
      {
        sql: 'INSERT INTO "Post" ("id", "authorId") VALUES ($1, $2), ($3, $4)',
        params: [1, 2, 3, 4],
      },
    ])
    expect(
      insertStatements('sqlite', { table: table('Post'), rows: [{ id: 1, authorId: 2 }] }),
    ).toStrictEqual([
      { sql: 'INSERT INTO "Post" ("id", "authorId") VALUES (?, ?)', params: [1, 2] },
    ])
  })
})

describe('resetStatements', () => {
  it('deletes children first, and turns MySQL foreign key checks off around it', () => {
    expect(resetStatements('postgresql', TABLES).map((s) => s.sql)).toStrictEqual([
      'DELETE FROM "_PostToTag"',
      'DELETE FROM "Tag"',
      'DELETE FROM "Post"',
      'DELETE FROM "users"',
    ])
    expect(resetStatements('mysql', TABLES).map((s) => s.sql)).toStrictEqual([
      'SET FOREIGN_KEY_CHECKS = 0',
      'DELETE FROM `_PostToTag`',
      'DELETE FROM `Tag`',
      'DELETE FROM `Post`',
      'DELETE FROM `users`',
      'SET FOREIGN_KEY_CHECKS = 1',
    ])
  })
})

describe('sequenceStatements', () => {
  it('moves every PostgreSQL sequence past the seeded ids and does nothing elsewhere', () => {
    expect(sequenceStatements('postgresql', TABLES).map((s) => s.sql)).toStrictEqual([
      `SELECT setval(pg_get_serial_sequence('"users"', 'id'), COALESCE((SELECT MAX("id") FROM "users"), 0) + 1, false)`,
      `SELECT setval(pg_get_serial_sequence('"Post"', 'id'), COALESCE((SELECT MAX("id") FROM "Post"), 0) + 1, false)`,
      `SELECT setval(pg_get_serial_sequence('"Tag"', 'id'), COALESCE((SELECT MAX("id") FROM "Tag"), 0) + 1, false)`,
    ])
    expect(sequenceStatements('mysql', TABLES)).toStrictEqual([])
    expect(sequenceStatements('sqlite', TABLES)).toStrictEqual([])
  })
})

describe('makeSeedSql', () => {
  it('wraps the reset, the inserts and the sequence fix-ups in one transaction', () => {
    const entries = [
      { table: table('User'), rows: USER_ROWS.slice(0, 1) },
      { table: table('Post'), rows: [{ id: 1, authorId: 1 }] },
      { table: table('Tag'), rows: [] },
      { table: table('_PostToTag'), rows: [] },
    ]
    expect(
      makeSeedSql({ dialect: 'postgresql', entries, reset: true, seed: 42, locale: ['en'] }),
    ).toBe(
      `-- Generated by hekireki seed (seed 42, locale en)
-- User: 1, Post: 1, Tag: 0, _PostToTag: 0
BEGIN;
DELETE FROM "_PostToTag";
DELETE FROM "Tag";
DELETE FROM "Post";
DELETE FROM "users";
INSERT INTO "users" ("id", "email", "role", "tags", "active", "created_at", "meta", "avatar", "balance", "big") VALUES
  (1, 'ann@example.com', 'admin', '{"a","b"}', TRUE, '2025-03-04 05:06:07.089+00', '{"k":"v"}', '\\x0102', '10.50', 5);
INSERT INTO "Post" ("id", "authorId") VALUES
  (1, 1);
SELECT setval(pg_get_serial_sequence('"users"', 'id'), COALESCE((SELECT MAX("id") FROM "users"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"Post"', 'id'), COALESCE((SELECT MAX("id") FROM "Post"), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('"Tag"', 'id'), COALESCE((SELECT MAX("id") FROM "Tag"), 0) + 1, false);
COMMIT;
`,
    )
  })

  it('opens a MySQL transaction with START TRANSACTION and turns SQLite foreign keys on', () => {
    const entries = [{ table: table('Tag'), rows: [{ id: 1 }] }]
    expect(
      makeSeedSql({ dialect: 'mysql', entries, reset: false, seed: 1, locale: ['ja', 'en'] }),
    ).toBe(
      `-- Generated by hekireki seed (seed 1, locale ja, en)
-- Tag: 1
START TRANSACTION;
INSERT INTO \`Tag\` (\`id\`) VALUES
  (1);
COMMIT;
`,
    )
    expect(makeSeedSql({ dialect: 'sqlite', entries, reset: false, seed: 1, locale: ['en'] })).toBe(
      `-- Generated by hekireki seed (seed 1, locale en)
-- Tag: 1
PRAGMA foreign_keys = ON;
BEGIN;
INSERT INTO "Tag" ("id") VALUES
  (1);
COMMIT;
`,
    )
  })
})
