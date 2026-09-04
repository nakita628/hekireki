import { describe, expect, it } from 'vite-plus/test'

import {
  makeCountStatement,
  makeDeleteStatement,
  makeInsertStatement,
  makePlaceholder,
  makeIdentifier,
  makeSelectStatement,
  makeUpdateStatement,
} from './sql.js'

describe('makeIdentifier and makePlaceholder', () => {
  it('quotes per dialect and escapes embedded quotes', () => {
    expect(makeIdentifier({ dialect: 'postgresql', name: 'user' })).toBe('"user"')
    expect(makeIdentifier({ dialect: 'sqlite', name: 'we"ird' })).toBe('"we""ird"')
    expect(makeIdentifier({ dialect: 'mysql', name: 'order' })).toBe('`order`')
    expect(makePlaceholder({ dialect: 'postgresql', index: 3 })).toBe('$3')
    expect(makePlaceholder({ dialect: 'mysql', index: 3 })).toBe('?')
    expect(makePlaceholder({ dialect: 'sqlite', index: 1 })).toBe('?')
  })
})

describe('makeSelectStatement', () => {
  it('builds a paged, ordered select', () => {
    expect(
      makeSelectStatement({
        dialect: 'sqlite',
        table: 'users',
        columns: ['id', 'email'],
        orderBy: ['id'],
        skip: 20,
        take: 10,
        search: '',
      }),
    ).toStrictEqual({
      sql: 'SELECT "id", "email" FROM "users" ORDER BY "id" LIMIT ? OFFSET ?',
      params: [10, 20],
    })
  })

  it('adds a case-insensitive search across every column', () => {
    expect(
      makeSelectStatement({
        dialect: 'postgresql',
        table: 'users',
        columns: ['id', 'email'],
        orderBy: ['id'],
        skip: 0,
        take: 100,
        search: 'ann',
      }),
    ).toStrictEqual({
      sql: 'SELECT "id", "email" FROM "users" WHERE (CAST("id" AS TEXT) ILIKE $1 OR CAST("email" AS TEXT) ILIKE $2) ORDER BY "id" LIMIT $3 OFFSET $4',
      params: ['%ann%', '%ann%', 100, 0],
    })
    expect(
      makeSelectStatement({
        dialect: 'mysql',
        table: 'users',
        columns: ['id'],
        orderBy: [],
        skip: 0,
        take: 5,
        search: 'x',
      }),
    ).toStrictEqual({
      sql: 'SELECT `id` FROM `users` WHERE (CAST(`id` AS CHAR) LIKE ?) LIMIT ? OFFSET ?',
      params: ['%x%', 5, 0],
    })
  })
})

describe('makeCountStatement', () => {
  it('counts with the same search clause', () => {
    expect(
      makeCountStatement({ dialect: 'sqlite', table: 'users', columns: ['id'], search: '' }),
    ).toStrictEqual({
      sql: 'SELECT COUNT(*) AS "count" FROM "users"',
      params: [],
    })
    expect(
      makeCountStatement({ dialect: 'sqlite', table: 'users', columns: ['id'], search: 'a' }),
    ).toStrictEqual({
      sql: 'SELECT COUNT(*) AS "count" FROM "users" WHERE (CAST("id" AS TEXT) LIKE ?)',
      params: ['%a%'],
    })
  })
})

describe('makeInsertStatement', () => {
  it('inserts the given columns', () => {
    expect(
      makeInsertStatement({
        dialect: 'postgresql',
        table: 'users',
        values: { email: 'a@b', age: 3 },
      }),
    ).toStrictEqual({
      sql: 'INSERT INTO "users" ("email", "age") VALUES ($1, $2)',
      params: ['a@b', 3],
    })
  })

  it('inserts a row of defaults when no values are given', () => {
    expect(makeInsertStatement({ dialect: 'sqlite', table: 'users', values: {} })).toStrictEqual({
      sql: 'INSERT INTO "users" DEFAULT VALUES',
      params: [],
    })
    expect(makeInsertStatement({ dialect: 'mysql', table: 'users', values: {} })).toStrictEqual({
      sql: 'INSERT INTO `users` () VALUES ()',
      params: [],
    })
  })
})

describe('makeUpdateStatement and makeDeleteStatement', () => {
  it('updates by key', () => {
    expect(
      makeUpdateStatement({
        dialect: 'postgresql',
        table: 'follows',
        where: { follower_id: 'a', following_id: 'b' },
        values: { since: 'now' },
      }),
    ).toStrictEqual({
      sql: 'UPDATE "follows" SET "since" = $1 WHERE "follower_id" = $2 AND "following_id" = $3',
      params: ['now', 'a', 'b'],
    })
  })

  it('deletes by key', () => {
    expect(
      makeDeleteStatement({ dialect: 'sqlite', table: 'users', where: { id: 7 } }),
    ).toStrictEqual({
      sql: 'DELETE FROM "users" WHERE "id" = ?',
      params: [7],
    })
  })
})
