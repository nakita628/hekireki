import { describe, expect, it } from 'vitest'
import { PRISMA_TO_ARKTYPE } from './arktype.js'

describe('helper/arktype', () => {
  describe('PRISMA_TO_ARKTYPE', () => {
    it('PRISMA_TO_ARKTYPE maps String to "string"', () => {
      expect(PRISMA_TO_ARKTYPE.String).toBe('"string"')
      expect(PRISMA_TO_ARKTYPE.Int).toBe('"number"')
      expect(PRISMA_TO_ARKTYPE.DateTime).toBe('"Date"')
    })
  })
})
