import { Effect } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import { fmt, FormatError } from './index.js'

describe('fmt', () => {
  it.concurrent('formats valid TypeScript code', async () => {
    expect(await Effect.runPromise(fmt('const hekireki = "hekireki";'))).toBe(
      `const hekireki = 'hekireki'\n`,
    )
  })

  it.concurrent('fails with FormatError on invalid syntax', async () => {
    const error = await Effect.runPromise(Effect.flip(fmt('const x = {')))
    expect(error).toBeInstanceOf(FormatError)
    expect(error.message.length > 0).toBe(true)
  })
})
