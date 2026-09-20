import { describe, expect, it } from 'vite-plus/test'

import { resolveLanguage } from './language.js'

describe('resolveLanguage', () => {
  it('prefers the stored choice, then the language the browser asks for first', () => {
    expect(resolveLanguage('ja', ['en-US'])).toBe('ja')
    expect(resolveLanguage('en', ['ja-JP'])).toBe('en')
    expect(resolveLanguage(null, ['ja-JP', 'en'])).toBe('ja')
    expect(resolveLanguage(null, ['en-GB', 'ja'])).toBe('en')
    expect(resolveLanguage('fr', [])).toBe('en')
  })
})
