import { describe, expect, it } from 'vite-plus/test'

import { makeLibsqlQueryResult, makeLibsqlRawResult, READ_STATEMENT } from './results.js'

describe('READ_STATEMENT', () => {
  it('is a statement answered with rows, however it is cased or indented', () => {
    expect(READ_STATEMENT.test('SELECT 1')).toBe(true)
    expect(READ_STATEMENT.test('  with t as (select 1) select * from t')).toBe(true)
    expect(READ_STATEMENT.test('PRAGMA table_info(users)')).toBe(true)
    expect(READ_STATEMENT.test('UPDATE users SET name = ?')).toBe(false)
    expect(READ_STATEMENT.test('selection')).toBe(false)
  })
})

describe('makeLibsqlQueryResult', () => {
  it('keys the rows by column and counts the rows of a read', () => {
    expect(
      makeLibsqlQueryResult({
        sql: 'SELECT id, label FROM t',
        set: {
          columns: ['id', 'label'],
          columnTypes: ['INTEGER', 'TEXT'],
          rows: [
            [1, 'a'],
            [2, null],
          ],
          rowsAffected: 0,
        },
      }),
    ).toStrictEqual({
      columns: ['id', 'label'],
      rows: [
        { id: 1, label: 'a' },
        { id: 2, label: null },
      ],
      rowCount: 2,
    })
  })

  it('counts the rows a write changed', () => {
    expect(
      makeLibsqlQueryResult({
        sql: 'DELETE FROM t',
        set: { columns: [], columnTypes: [], rows: [], rowsAffected: 3 },
      }),
    ).toStrictEqual({ columns: [], rows: [], rowCount: 3 })
  })
})

describe('makeLibsqlRawResult', () => {
  it('keeps the rows positional, the declared types, and null for an expression', () => {
    expect(
      makeLibsqlRawResult({
        set: {
          columns: ['label', 'n'],
          columnTypes: ['TEXT', ''],
          rows: [['a', 1]],
          rowsAffected: 0,
        },
      }),
    ).toStrictEqual({
      columns: [
        { name: 'label', nativeType: 'TEXT' },
        { name: 'n', nativeType: null },
      ],
      rows: [['a', 1]],
    })
  })
})
