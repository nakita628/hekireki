import { describe, expect, it } from 'vite-plus/test'

import {
  makeLibsqlQueryResult,
  makeLibsqlRawResult,
  makeMysqlChanges,
  makeMysqlQueryResult,
  makeMysqlRawResult,
  makePgChanges,
  makePgQueryResult,
  makePgRawResult,
  makeSqliteChanges,
  makeSqliteRawResult,
  makeSqliteReadResult,
  READ_STATEMENT,
} from './results.js'

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

describe('the node:sqlite results', () => {
  it('keys the columns by the first row, counts the changes, and keeps the declared types', () => {
    expect(makeSqliteReadResult({ rows: [{ id: 1, label: 'a' }] })).toStrictEqual({
      columns: ['id', 'label'],
      rows: [{ id: 1, label: 'a' }],
      rowCount: 1,
    })
    expect(makeSqliteReadResult({ rows: [] })).toStrictEqual({ columns: [], rows: [], rowCount: 0 })
    expect(makeSqliteChanges({ info: { changes: 2, lastInsertRowid: 7 } })).toBe(2)
    expect(
      makeSqliteRawResult({
        rows: [{ label: 'a', n: 1 }],
        columns: [
          { name: 'label', type: 'TEXT' },
          { name: 'n', type: null },
        ],
      }),
    ).toStrictEqual({
      columns: [
        { name: 'label', nativeType: 'TEXT' },
        { name: 'n', nativeType: null },
      ],
      rows: [['a', 1]],
    })
  })

  it('takes a result that does not read as node:sqlite documents it as empty', () => {
    expect(makeSqliteReadResult({ rows: 'nope' })).toStrictEqual({
      columns: [],
      rows: [],
      rowCount: 0,
    })
    expect(makeSqliteChanges({ info: null })).toBe(0)
  })
})

describe('the pg results', () => {
  it('names the columns from the fields, else the first row, and counts as pg does', () => {
    expect(
      makePgQueryResult({ result: { rows: [{ id: 1 }], fields: [{ name: 'id' }], rowCount: 1 } }),
    ).toStrictEqual({ columns: ['id'], rows: [{ id: 1 }], rowCount: 1 })
    expect(makePgQueryResult({ result: { rows: [{ id: 1 }] } })).toStrictEqual({
      columns: ['id'],
      rows: [{ id: 1 }],
      rowCount: 1,
    })
    expect(
      makePgRawResult({ result: { rows: [[1]], fields: [{ name: 'id', dataTypeID: 23 }] } }),
    ).toStrictEqual({ columns: [{ name: 'id', nativeType: 23 }], rows: [[1]] })
    expect(makePgChanges({ result: { rows: [], rowCount: 3 } })).toBe(3)
    expect(makePgChanges({ result: { rows: [], rowCount: null } })).toBe(0)
  })
})

describe('the mysql2 results', () => {
  it('answers a read with its rows and a write with the rows it changed', () => {
    expect(makeMysqlQueryResult({ result: [[{ id: 1 }], [{ name: 'id' }]] })).toStrictEqual({
      columns: ['id'],
      rows: [{ id: 1 }],
      rowCount: 1,
    })
    expect(makeMysqlQueryResult({ result: [{ affectedRows: 2 }, undefined] })).toStrictEqual({
      columns: [],
      rows: [],
      rowCount: 2,
    })
    expect(makeMysqlRawResult({ result: [[[1]], [{ name: 'id', type: 3 }]] })).toStrictEqual({
      columns: [{ name: 'id', nativeType: 3 }],
      rows: [[1]],
    })
    expect(makeMysqlRawResult({ result: [{ affectedRows: 1 }, undefined] })).toStrictEqual({
      columns: [],
      rows: [],
    })
    expect(makeMysqlChanges({ result: [{ affectedRows: 1 }, undefined] })).toBe(1)
    expect(makeMysqlChanges({ result: [[{ id: 1 }, { id: 2 }], undefined] })).toBe(2)
  })
})
