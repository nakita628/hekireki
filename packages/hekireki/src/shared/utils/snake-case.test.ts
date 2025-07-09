import { describe, it, expect } from 'vitest'
import { snakeCase } from '.'

// Test run
// pnpm vitest run ./src/shared/utils/snake-case.test.ts

describe('snakeCase', () => {
  it('converts PascalCase to snake_case and pluralizes', () => {
    expect(snakeCase('TodoTag')).toBe('todo_tags')
    expect(snakeCase('User')).toBe('users')
    expect(snakeCase('Category')).toBe('categorys')
  })

  it('converts camelCase to snake_case and pluralizes', () => {
    expect(snakeCase('todoTag')).toBe('todo_tags')
    expect(snakeCase('userProfile')).toBe('user_profiles')
  })

  it('handles single lowercase word', () => {
    expect(snakeCase('tag')).toBe('tags')
  })

  it('handles empty string', () => {
    expect(snakeCase('')).toBe('s')
  })
})
