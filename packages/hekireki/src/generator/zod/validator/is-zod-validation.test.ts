import { describe, expect, it } from 'vitest'
import { isZodValidation } from './is-zod-validation'

const isZodValidationTestCases: {
  documentation: string
  expected: string | null
}[] = [
  {
    documentation: `Unique identifier for the user
@z.string().uuid()
@v.pipe(v.string(), v.uuid())`,
    expected: 'string().uuid()',
  },
]

describe('isZodValidation', () => {
  it.each(isZodValidationTestCases)(
    'isZodValidation($documentation) -> $expected',
    ({ documentation, expected }) => {
      const result = isZodValidation(documentation)
      expect(result).toBe(expected)
    },
  )
})
