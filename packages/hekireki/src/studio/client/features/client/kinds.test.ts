import { describe, expect, it } from 'vite-plus/test'

import { completionKindOf } from './kinds.js'

describe('completionKindOf', () => {
  it('shows what TypeScript lists with the Monaco kind of the same name', () => {
    expect(
      ['property', 'method', 'function', 'const', 'let', 'enum member', 'keyword', 'class'].map(
        completionKindOf,
      ),
    ).toStrictEqual([
      'Property',
      'Method',
      'Function',
      'Constant',
      'Variable',
      'EnumMember',
      'Keyword',
      'Class',
    ])
  })

  it('shows a kind TypeScript adds later as plain text rather than failing', () => {
    expect(completionKindOf('accessor')).toBe('Text')
    expect(completionKindOf('')).toBe('Text')
  })
})
