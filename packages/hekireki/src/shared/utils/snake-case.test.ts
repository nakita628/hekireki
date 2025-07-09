import { describe, it, expect } from 'vitest'
import { snakeCase } from '.'

// Test run
// pnpm vitest run ./src/shared/utils/snake-case.test.ts

describe('snakeCase', () => {
  it('converts PascalCase to snake_case and pluralizes', () => {
    expect(snakeCase('TodoTag')).toBe('todo_tag')
    expect(snakeCase('User')).toBe('user')
    expect(snakeCase('Category')).toBe('category')
  })

  it('converts camelCase to snake_case and pluralizes', () => {
    expect(snakeCase('todoTag')).toBe('todo_tag')
    expect(snakeCase('userProfile')).toBe('user_profile')
  })

  it('handles single lowercase word', () => {
    expect(snakeCase('tag')).toBe('tag')
  })

  it('handles empty string', () => {
    expect(snakeCase('')).toBe('')
  })
})
