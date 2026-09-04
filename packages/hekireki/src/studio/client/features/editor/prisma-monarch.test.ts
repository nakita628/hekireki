import { describe, expect, it } from 'vite-plus/test'

import { WORD_PATTERN } from './prisma-monarch.js'

describe('WORD_PATTERN', () => {
  it('keeps the attribute prefix and dotted names together', () => {
    const words = (text: string) => text.match(new RegExp(WORD_PATTERN.source, 'gu')) ?? []
    expect(words('id String @id @default(uuid()) @db.VarChar')).toStrictEqual([
      'id',
      'String',
      '@id',
      '@default',
      'uuid',
      '@db.VarChar',
    ])
    expect(words('@@map("users")')).toStrictEqual(['@@map', 'users'])
    expect(words('@')).toStrictEqual(['@'])
  })
})
