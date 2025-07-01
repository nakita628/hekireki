import { describe, expect, it } from 'vitest'
import { isZodDocument } from './is-zod-document'

// Test run
// pnpm vitest run ./src/generator/zod/validator/is-zod-document.test.ts

describe('isZodDocument', () => {
  it.concurrent('isZodDocument Test', () => {
    const result = isZodDocument(`Unique identifier for the user
    @z.uuid()
    @v.pipe(v.string(), v.uuid())`)
    const expected = ['Unique identifier for the user', '@v.pipe(v.string(), v.uuid())']
    expect(result).toStrictEqual(expected)
  })
})
