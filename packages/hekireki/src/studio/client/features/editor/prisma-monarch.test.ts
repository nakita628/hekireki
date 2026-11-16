import { describe, expect, it } from 'vite-plus/test'

import { WORD_PATTERN } from './prisma-monarch.js'

function words(text: string) {
  return text.match(new RegExp(WORD_PATTERN.source, 'gu')) ?? []
}

describe('WORD_PATTERN', () => {
  it('keeps the attribute prefix and dotted names together', () => {
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
