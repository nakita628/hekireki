import { describe, expect, it } from 'vite-plus/test'

import { fieldTypeLabel } from './labels.js'

type Field = {
  readonly type: string
  readonly isList: boolean
  readonly isRequired: boolean
}

function field(overrides: Partial<Field>): Field {
  return { type: 'String', isList: false, isRequired: true, ...overrides }
}

describe('fieldTypeLabel', () => {
  it('prints a required scalar as its type', () => {
    expect(fieldTypeLabel(field({}))).toBe('String')
  })

  it('marks an optional scalar with a question mark', () => {
    expect(fieldTypeLabel(field({ isRequired: false }))).toBe('String?')
  })

  it('prints a list with brackets and never as optional', () => {
    expect(fieldTypeLabel(field({ type: 'Int', isList: true, isRequired: false }))).toBe('Int[]')
  })
})
