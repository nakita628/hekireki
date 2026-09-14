import { describe, expect, it } from 'vite-plus/test'

import { formatSql } from './format.js'

/** The text with every run of whitespace made one space, none inside parentheses: what formatting must not change. */
function squeezed(text: string) {
  return text.replaceAll(/\s+/gu, ' ').replaceAll('( ', '(').replaceAll(' )', ')').trim()
}

describe('formatSql', () => {
  it('lays a Prisma Client SELECT out a clause per line, the columns one per line', () => {
    const sql =
      "SELECT `main`.`User`.`id`, `main`.`User`.`email` FROM `main`.`User` WHERE `main`.`User`.`email` LIKE ('%' || ? || '%') ORDER BY `main`.`User`.`id` ASC LIMIT ? OFFSET ?"
    expect(formatSql(sql)).toBe(`SELECT
  \`main\`.\`User\`.\`id\`,
  \`main\`.\`User\`.\`email\`
FROM \`main\`.\`User\`
WHERE \`main\`.\`User\`.\`email\` LIKE ('%' || ? || '%')
ORDER BY \`main\`.\`User\`.\`id\` ASC
LIMIT ?
OFFSET ?`)
    expect(squeezed(formatSql(sql))).toBe(sql)
  })

  it('indents a subquery inside its parentheses', () => {
    const sql =
      'SELECT COUNT(*) AS `_count$_all` FROM (SELECT `main`.`User`.`id` FROM `main`.`User` WHERE 1=1 LIMIT ? OFFSET ?) AS `sub`'
    expect(formatSql(sql)).toBe(`SELECT
  COUNT(*) AS \`_count$_all\`
FROM (
  SELECT
    \`main\`.\`User\`.\`id\`
  FROM \`main\`.\`User\`
  WHERE 1=1
  LIMIT ?
  OFFSET ?
) AS \`sub\``)
  })

  it('breaks the AND / OR of a condition, not those inside parentheses or of a BETWEEN', () => {
    const sql =
      'SELECT "public"."Post"."id" FROM "public"."Post" LEFT JOIN "public"."User" AS "t1" ON "t1"."id" = "public"."Post"."authorId" AND "t1"."role" = $1 WHERE ("public"."Post"."published" = $2 OR "public"."Post"."viewCount" BETWEEN $3 AND $4) AND "public"."Post"."id" IN (SELECT "postId" FROM "public"."Tag" WHERE "name" = $5)'
    expect(formatSql(sql)).toBe(`SELECT
  "public"."Post"."id"
FROM "public"."Post"
LEFT JOIN "public"."User" AS "t1" ON "t1"."id" = "public"."Post"."authorId"
  AND "t1"."role" = $1
WHERE ("public"."Post"."published" = $2 OR "public"."Post"."viewCount" BETWEEN $3 AND $4)
  AND "public"."Post"."id" IN (
  SELECT
    "postId"
  FROM "public"."Tag"
  WHERE "name" = $5
)`)
    expect(squeezed(formatSql(sql))).toBe(sql)
  })

  it('lays out writes: the VALUES tuples and the RETURNING list one per line', () => {
    expect(
      formatSql(
        'INSERT INTO "public"."User" ("id","email") VALUES ($1,$2), ($3,$4) RETURNING "public"."User"."id", "public"."User"."email"',
      ),
    ).toBe(`INSERT INTO "public"."User" ("id","email")
VALUES
  ($1,$2),
  ($3,$4)
RETURNING
  "public"."User"."id",
  "public"."User"."email"`)
    expect(
      formatSql(
        'UPDATE `main`.`Post` SET `title` = ?, `viewCount` = `viewCount` + ? WHERE `main`.`Post`.`id` = ? AND 1=1',
      ),
    ).toBe(`UPDATE \`main\`.\`Post\`
SET
  \`title\` = ?,
  \`viewCount\` = \`viewCount\` + ?
WHERE \`main\`.\`Post\`.\`id\` = ?
  AND 1=1`)
    expect(formatSql('DELETE FROM `main`.`Tag` WHERE `main`.`Tag`.`id` IN (?,?)')).toBe(
      `DELETE FROM \`main\`.\`Tag\`
WHERE \`main\`.\`Tag\`.\`id\` IN (?,?)`,
    )
    expect(
      formatSql(
        'INSERT INTO "t" ("a") VALUES ($1) ON CONFLICT ("a") DO UPDATE SET "a" = excluded."a"',
      ),
    ).toBe(`INSERT INTO "t" ("a")
VALUES
  ($1)
ON CONFLICT ("a") DO UPDATE
SET
  "a" = excluded."a"`)
  })

  it('keeps SELECT DISTINCT on its line, a FROM inside a call inline, and short statements as they are', () => {
    expect(formatSql('SELECT DISTINCT a, b FROM t')).toBe(`SELECT DISTINCT
  a,
  b
FROM t`)
    expect(formatSql('SELECT EXTRACT(YEAR FROM created) FROM t')).toBe(`SELECT
  EXTRACT(YEAR FROM created)
FROM t`)
    expect(formatSql('COMMIT')).toBe('COMMIT')
    expect(formatSql('BEGIN; SELECT 1')).toBe(`BEGIN;
SELECT
  1`)
    expect(formatSql('')).toBe('')
  })

  it('keeps the AND of a BETWEEN at the top of a condition on its line', () => {
    expect(formatSql('SELECT a FROM t WHERE a BETWEEN 1 AND 2 AND b = 3')).toBe(`SELECT
  a
FROM t
WHERE a BETWEEN 1 AND 2
  AND b = 3`)
  })

  it('returns text it cannot read as it is', () => {
    expect(formatSql("SELECT 'unterminated")).toBe("SELECT 'unterminated")
  })
})

