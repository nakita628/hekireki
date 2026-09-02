import { describe, expect, it } from 'vite-plus/test'

import { nextTheme, resolveTheme } from './theme.js'

describe('resolveTheme', () => {
  it('prefers the stored choice, then the system preference', () => {
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme(null, true)).toBe('dark')
    expect(resolveTheme('garbage', false)).toBe('light')
  })
})

describe('nextTheme', () => {
  it('flips between light and dark', () => {
    expect(nextTheme('light')).toBe('dark')
    expect(nextTheme('dark')).toBe('light')
  })
})
