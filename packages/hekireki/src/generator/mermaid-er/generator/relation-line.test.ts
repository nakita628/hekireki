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
    const expected = '    User ||--}| Post : "(id) - (userId)"'
    expect(result).toBe(expected)
  })
})
