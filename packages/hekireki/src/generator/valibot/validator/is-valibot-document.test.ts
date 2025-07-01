import { describe, expect, it } from 'vitest'
import { isValibotDocument } from './is-valibot-document'

// Test run
// pnpm vitest run ./src/generator/valibot/validator/is-valibot-document.test.ts

describe('isValibotDocument', () => {
  it.concurrent('isValibotDocument Test', () => {
    const result = isValibotDocument(`Unique identifier for the user
@z.uuid()
@v.pipe(v.string(), v.uuid())`)
    const expected = ['Unique identifier for the user', '@z.uuid()']
    expect(result).toStrictEqual(expected)
  })
})
