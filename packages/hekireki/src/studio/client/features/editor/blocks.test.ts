import { describe, expect, it } from 'vite-plus/test'

import { blockAtLine, blockRange } from './blocks.js'

const TEXT = `datasource db {
  provider = "sqlite"
}

model User {
  id Int @id
}

enum Role {
  ADMIN
}
`

describe('blockRange', () => {
  it('spans from the header to the closing brace', () => {
    const lines = ['model A {', '  id Int @id', '}', '', 'model B {', '  id Int @id', '}']
    expect(blockRange(lines, 1)).toStrictEqual({ start: 1, end: 3 })
    expect(blockRange(lines, 5)).toStrictEqual({ start: 5, end: 7 })
  })

  it('runs to the end of the text while the block is still open', () => {
    expect(blockRange(['model A {', '  id Int'], 1)).toStrictEqual({ start: 1, end: 2 })
  })
})

describe('blockAtLine', () => {
  it('finds the model or enum surrounding a line', () => {
    expect(blockAtLine(TEXT, 6)).toStrictEqual({ kind: 'model', name: 'User', start: 5, end: 7 })
    expect(blockAtLine(TEXT, 9)).toStrictEqual({ kind: 'enum', name: 'Role', start: 9, end: 11 })
  })

  it('returns null outside model and enum blocks', () => {
    expect(blockAtLine(TEXT, 2)).toBeNull()
    expect(blockAtLine(TEXT, 8)).toBeNull()
  })
})
