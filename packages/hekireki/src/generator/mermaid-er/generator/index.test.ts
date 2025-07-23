import { describe, expect, it } from 'vitest'
import { erContent, modelFields, modelInfo, relationLine } from '.'

// Test run
// pnpm vitest run ./src/generator/mermaid-er/generator/index.test.ts

describe('er module barrel file exports', () => {
  it('should export erContent', () => {
    expect(typeof erContent).toBe('function')
  })

  it('should export modelInfo', () => {
    expect(typeof modelInfo).toBe('function')
  })

  it('should export modelFields', () => {
    expect(typeof modelFields).toBe('function')
  })

  it('should export relationLine', () => {
    expect(typeof relationLine).toBe('function')
  })
})
