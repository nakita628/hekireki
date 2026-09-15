import { describe, expect, it } from 'vite-plus/test'

import { formatSql } from './format.js'

/** The text with all whitespace taken out: what formatting must not change. */
function squeezed(text: string) {
  return text.replaceAll(/\s+/gu, '')
}

const CORPUS = [
  [
    'sqlite',
    "SELECT `main`.`User`.`id`, `main`.`User`.`email` FROM `main`.`User` WHERE `main`.`User`.`email` LIKE ('%' || ? || '%') ORDER BY `main`.`User`.`id` ASC LIMIT ? OFFSET ?",
  ],
  [
    'sqlite',
    'SELECT COUNT(*) AS `_count$_all` FROM (SELECT `main`.`User`.`id` FROM `main`.`User` WHERE 1=1 LIMIT ? OFFSET ?) AS `sub`',
  ],
  // PostgreSQL with relationJoins: a LATERAL subquery that aggregates the relation as JSON.
  [
    'postgresql',
    `SELECT "t1"."id", "t1"."email", COALESCE("User_posts"."__prisma_data__", '[]') AS "posts" FROM "public"."User" AS "t1" LEFT JOIN LATERAL (SELECT COALESCE(JSONB_AGG("__prisma_data__"), '[]') AS "__prisma_data__" FROM (SELECT "t4"."__prisma_data__" FROM (SELECT JSONB_BUILD_OBJECT('title', "t3"."title") AS "__prisma_data__", "t3"."id" FROM (SELECT "t2".* FROM "public"."Post" AS "t2" WHERE "t1"."id" = "t2"."authorId" AND "t2"."published" = $1) AS "t3") AS "t4" ORDER BY "t4"."id" ASC) AS "t5") AS "User_posts" ON true WHERE "t1"."email" LIKE $2 ORDER BY "t1"."id" ASC OFFSET $3`,
  ],
  ['mysql', 'INSERT INTO `seed`.`Post` (`title`,`published`,`authorId`) VALUES (?,?,?), (?,?,?)'],
  [
    'postgresql',
    'INSERT INTO "t" ("a") VALUES ($1) ON CONFLICT ("a") DO UPDATE SET "a" = excluded."a" RETURNING *',
  ],
  ['mysql', 'INSERT INTO t (a) VALUES (1) ON DUPLICATE KEY UPDATE a = VALUES(a)'],
  [
    'postgresql',
    'UPDATE "public"."Post" SET "title" = $1, "viewCount" = "viewCount" + $2 WHERE ("public"."Post"."id" = $3 AND 1=1) RETURNING "public"."Post"."id"',
  ],
  [
    'sqlite',
    'DELETE FROM `main`.`Tag` WHERE `main`.`Tag`.`id` IN (?,?) AND (`main`.`Tag`.`name` = ? OR `main`.`Tag`.`name` IS NULL)',
  ],
  [
    'postgresql',
    "WITH recent AS (SELECT id FROM posts WHERE created > now() - interval '7 days') SELECT u.id FROM users u JOIN recent r ON r.id = u.id",
  ],
  [
    'sqlite',
    'SELECT a FROM t1 UNION ALL SELECT b FROM t2 INTERSECT SELECT c FROM t3 EXCEPT SELECT d FROM t4',
  ],
  [
    'postgresql',
    'SELECT id, row_number() OVER (PARTITION BY author ORDER BY created DESC) AS n FROM posts GROUP BY id, author HAVING count(*) > 1 AND max(id) > 2 ORDER BY n',
  ],
  [
    'postgresql',
    'SELECT a FROM t WHERE a IS DISTINCT FROM b AND c BETWEEN 1 AND 2 OR d NOT IN (SELECT e FROM f)',
  ],
  ['mysql', 'select distinct a, b from t where a = 1 and b = 2 order by a limit 10 offset 5'],
  ['sqlite', 'BEGIN; UPDATE t SET a = 1; COMMIT'],
  ['sqlite', 'COMMIT'],
  [null, 'SELECT 1'],
] as const

describe('formatSql', () => {
  it('lays a Prisma Client SELECT out a clause per line, the columns one per line', () => {
    expect(formatSql(CORPUS[0][1], 'sqlite')).toBe(`SELECT
  \`main\`.\`User\`.\`id\`,
  \`main\`.\`User\`.\`email\`
FROM
  \`main\`.\`User\`
WHERE
  \`main\`.\`User\`.\`email\` LIKE('%' || ? || '%')
ORDER BY
  \`main\`.\`User\`.\`id\` ASC
LIMIT
  ?
OFFSET
  ?`)
  })

  it('indents a subquery inside its parentheses, and a PostgreSQL relation join level by level', () => {
    expect(formatSql(CORPUS[1][1], 'sqlite')).toBe(`SELECT
  COUNT(*) AS \`_count$_all\`
FROM
  (
    SELECT
      \`main\`.\`User\`.\`id\`
    FROM
      \`main\`.\`User\`
    WHERE
      1 = 1
    LIMIT
      ?
    OFFSET
      ?
  ) AS \`sub\``)
    expect(formatSql(CORPUS[2][1], 'postgresql')).toContain(`  LEFT JOIN LATERAL (
    SELECT
      COALESCE(JSONB_AGG("__prisma_data__"), '[]') AS "__prisma_data__"`)
  })

  it.each(CORPUS)('changes nothing but whitespace in [%s] %s', (dialect, sql) => {
    expect(squeezed(formatSql(sql, dialect))).toBe(squeezed(sql))
  })

  it.each(CORPUS)('lays out its own output the same way again: [%s] %s', (dialect, sql) => {
    expect(formatSql(formatSql(sql, dialect), dialect)).toBe(formatSql(sql, dialect))
  })

  it('returns text it cannot read as it is', () => {
    expect(formatSql("SELECT 'unterminated", 'sqlite')).toBe("SELECT 'unterminated")
    expect(formatSql('', null)).toBe('')
  })
})
