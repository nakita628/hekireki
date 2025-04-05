import { describe, expect, it } from 'vitest'
import { isZodDocumentValidation } from './is-zod-documentation'

const isZodDocumentValidationTestCases: {
  documentation: string
  expected: string[]
}[] = [
  {
    documentation: `Unique identifier for the user
    @z.string().uuid()
    @v.pipe(v.string(), v.uuid())`,
    expected: ['Unique identifier for the user', '@v.pipe(v.string(), v.uuid())'],
  },
]

describe('isZodDocumentValidation', () => {
  it.concurrent.each(isZodDocumentValidationTestCases)(
    'isZodDocumentValidation($documentation) -> $expected',
    ({ documentation, expected }) => {
      const result = isZodDocumentValidation(documentation)
      expect(result).toEqual(expected)
    },
  )
})
