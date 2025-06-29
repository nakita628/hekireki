import { describe, expect, it } from 'vitest'
import { isZod } from '.'

/**
 * Test run
 * pnpm vitest run ./src/generator/zod/validator/is-zod.test.ts
 */

describe('isZod', () => {
  it.concurrent('isZod Test', () => {
    const result = isZod(`Unique identifier for the user
@z.uuid()
@v.pipe(v.string(), v.uuid())`)
    expect(result).toBe('uuid()')
  })
})
