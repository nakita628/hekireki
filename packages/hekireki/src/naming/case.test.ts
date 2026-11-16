import { describe, expect, it } from 'vite-plus/test'

import { lowerFirst, makeSnakeCase } from './case.js'

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
