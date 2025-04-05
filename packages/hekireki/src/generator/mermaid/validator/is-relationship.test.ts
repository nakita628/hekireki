import { describe, expect, it } from 'vitest'
import { isRelationship } from './is-relationship'

const isRelationshipTestCases = [
  { input: 'zero-one', expected: true },
  { input: 'one', expected: true },
  { input: 'zero-many', expected: true },
  { input: 'many', expected: true },
  { input: 'invalid-key', expected: false },
]

describe('isRelationship', () => {
  it.each(isRelationshipTestCases)(
    'should return $expected for input $input',
    ({ input, expected }) => {
      const result = isRelationship(input)
      expect(result).toBe(expected)
    },
  )
})