describe('formatSql on every shape of statement', () => {
  const CORPUS = [
    "SELECT `main`.`User`.`id`, `main`.`User`.`email` FROM `main`.`User` WHERE `main`.`User`.`email` LIKE ('%' || ? || '%') ORDER BY `main`.`User`.`id` ASC LIMIT ? OFFSET ?",
    'SELECT COUNT(*) AS `_count$_all` FROM (SELECT `main`.`User`.`id` FROM `main`.`User` WHERE 1=1 LIMIT ? OFFSET ?) AS `sub`',
    // PostgreSQL with relationJoins: a LATERAL subquery that aggregates the relation as JSON.
    `SELECT "t1"."id", "t1"."email", COALESCE("User_posts"."__prisma_data__", '[]') AS "posts" FROM "public"."User" AS "t1" LEFT JOIN LATERAL (SELECT COALESCE(JSONB_AGG("__prisma_data__"), '[]') AS "__prisma_data__" FROM (SELECT "t4"."__prisma_data__" FROM (SELECT JSONB_BUILD_OBJECT('title', "t3"."title") AS "__prisma_data__", "t3"."id" FROM (SELECT "t2".* FROM "public"."Post" AS "t2" WHERE "t1"."id" = "t2"."authorId" AND "t2"."published" = $1) AS "t3") AS "t4" ORDER BY "t4"."id" ASC) AS "t5") AS "User_posts" ON true WHERE "t1"."email" LIKE $2 ORDER BY "t1"."id" ASC OFFSET $3`,
    'INSERT INTO `seed`.`Post` (`title`,`published`,`authorId`) VALUES (?,?,?), (?,?,?)',
    'INSERT INTO "t" ("a") VALUES ($1) ON CONFLICT ("a") DO UPDATE SET "a" = excluded."a" RETURNING *',
    'INSERT INTO t (a) VALUES (1) ON DUPLICATE KEY UPDATE a = VALUES(a)',
    'UPDATE "public"."Post" SET "title" = $1, "viewCount" = "viewCount" + $2 WHERE ("public"."Post"."id" = $3 AND 1=1) RETURNING "public"."Post"."id"',
    'DELETE FROM `main`.`Tag` WHERE `main`.`Tag`.`id` IN (?,?) AND (`main`.`Tag`.`name` = ? OR `main`.`Tag`.`name` IS NULL)',
    "WITH recent AS (SELECT id FROM posts WHERE created > now() - interval '7 days') SELECT u.id FROM users u JOIN recent r ON r.id = u.id",
    'SELECT a FROM t1 UNION ALL SELECT b FROM t2 INTERSECT SELECT c FROM t3 EXCEPT SELECT d FROM t4',
    'SELECT id, row_number() OVER (PARTITION BY author ORDER BY created DESC) AS n FROM posts GROUP BY id, author HAVING count(*) > 1 AND max(id) > 2 ORDER BY n',
    'SELECT a FROM t CROSS JOIN u FULL OUTER JOIN v ON v.id = t.id RIGHT JOIN w ON w.id = t.id INNER JOIN x ON x.id = t.id',
    'SELECT a FROM t WHERE a IS DISTINCT FROM b AND c BETWEEN 1 AND 2 OR d NOT IN (SELECT e FROM f)',
    'select distinct a, b from t where a = 1 and b = 2 order by a limit 10 offset 5',
    'SELECT a FROM t FETCH FIRST 10 ROWS ONLY',
    'SELECT a /* keep me */ FROM t -- and me\nWHERE b = 1',
    'BEGIN; UPDATE t SET a = 1; COMMIT',
    'COMMIT',
    'SELECT 1',
  ]

  /** The text with whitespace made one space, and none inside parentheses: what formatting must not change. */
  function squeezedOf(text: string) {
    return text.replaceAll(/\s+/gu, ' ').replaceAll('( ', '(').replaceAll(' )', ')').trim()
  }

  it.each(CORPUS)('changes nothing but whitespace in %s', (sql) => {
    expect(squeezedOf(formatSql(sql))).toBe(squeezedOf(sql))
  })

  it.each(CORPUS)('lays out its own output the same way again: %s', (sql) => {
    expect(formatSql(formatSql(sql))).toBe(formatSql(sql))
  })

  it('keeps the comments where they were written', () => {
    expect(formatSql('SELECT a /* keep me */ FROM t -- and me\nWHERE b = 1')).toBe(`SELECT
  a /* keep me */
FROM t -- and me
WHERE b = 1`)
  })

  it('lays out a PostgreSQL relation join, each subquery one level further in', () => {
    expect(formatSql(CORPUS[2] ?? '')).toBe(`SELECT
  "t1"."id",
  "t1"."email",
  COALESCE("User_posts"."__prisma_data__", '[]') AS "posts"
FROM "public"."User" AS "t1"
LEFT JOIN LATERAL (
  SELECT
    COALESCE(JSONB_AGG("__prisma_data__"), '[]') AS "__prisma_data__"
  FROM (
    SELECT
      "t4"."__prisma_data__"
    FROM (
      SELECT
        JSONB_BUILD_OBJECT('title', "t3"."title") AS "__prisma_data__",
        "t3"."id"
      FROM (
        SELECT
          "t2".*
        FROM "public"."Post" AS "t2"
        WHERE "t1"."id" = "t2"."authorId"
          AND "t2"."published" = $1
      ) AS "t3"
    ) AS "t4"
    ORDER BY "t4"."id" ASC
  ) AS "t5"
) AS "User_posts" ON true
WHERE "t1"."email" LIKE $2
ORDER BY "t1"."id" ASC
OFFSET $3`)
  })

  it('reads keywords in any case, and keeps an ORDER BY inside OVER (...) on its line', () => {
    expect(
      formatSql('select distinct a, b from t where a = 1 and b = 2 order by a limit 10 offset 5'),
    ).toBe(`select distinct
  a,
  b
from t
where a = 1
  and b = 2
order by a
limit 10
offset 5`)
    expect(formatSql(CORPUS[10] ?? '')).toBe(`SELECT
  id,
  row_number() OVER (PARTITION BY author ORDER BY created DESC) AS n
FROM posts
GROUP BY id, author
HAVING count(*) > 1
  AND max(id) > 2
ORDER BY n`)
  })

  it('keeps IS DISTINCT FROM in its condition, and each set operation on a line of its own', () => {
    expect(formatSql(CORPUS[12] ?? '')).toBe(`SELECT
  a
FROM t
WHERE a IS DISTINCT FROM b
  AND c BETWEEN 1 AND 2
  OR d NOT IN (
  SELECT
    e
  FROM f
)`)
    expect(formatSql(CORPUS[9] ?? '')).toBe(`SELECT
  a
FROM t1
UNION ALL
SELECT
  b
FROM t2
INTERSECT
SELECT
  c
FROM t3
EXCEPT
SELECT
  d
FROM t4`)
  })
})
