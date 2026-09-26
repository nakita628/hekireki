import type { DMMF } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
import type { GetDMMFError } from '@prisma/get-dmmf'
import { Effect } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import { makeSeedPlan } from './plan.js'
import type { SeedTable } from './plan.js'
import { insertSql, makeSeedSql, renderLiteral, resetSql, sequenceSql } from './sql.js'

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
    expect(renderLiteral('sqlite', text, DATE)).toBe("'2025-03-04T05:06:07.089+00:00'")
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

describe('resetSql', () => {
  it('deletes children first, and turns MySQL foreign key checks off around it', () => {
    expect(resetSql('postgresql', TABLES)).toStrictEqual([
      'DELETE FROM "_PostToTag"',
      'DELETE FROM "Tag"',
      'DELETE FROM "Post"',
      'DELETE FROM "users"',
    ])
    expect(resetSql('mysql', TABLES)).toStrictEqual([
      'SET FOREIGN_KEY_CHECKS = 0',
      'DELETE FROM `_PostToTag`',
      'DELETE FROM `Tag`',
      'DELETE FROM `Post`',
      'DELETE FROM `users`',
      'SET FOREIGN_KEY_CHECKS = 1',
    ])
  })
})

describe('sequenceSql', () => {
  it('moves every PostgreSQL sequence past the seeded ids and does nothing elsewhere', () => {
    expect(sequenceSql('postgresql', TABLES)).toStrictEqual([
      `SELECT setval(pg_get_serial_sequence('"users"', 'id'), COALESCE((SELECT MAX("id") FROM "users"), 0) + 1, false)`,
      `SELECT setval(pg_get_serial_sequence('"Post"', 'id'), COALESCE((SELECT MAX("id") FROM "Post"), 0) + 1, false)`,
      `SELECT setval(pg_get_serial_sequence('"Tag"', 'id'), COALESCE((SELECT MAX("id") FROM "Tag"), 0) + 1, false)`,
    ])
    expect(sequenceSql('mysql', TABLES)).toStrictEqual([])
    expect(sequenceSql('sqlite', TABLES)).toStrictEqual([])
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

describe('renderLiteral, the edges', () => {
  it.each([
    ['postgresql', 'line\nbreak', "'line\nbreak'"],
    ['mysql', 'line\nbreak', "'line\nbreak'"],
    ['postgresql', 'tab\tand 日本語 and 🎉', "'tab\tand 日本語 and 🎉'"],
    ['postgresql', 'back\\slash', "'back\\slash'"],
    ['mysql', 'back\\slash', "'back\\\\slash'"],
    ['sqlite', 'back\\slash', "'back\\slash'"],
    ['postgresql', '', "''"],
    ['mysql', "''", "''''''"],
    ['sqlite', 'NUL\0byte', "'NUL\0byte'"],
  ] as const)('%s quotes %j as %s', (dialect, value, expected) => {
    expect(renderLiteral(dialect, text, value)).toBe(expected)
  })

  it.each([
    [-0, '0'],
    [-1.5, '-1.5'],
    [1e21, '1e+21'],
    [Number.POSITIVE_INFINITY, 'NULL'],
    [Number.NEGATIVE_INFINITY, 'NULL'],
    [-(2n ** 64n), '-18446744073709551616'],
  ] as const)('writes the number %s as %s', (value, expected) => {
    expect(renderLiteral('postgresql', text, value)).toBe(expected)
    expect(renderLiteral('mysql', text, value)).toBe(expected)
    expect(renderLiteral('sqlite', text, value)).toBe(expected)
  })

  it('writes every element kind into a PostgreSQL array, and JSON strings elsewhere', () => {
    const enums = { ...list, kind: 'enum', enumValues: role.enumValues } as const
    expect(renderLiteral('postgresql', enums, ['ADMIN', 'OTHER'])).toBe('\'{"admin","OTHER"}\'')
    expect(renderLiteral('postgresql', { ...list, type: 'Boolean' }, [true, false])).toBe("'{t,f}'")
    expect(renderLiteral('postgresql', { ...list, type: 'BigInt' }, [1n, -2n])).toBe("'{1,-2}'")
    expect(renderLiteral('postgresql', { ...list, type: 'DateTime' }, [DATE])).toBe(
      '\'{"2025-03-04 05:06:07.089+00"}\'',
    )
    expect(renderLiteral('postgresql', { ...list, type: 'Bytes' }, [Uint8Array.from([1])])).toBe(
      '\'{"\\\\x01"}\'',
    )
    expect(renderLiteral('postgresql', { ...list, type: 'Json' }, [{ a: 'b' }])).toBe(
      '\'{"{\\"a\\":\\"b\\"}"}\'',
    )
    expect(renderLiteral('postgresql', list, ["it's", 'a\\b'])).toBe('\'{"it\'\'s","a\\\\b"}\'')
    expect(renderLiteral('mysql', enums, ['ADMIN'])).toBe('\'["ADMIN"]\'')
    expect(renderLiteral('sqlite', { ...list, type: 'DateTime' }, [DATE, null])).toBe(
      '\'["2025-03-04T05:06:07.089Z",null]\'',
    )
    // A scalar handed to a list column is taken as a list of one.
    expect(renderLiteral('postgresql', list, 'one')).toBe('\'{"one"}\'')
  })

  it('writes JSON columns as text whatever the value, escaping quotes for SQL', () => {
    expect(renderLiteral('postgresql', json, "it's")).toBe("'\"it''s\"'")
    expect(renderLiteral('postgresql', json, 5)).toBe("'5'")
    expect(renderLiteral('postgresql', json, true)).toBe("'true'")
    expect(renderLiteral('postgresql', json, null)).toBe('NULL')
    expect(renderLiteral('mysql', json, { path: 'C:\\dir' })).toBe('\'{"path":"C:\\\\\\\\dir"}\'')
    expect(renderLiteral('postgresql', json, { bytes: Uint8Array.from([1, 2]) })).toBe(
      '\'{"bytes":"AQI="}\'',
    )
    expect(renderLiteral('postgresql', json, { nested: { n: 2n, when: [DATE] } })).toBe(
      '\'{"nested":{"n":"2","when":["2025-03-04T05:06:07.089Z"]}}\'',
    )
  })

  it('writes an object into a plain column as JSON text, as a last resort', () => {
    expect(renderLiteral('postgresql', text, { a: 1 })).toBe('\'{"a":1}\'')
    expect(renderLiteral('postgresql', text, [1, 2])).toBe("'[1,2]'")
  })
})

describe('insertSql, the edges', () => {
  it('writes nothing for a table without rows', () => {
    expect(insertSql('postgresql', { table: table('User'), rows: [] })).toStrictEqual([])
  })

  it('splits exactly at the chunk size, the last chunk taking the rest', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: i + 1 }))
    const two = insertSql('sqlite', { table: table('Tag'), rows }, 2)
    expect(two).toStrictEqual([
      'INSERT INTO "Tag" ("id") VALUES\n  (1),\n  (2);',
      'INSERT INTO "Tag" ("id") VALUES\n  (3),\n  (4);',
      'INSERT INTO "Tag" ("id") VALUES\n  (5);',
    ])
    expect(insertSql('sqlite', { table: table('Tag'), rows }, 5)).toHaveLength(1)
    expect(insertSql('sqlite', { table: table('Tag'), rows }, 4)).toHaveLength(2)
  })

  it('keeps the column order of the plan whatever order the row lists its fields in, NULL for what is missing', () => {
    const rows: readonly Readonly<Record<string, number>>[] = [{ authorId: 7, id: 3 }, { id: 4 }]
    expect(insertSql('postgresql', { table: table('Post'), rows })).toStrictEqual([
      'INSERT INTO "Post" ("id", "authorId") VALUES\n  (3, 7),\n  (4, NULL);',
    ])
  })
})

