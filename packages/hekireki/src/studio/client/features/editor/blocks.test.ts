import { describe, expect, it } from 'vite-plus/test'

import { blockAtLine } from './blocks.js'

const range = (start: number, end: number) => ({
  start: { line: start, character: 0 },
  end: { line: end, character: 1 },
})

// The outline the language server returns for a datasource, a model and an enum.
const SYMBOLS = [
  { name: 'db', kind: 23, range: range(0, 2), selectionRange: range(0, 0) },
  { name: 'User', kind: 5, range: range(4, 6), selectionRange: range(4, 4) },
  { name: 'Role', kind: 10, range: range(8, 10), selectionRange: range(8, 8) },
]

describe('blockAtLine', () => {
  it('finds the model or enum surrounding a 1-based line', () => {
    expect(blockAtLine(SYMBOLS, 6)).toStrictEqual({
      kind: 'Class',
      name: 'User',
      start: 5,
      end: 7,
    })
    expect(blockAtLine(SYMBOLS, 9)).toStrictEqual({ kind: 'Enum', name: 'Role', start: 9, end: 11 })
  })

  it('returns null between blocks and inside configuration blocks', () => {
    expect(blockAtLine(SYMBOLS, 2)).toBeNull()
    expect(blockAtLine(SYMBOLS, 8)).toBeNull()
  })
})
