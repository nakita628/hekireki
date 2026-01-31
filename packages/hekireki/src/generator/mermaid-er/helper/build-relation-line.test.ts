import { describe, expect, it } from 'vitest'
import { buildRelationLine } from './build-relation-line'

// Test run
// pnpm vitest run ./src/generator/mermaid-er/helper/build-relation-line.test.ts

const buildRelationLineTestCases = [
  { input: 'zero-one-to-zero-one', expected: '|o--|o' },
  { input: 'zero-one-to-one', expected: '|o--||' },
  { input: 'zero-one-to-zero-many', expected: '|o--}o' },
  { input: 'zero-one-to-many', expected: '|o--}|' },
  { input: 'zero-one-to-zero-one-optional', expected: '|o..|o' },
  { input: 'zero-one-to-one-optional', expected: '|o..||' },
  { input: 'zero-one-to-zero-many-optional', expected: '|o..}o' },
  { input: 'zero-one-to-many-optional', expected: '|o..}|' },
  { input: 'one-to-zero-one', expected: '||--|o' },
  { input: 'one-to-one', expected: '||--||' },
  { input: 'one-to-zero-many', expected: '||--}o' },
  { input: 'one-to-many', expected: '||--}|' },
  { input: 'one-to-zero-one-optional', expected: '||..|o' },
  { input: 'one-to-one-optional', expected: '||..||' },
  { input: 'one-to-zero-many-optional', expected: '||..}o' },
  { input: 'one-to-many-optional', expected: '||..}|' },
  { input: 'zero-many-to-zero-one', expected: '}o--|o' },
  { input: 'zero-many-to-one', expected: '}o--||' },
  { input: 'zero-many-to-zero-many', expected: '}o--}o' },
  { input: 'zero-many-to-many', expected: '}o--}|' },
  { input: 'zero-many-to-zero-one-optional', expected: '}o..|o' },
  { input: 'zero-many-to-one-optional', expected: '}o..||' },
  { input: 'zero-many-to-zero-many-optional', expected: '}o..}o' },
  { input: 'zero-many-to-many-optional', expected: '}o..}|' },
  { input: 'many-to-zero-one', expected: '}|--|o' },
  { input: 'many-to-one', expected: '}|--||' },
  { input: 'many-to-zero-many', expected: '}|--}o' },
  { input: 'many-to-many', expected: '}|--}|' },
  { input: 'many-to-zero-one-optional', expected: '}|..|o' },
  { input: 'many-to-one-optional', expected: '}|..||' },
  { input: 'many-to-zero-many-optional', expected: '}|..}o' },
  { input: 'many-to-many-optional', expected: '}|..}|' },
  { input: 'zero-many-to-zero-one-optional', expected: '}o..|o' },
  { input: 'zero-many-to-one-optional', expected: '}o..||' },
  { input: 'zero-many-to-zero-many-optional', expected: '}o..}o' },
  { input: 'zero-many-to-many-optional', expected: '}o..}|' },
  { input: 'many-to-zero-one-optional', expected: '}|..|o' },
  { input: 'many-to-one-optional', expected: '}|..||' },
  { input: 'many-to-zero-many-optional', expected: '}|..}o' },
  { input: 'many-to-many-optional', expected: '}|..}|' },
  { input: 'zero-one-to-zero-one-optional', expected: '|o..|o' },
  { input: 'zero-one-to-one-optional', expected: '|o..||' },
]

describe('buildRelationLine', () => {
  it.each(buildRelationLineTestCases)('should return $expected for input $input', ({
    input,
    expected,
  }) => {
    const result = buildRelationLine(input)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe(expected)
    }
  })

  it('should return error for invalid input format', () => {
    const result = buildRelationLine('invalid')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('Invalid input format: invalid')
    }
  })

  it('should return error for invalid from relationship', () => {
    const result = buildRelationLine('invalid-to-one')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('Invalid relationship: invalid')
    }
  })

  it('should return error for invalid to relationship', () => {
    const result = buildRelationLine('one-to-invalid')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('Invalid relationship: invalid')
    }
  })
})
