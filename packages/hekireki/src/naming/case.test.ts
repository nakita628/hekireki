import { describe, expect, it } from 'vite-plus/test'

import { constraintName, lowerFirst, makeSnakeCase } from './case.js'

describe('makeSnakeCase', () => {
  it('converts PascalCase to snake_case', () => {
    expect(makeSnakeCase('TodoTag')).toBe('todo_tag')
    expect(makeSnakeCase('User')).toBe('user')
    expect(makeSnakeCase('Category')).toBe('category')
  })
  it('converts camelCase to snake_case', () => {
    expect(makeSnakeCase('todoTag')).toBe('todo_tag')
    expect(makeSnakeCase('userProfile')).toBe('user_profile')
  })
  it('handles single lowercase word', () => {
    expect(makeSnakeCase('tag')).toBe('tag')
  })
  it('handles empty string', () => {
    expect(makeSnakeCase('')).toBe('')
  })
  it('handles consecutive uppercase (acronyms)', () => {
    expect(makeSnakeCase('HTMLParser')).toBe('htmlparser')
    expect(makeSnakeCase('APIKey')).toBe('apikey')
  })
  it('handles single character', () => {
    expect(makeSnakeCase('A')).toBe('a')
  })
  it('handles already snake_case', () => {
    expect(makeSnakeCase('user_profile')).toBe('user_profile')
  })
})

// `User` → `user`: the property Prisma Client exposes a model under, and the label of a type.
describe('lowerFirst', () => {
  it.each([
    ['User', 'user'],
    ['OrderItem', 'orderItem'],
    ['URLThing', 'uRLThing'],
    ['A', 'a'],
    ['user', 'user'],
    ['order_line_item', 'order_line_item'],
    ['_Private', '_Private'],
    ['', ''],
  ])('%s → %s', (text, lowered) => {
    expect(lowerFirst(text)).toBe(lowered)
  })
})

// PostgreSQL's limit of 63 is in bytes, and Prisma Migrate cuts a name at a character boundary
// counting UTF-8 bytes. (#316)
describe('constraintName', () => {
  it('cuts a name of wide characters by UTF-8 bytes, at a character boundary', () => {
    // 22 characters of 3 bytes each: 66 bytes, under 63 characters but over 63 bytes.
    const table = '日'.repeat(22)
    const name = constraintName(table, [], 'pkey', 'postgresql')
    expect(name).toBe(`${'日'.repeat(19)}_pkey`)
    expect(new TextEncoder().encode(name).length).toBeLessThanOrEqual(63)
  })

  it('keeps an ASCII name cut as before', () => {
    expect(constraintName('t'.repeat(70), [], 'idx', 'postgresql')).toBe(`${'t'.repeat(59)}_idx`)
    expect(constraintName('t'.repeat(70), ['c'], 'idx', 'sqlite')).toBe(`${'t'.repeat(70)}_c_idx`)
  })
})
