import { describe, expect, it } from 'vitest'
import { isValibot } from './is-valibot'

// Test run
// pnpm vitest run ./src/generator/valibot/validator/is-valibot.test.ts

describe('isValibot', () => {
  it.concurrent('isValibot Test', () => {
    const result = isValibot(`Unique identifier for the user
@z.uuid()
@v.pipe(v.string(), v.uuid())`)
    const expected = 'pipe(v.string(), v.uuid())'
    expect(result).toStrictEqual(expected)
  })
})
