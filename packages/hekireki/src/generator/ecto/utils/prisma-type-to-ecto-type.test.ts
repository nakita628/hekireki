import { describe, it, expect } from 'vitest'
import { prismaTypeToEctoType } from '.'

// Test run
// pnpm vitest run ./src/generator/ecto/utils/prisma-type-to-ecto-type.test.ts

describe('prismaTypeToEctoType', () => {
  it('converts Int to :integer', () => {
    expect(prismaTypeToEctoType('Int')).toBe('integer')
  })

  it('converts String to :string', () => {
    expect(prismaTypeToEctoType('String')).toBe('string')
  })

  it('converts Boolean to :boolean', () => {
    expect(prismaTypeToEctoType('Boolean')).toBe('boolean')
  })

  it('converts DateTime to :utc_datetime', () => {
    expect(prismaTypeToEctoType('DateTime')).toBe('utc_datetime')
  })

  it('returns :string for unsupported types', () => {
    expect(prismaTypeToEctoType('Json')).toBe('string')
    expect(prismaTypeToEctoType('Float')).toBe('string')
    expect(prismaTypeToEctoType('BigInt')).toBe('string')
    expect(prismaTypeToEctoType('UnsupportedCustomType')).toBe('string')
  })
})
