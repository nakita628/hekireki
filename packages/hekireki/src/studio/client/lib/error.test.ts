import { describe, expect, it } from 'vite-plus/test'

import { errorMessage } from './error.js'

describe('errorMessage', () => {
  it('uses the message of an Error', () => {
    expect(errorMessage(new Error('422 Unprocessable Entity'))).toBe('422 Unprocessable Entity')
  })

  it('falls back for anything else', () => {
    expect(errorMessage('boom')).toBe('Request failed')
    expect(errorMessage(undefined)).toBe('Request failed')
  })
})
