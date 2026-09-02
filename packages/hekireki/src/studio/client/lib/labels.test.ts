import { describe, expect, it } from 'vite-plus/test'

import type { Field } from '../../server/routes/index.js'
import { fieldTypeLabel, firstLine } from './labels.js'

function field(overrides: Partial<Field>): Field {
  return {
    name: 'title',
    dbName: null,
    kind: 'scalar',
    type: 'String',
    isList: false,
    isRequired: true,
    isId: false,
    isUnique: false,
    isUpdatedAt: false,
    isForeignKey: false,
    default: null,
    nativeType: null,
    documentation: null,
    annotations: [],
    relation: null,
    attributes: [],
    ...overrides,
  }
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

describe('firstLine', () => {
  it('returns the trimmed first line of a doc comment', () => {
    expect(firstLine('  The title.  \nSecond line')).toBe('The title.')
  })

  it('returns an empty string when there is no documentation', () => {
    expect(firstLine(null)).toBe('')
  })
})
