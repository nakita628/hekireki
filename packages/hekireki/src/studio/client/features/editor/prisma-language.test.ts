import { StringStream } from '@codemirror/language'
import { describe, expect, it } from 'vite-plus/test'

import { prismaStartState, prismaToken } from './prisma-language.js'

function tokens(line: string, state = prismaStartState()) {
  const stream = new StringStream(line, 2, 2)
  const out: [string | null, string][] = []
  while (!stream.eol()) {
    stream.start = stream.pos
    const token = prismaToken(stream, state)
    if (stream.pos === stream.start) throw new Error('tokenizer did not advance')
    out.push([token, stream.current()])
  }
  return out.filter(([token]) => token !== null)
}

describe('prismaToken', () => {
  it('marks block headers as keyword and class name', () => {
    expect(tokens('model User {')).toStrictEqual([
      ['keyword', 'model'],
      ['className', 'User'],
    ])
    expect(tokens('enum Role {')).toStrictEqual([
      ['keyword', 'enum'],
      ['className', 'Role'],
    ])
  })

  it('marks field lines as property, type, attributes and strings', () => {
    expect(tokens('  email String @unique @map("email_address") // login')).toStrictEqual([
      ['propertyName', 'email'],
      ['typeName', 'String'],
      ['attributeName', '@unique'],
      ['attributeName', '@map'],
      ['string', '"email_address"'],
      ['comment', '// login'],
    ])
  })

  it('handles relation types, numbers, booleans and block attributes', () => {
    expect(
      tokens('  author User @relation(fields: [authorId], references: [id], onDelete: Cascade)'),
    ).toStrictEqual([
      ['propertyName', 'author'],
      ['typeName', 'User'],
      ['attributeName', '@relation'],
      ['variableName', 'fields'],
      ['variableName', 'authorId'],
      ['variableName', 'references'],
      ['variableName', 'id'],
      ['variableName', 'onDelete'],
      ['typeName', 'Cascade'],
    ])
    expect(tokens('  published Boolean @default(false)')).toStrictEqual([
      ['propertyName', 'published'],
      ['typeName', 'Boolean'],
      ['attributeName', '@default'],
      ['bool', 'false'],
    ])
    expect(tokens('  balance Decimal @db.Decimal(10, 2)')).toStrictEqual([
      ['propertyName', 'balance'],
      ['typeName', 'Decimal'],
      ['attributeName', '@db.Decimal'],
      ['number', '10'],
      ['number', '2'],
    ])
    expect(tokens('  @@map("users")')).toStrictEqual([
      ['attributeName', '@@map'],
      ['string', '"users"'],
    ])
  })

  it('treats a whole comment line and generator settings', () => {
    expect(tokens('/// Blog author')).toStrictEqual([['comment', '/// Blog author']])
    expect(tokens('  provider = "hekireki-zod"')).toStrictEqual([
      ['propertyName', 'provider'],
      ['string', '"hekireki-zod"'],
    ])
  })
})
