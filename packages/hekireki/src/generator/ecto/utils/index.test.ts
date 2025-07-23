import { describe, expect, it } from 'vitest'
import { prismaTypeToEctoType } from './prisma-type-to-ecto-type.js'

// Test run
// pnpm vitest run ./src/generator/ecto/utils/index.test.ts

describe('ecto utils barrel file exports', () => {
  it('should export prismaTypeToEctoType', () => {
    expect(typeof prismaTypeToEctoType).toBe('function')
  })
})
