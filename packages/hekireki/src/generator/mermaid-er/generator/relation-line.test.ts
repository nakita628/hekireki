import { describe, expect, it } from 'vitest'
import { relationLine } from '.'

// Test run
// pnpm vitest run ./src/generator/mermaid-er/generator/relation-line.test.ts

describe('relationLine', () => {
  it.concurrent('relationLine Test', () => {
    const result = relationLine({
      fromModel: 'User',
      fromField: 'id',
      toModel: 'Post',
      toField: 'userId',
      type: 'one-to-many',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe('    User ||--}| Post : "(id) - (userId)"')
    }
  })

  it.concurrent('relationLine returns error for unknown type', () => {
    const result = relationLine({
      fromModel: 'User',
      fromField: 'id',
      toModel: 'Post',
      toField: 'userId',
      type: 'unknown-type',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('Invalid input format: unknown-type')
    }
  })
})