describe('resetSql, sequenceSql and makeSeedSql, the edges', () => {
  it('deletes in reverse plan order for every dialect, MySQL alone switching the checks off', () => {
    expect(resetSql('postgresql', TABLES)).toStrictEqual([
      'DELETE FROM "_PostToTag"',
      'DELETE FROM "Tag"',
      'DELETE FROM "Post"',
      'DELETE FROM "users"',
    ])
    expect(resetSql('sqlite', TABLES)).toStrictEqual([
      'DELETE FROM "_PostToTag"',
      'DELETE FROM "Tag"',
      'DELETE FROM "Post"',
      'DELETE FROM "users"',
    ])
    expect(resetSql('mysql', [table('User')])).toStrictEqual([
      'SET FOREIGN_KEY_CHECKS = 0',
      'DELETE FROM `users`',
      'SET FOREIGN_KEY_CHECKS = 1',
    ])
    expect(resetSql('postgresql', [])).toStrictEqual([])
  })

  it('moves one sequence per autoincrement column on PostgreSQL, mapped names included, and none elsewhere', () => {
    expect(sequenceSql('postgresql', TABLES)).toStrictEqual([
      `SELECT setval(pg_get_serial_sequence('"users"', 'id'), COALESCE((SELECT MAX("id") FROM "users"), 0) + 1, false)`,
      `SELECT setval(pg_get_serial_sequence('"Post"', 'id'), COALESCE((SELECT MAX("id") FROM "Post"), 0) + 1, false)`,
      `SELECT setval(pg_get_serial_sequence('"Tag"', 'id'), COALESCE((SELECT MAX("id") FROM "Tag"), 0) + 1, false)`,
    ])
    expect(sequenceSql('mysql', TABLES)).toStrictEqual([])
    expect(sequenceSql('sqlite', TABLES)).toStrictEqual([])
    expect(sequenceSql('postgresql', [table('_PostToTag')])).toStrictEqual([])
  })

  it.each([
    [
      'postgresql',
      [
        '-- Generated by hekireki seed (seed random, locale en)',
        '-- Tag: 1, _PostToTag: 0',
        'BEGIN;',
        'INSERT INTO "Tag" ("id") VALUES\n  (1);',
        `SELECT setval(pg_get_serial_sequence('"Tag"', 'id'), COALESCE((SELECT MAX("id") FROM "Tag"), 0) + 1, false);`,
        'COMMIT;',
      ],
    ],
    [
      'mysql',
      [
        '-- Generated by hekireki seed (seed random, locale en)',
        '-- Tag: 1, _PostToTag: 0',
        'START TRANSACTION;',
        'INSERT INTO `Tag` (`id`) VALUES\n  (1);',
        'COMMIT;',
      ],
    ],
    [
      'sqlite',
      [
        '-- Generated by hekireki seed (seed random, locale en)',
        '-- Tag: 1, _PostToTag: 0',
        'PRAGMA foreign_keys = ON;',
        'BEGIN;',
        'INSERT INTO "Tag" ("id") VALUES\n  (1);',
        'COMMIT;',
      ],
    ],
  ] as const)('writes the %s script without a reset, skipping empty tables', (dialect, lines) => {
    expect(
      makeSeedSql({
        dialect,
        entries: [
          { table: table('Tag'), rows: [{ id: 1 }] },
          { table: table('_PostToTag'), rows: [] },
        ],
        reset: false,
        seed: null,
        locale: [],
      }),
    ).toBe(`${lines.join('\n')}\n`)
  })

  it('puts the reset before the inserts and names the seed and locales in the header', () => {
    expect(
      makeSeedSql({
        dialect: 'mysql',
        entries: [{ table: table('Tag'), rows: [{ id: 1 }] }],
        reset: true,
        seed: 7,
        locale: ['ja', 'en'],
      }),
    ).toBe(
      [
        '-- Generated by hekireki seed (seed 7, locale ja, en)',
        '-- Tag: 1',
        'START TRANSACTION;',
        'SET FOREIGN_KEY_CHECKS = 0;',
        'DELETE FROM `Tag`;',
        'SET FOREIGN_KEY_CHECKS = 1;',
        'INSERT INTO `Tag` (`id`) VALUES\n  (1);',
        'COMMIT;',
        '',
      ].join('\n'),
    )
    expect(
      makeSeedSql({ dialect: 'sqlite', entries: [], reset: true, seed: 0, locale: ['en'] }),
    ).toBe(
      [
        '-- Generated by hekireki seed (seed 0, locale en)',
        '-- ',
        'PRAGMA foreign_keys = ON;',
        'BEGIN;',
        'COMMIT;',
        '',
      ].join('\n'),
    )
  })
})
