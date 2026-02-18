import { describe, expect, it } from 'vitest'
import { makeRelationLine, makeRelationLineFromRelation } from './mermaid-er.js'

describe('helper/mermaid-er', () => {
  describe('makeRelationLine', () => {
    const testCases = [
      { input: 'zero-one-to-zero-one', expected: '|o--|o' },
      { input: 'zero-one-to-one', expected: '|o--||' },
      { input: 'zero-one-to-zero-many', expected: '|o--}o' },
      { input: 'zero-one-to-many', expected: '|o--}|' },
      { input: 'zero-one-to-zero-one-optional', expected: '|o..|o' },
      { input: 'zero-one-to-one-optional', expected: '|o..||' },
      { input: 'one-to-zero-one', expected: '||--|o' },
      { input: 'one-to-one', expected: '||--||' },
      { input: 'one-to-zero-many', expected: '||--}o' },
      { input: 'one-to-many', expected: '||--}|' },
      { input: 'one-to-zero-one-optional', expected: '||..|o' },
      { input: 'one-to-one-optional', expected: '||..||' },
      { input: 'many-to-zero-one', expected: '}|--|o' },
      { input: 'many-to-one', expected: '}|--||' },
      { input: 'many-to-many', expected: '}|--}|' },
      { input: 'many-to-many-optional', expected: '}|..}|' },
    ]
    it.each(testCases)('should return $expected for input $input', ({ input, expected }) => {
      const result = makeRelationLine(input)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toBe(expected)
      }
    })

    it('returns error for invalid input', () => {
      const result = makeRelationLine('invalid')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('Invalid input format: invalid')
      }
    })
    it('returns error for invalid from relationship', () => {
      const result = makeRelationLine('invalid-to-one')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('Invalid relationship: invalid')
      }
    })
    it('returns error for invalid to relationship', () => {
      const result = makeRelationLine('one-to-invalid')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('Invalid relationship: invalid')
      }
    })
  })

  describe('makeRelationLineFromRelation', () => {
    it('generates relation line', () => {
      const result = makeRelationLineFromRelation({
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
    it('returns error for unknown type', () => {
      const result = makeRelationLineFromRelation({
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
})
