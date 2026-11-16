import { describe, expect, it } from 'vite-plus/test'

import { isLoopbackHostname } from './index.js'

describe('isLoopbackHostname', () => {
  it('accepts localhost, its subdomains and loopback addresses', () => {
    expect(isLoopbackHostname('localhost')).toBe(true)
    expect(isLoopbackHostname('LOCALHOST')).toBe(true)
    expect(isLoopbackHostname('app.localhost')).toBe(true)
    expect(isLoopbackHostname('127.0.0.1')).toBe(true)
    expect(isLoopbackHostname('[::1]')).toBe(true)
    expect(isLoopbackHostname('::1')).toBe(true)
  })

  it('rejects every other host', () => {
    expect(isLoopbackHostname('evil.example')).toBe(false)
    expect(isLoopbackHostname('192.168.1.20')).toBe(false)
    expect(isLoopbackHostname('localhost.example')).toBe(false)
    expect(isLoopbackHostname('')).toBe(false)
  })
})
