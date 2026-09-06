import { describe, expect, it } from 'vite-plus/test'

import { splitStatements } from './split.js'

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
