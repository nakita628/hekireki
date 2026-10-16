import { describe, expect, it } from 'vite-plus/test'

import { tsString } from './typescript.js'

describe('tsString', () => {
  it('quotes a name and escapes what would end or break the literal', () => {
    expect(tsString("rock 'n' roll")).toBe("'rock \\'n\\' roll'")
    expect(tsString('a\\b')).toBe("'a\\\\b'")
    expect(tsString('two\nlines\r')).toBe("'two\\nlines\\r'")
  })
})
