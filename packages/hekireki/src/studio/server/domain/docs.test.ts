import { Effect } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import { parseSchemaFiles } from '../services/load.js'
import { isScalarType, makeDocs } from './docs.js'

const SCHEMA = `datasource db {
  provider = "postgresql"
}

/// A registered account
model User {
  id        Int      @id @default(autoincrement())
  /// Sign-in address
  email     String   @unique
  role      Role     @default(VIEWER)
  tags      String[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  posts     Post[]

  @@unique([email, role])
  @@index([createdAt])
}

model Post {
  id       Int  @id
  authorId Int
  author   User @relation(fields: [authorId], references: [id])
}

enum Role {
  ADMIN
  VIEWER
}
`

function docsOf(content: string) {
  const { dmmf } = Effect.runSync(parseSchemaFiles({ files: [{ path: 'schema.prisma', content }] }))
  return makeDocs({ dmmf })
}

describe('makeDocs', () => {
  it('renders models with directives, fields and every client operation', () => {
    const docs = docsOf(SCHEMA)
    const user = docs.models.find((m) => m.name === 'User')
    expect(docs.models.map((m) => m.name)).toStrictEqual(['User', 'Post'])
    expect(user?.documentation).toBe('A registered account')
    // As on the original page: `@@unique` comes from uniqueFields and `@@index` from uniqueIndexes.
    expect(user?.directives).toStrictEqual([
      { name: '@@unique', values: ['email', 'role'] },
      { name: '@@index', values: ['email', 'role'] },
    ])
    expect(user?.fields.map((f) => [f.name, f.type, f.directives, f.required])).toStrictEqual([
      ['id', 'Int', ['@id', '@default(autoincrement())'], true],
      ['email', 'String', ['@unique'], true],
      ['role', 'Role', ['@default(VIEWER)'], true],
      ['tags', 'String[]', [], true],
      ['createdAt', 'DateTime', ['@default(now())'], true],
      ['updatedAt', 'DateTime', ['@updatedAt'], true],
      ['posts', 'Post[]', [], true],
    ])
    expect(user?.fields[1]?.documentation).toBe('Sign-in address')
    expect(user?.operations.map((op) => op.name)).toStrictEqual([
      'findUnique',
      'findFirst',
      'findMany',
      'create',
      'update',
      'updateMany',
      'upsert',
      'delete',
      'deleteMany',
    ])
    const findUnique = user?.operations[0]
    expect(findUnique?.description).toBe('Find zero or one User')
    expect(findUnique?.usage).toBe(
      '// Get one User\nconst user = await prisma.user.findUnique({\n  where: {\n    // ... provide filter here\n  }\n})',
    )
    expect(findUnique?.inputs?.map((i) => [i.name, i.required])).toStrictEqual([['where', true]])
    expect(findUnique?.inputs?.[0]?.types).toStrictEqual([
      { type: 'UserWhereUniqueInput', isList: false },
    ])
    expect(findUnique?.output).toStrictEqual({ type: 'User', required: false, list: false })
    const findMany = user?.operations[2]
    expect(findMany?.output).toStrictEqual({ type: 'User', required: true, list: true })
  })

  it('lists the client input and output types', () => {
    const docs = docsOf(SCHEMA)
    expect(docs.inputTypes.some((t) => t.name === 'UserWhereInput')).toBe(true)
    const where = docs.inputTypes.find((t) => t.name === 'UserWhereUniqueInput')
    const email = where?.fields.find((f) => f.name === 'email')
    expect(email?.types).toStrictEqual([{ type: 'String', isList: false }])
    expect(docs.outputTypes.slice(0, 2).map((t) => t.name)).toStrictEqual(['User', 'Post'])
    expect(docs.outputTypes.some((t) => t.name === 'Query' || t.name === 'Mutation')).toBe(false)
    const user = docs.outputTypes.find((t) => t.name === 'User')
    expect(user?.fields.find((f) => f.name === 'email')).toStrictEqual({
      name: 'email',
      types: [{ type: 'String', isList: false }],
      nullable: true,
    })
  })

  it('tells scalars from client API types', () => {
    expect(isScalarType('String')).toBe(true)
    expect(isScalarType('UserWhereInput')).toBe(false)
  })
})
