import { describe, expect, it } from 'vite-plus/test'

import { splitStatements, splitTopLevel } from './split.js'

describe('splitStatements', () => {
  it('splits at semicolons outside quotes and comments', () => {
    expect(
      splitStatements(
        "SELECT 'a;b'; -- c;\nSELECT 2 /* ; */; ; INSERT INTO t VALUES ('it''s;'); SELECT \"q;\", `b;`",
      ),
    ).toStrictEqual([
      "SELECT 'a;b'",
      '-- c;\nSELECT 2 /* ; */',
      "INSERT INTO t VALUES ('it''s;')",
      'SELECT "q;", `b;`',
    ])
  })

  it('returns nothing for blank text and keeps an unterminated statement', () => {
    expect(splitStatements(' ; \n')).toStrictEqual([])
    expect(splitStatements("SELECT 'open; still")).toStrictEqual(["SELECT 'open; still"])
  })
})

describe('splitTopLevel', () => {
  it('splits at the commas outside parentheses and quotes', () => {
    expect(
      splitTopLevel(
        `ADD COLUMN "a" DECIMAL(10, 2) DEFAULT 'x,y',\nDROP COLUMN "b, c",\n  ALTER COLUMN "d" SET DATA TYPE INT4 USING (COALESCE("d", 0)), `,
      ),
    ).toStrictEqual([
      `ADD COLUMN "a" DECIMAL(10, 2) DEFAULT 'x,y'`,
      'DROP COLUMN "b, c"',
      'ALTER COLUMN "d" SET DATA TYPE INT4 USING (COALESCE("d", 0))',
    ])
  })
})
