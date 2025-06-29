import { describe, it, expect } from 'vitest'
import {
  excludeManyToOneRelations,
  extractRelations,
  isRelationship,
  parseRelation,
  removeDuplicateRelations,
} from '.'

// Test run
// pnpm vitest run ./src/generator/mermaid-er/validator/index.test.ts

describe('relations module barrel file exports', () => {
  it('should export excludeManyToOneRelations', () => {
    expect(typeof excludeManyToOneRelations).toBe('function')
  })

  it('should export extractRelations', () => {
    expect(typeof extractRelations).toBe('function')
  })

  it('should export isRelationship', () => {
    expect(typeof isRelationship).toBe('function')
  })

  it('should export parseRelation', () => {
    expect(typeof parseRelation).toBe('function')
  })

  it('should export removeDuplicateRelations', () => {
    expect(typeof removeDuplicateRelations).toBe('function')
  })
})
