import { describe, expect, it } from 'vite-plus/test'

import { placeholder, qualifiedName, quoteIdentifier } from './identifier.js'

// The names and placeholders every statement hekireki writes is built from: the seed script,
// the checks and the plan, and the SQL console of Studio.
describe('quoteIdentifier and qualifiedName', () => {
  it('quotes as the dialect does, doubling the quote a name holds', () => {
    expect(quoteIdentifier('postgresql', 'User')).toBe('"User"')
    expect(quoteIdentifier('sqlite', 'us"er')).toBe('"us""er"')
    expect(quoteIdentifier('mysql', 'us`er')).toBe('`us``er`')
  })

  it('names the schema of a table that has one, and only the table otherwise', () => {
    expect(qualifiedName('postgresql', { schema: 'auth', table: 'User' })).toBe('"auth"."User"')
    expect(qualifiedName('postgresql', { schema: null, table: 'User' })).toBe('"User"')
    expect(qualifiedName('mysql', { schema: 'app', table: 'User' })).toBe('`app`.`User`')
  })
})

describe('placeholder', () => {
  it('numbers the parameters of PostgreSQL and leaves the others a question mark', () => {
    expect(placeholder('postgresql', 2)).toBe('$2')
    expect(placeholder('mysql', 2)).toBe('?')
    expect(placeholder('sqlite', 1)).toBe('?')
  })
})
