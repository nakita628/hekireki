import { describe, expect, it } from 'vite-plus/test'

import { makeSnippetText } from './snippet.js'

describe('makeSnippetText', () => {
  it('drops tab stops and keeps makePlaceholder defaults', () => {
    expect(makeSnippetText({ text: 'provider = $0' })).toBe('provider = ')
    expect(makeSnippetText({ text: '@relation(fields: [${1:field}], references: [$2])' })).toBe(
      '@relation(fields: [field], references: [])',
    )
  })
})
