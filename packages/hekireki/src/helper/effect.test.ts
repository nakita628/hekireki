import { describe, expect, it } from 'vitest'
import { PRISMA_TO_EFFECT } from './effect.js'

describe('helper/effect', () => {
  describe('PRISMA_TO_EFFECT', () => {
    it('PRISMA_TO_EFFECT maps String to Schema.String', () => {
      expect(PRISMA_TO_EFFECT.String).toBe('Schema.String')
      expect(PRISMA_TO_EFFECT.Int).toBe('Schema.Number')
      expect(PRISMA_TO_EFFECT.BigInt).toBe('Schema.BigIntFromSelf')
    })
  })
})
