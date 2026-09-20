import { describe, expect, it } from 'vite-plus/test'

import { readOnlyStatements, timeoutStatements } from './session.js'

// What the check sends before its first query: nothing it runs afterwards can write, and no
// query of it can run longer than the config allows.
describe('readOnlyStatements', () => {
  it('sets the connection read only, as each database says it', () => {
    expect(readOnlyStatements('postgresql')).toStrictEqual([
      'SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY',
    ])
    expect(readOnlyStatements('mysql')).toStrictEqual(['SET SESSION TRANSACTION READ ONLY'])
    expect(readOnlyStatements('sqlite')).toStrictEqual(['PRAGMA query_only = ON'])
  })
})

describe('timeoutStatements', () => {
  it('sends nothing without a timeout, and nothing to SQLite, which has no such limit', () => {
    expect(timeoutStatements('postgresql', false, null)).toStrictEqual([])
    expect(timeoutStatements('mysql', true, null)).toStrictEqual([])
    expect(timeoutStatements('sqlite', false, 30_000)).toStrictEqual([])
  })

  it('counts milliseconds for PostgreSQL and MySQL, and seconds for MariaDB', () => {
    expect(timeoutStatements('postgresql', false, 1500.4)).toStrictEqual([
      'SET statement_timeout = 1500',
    ])
    expect(timeoutStatements('mysql', false, 1500.4)).toStrictEqual([
      'SET SESSION max_execution_time = 1500',
    ])
    expect(timeoutStatements('mysql', true, 1500)).toStrictEqual([
      'SET SESSION max_statement_time = 1.5',
    ])
  })
})
