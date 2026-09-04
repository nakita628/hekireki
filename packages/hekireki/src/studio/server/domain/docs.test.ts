import { Effect } from 'effect'
import { describe, expect, it } from 'vite-plus/test'

import { parseSchemaFiles } from '../services/load.js'
import { makeDocs } from './docs.js'

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
    // The kind decides what the page links to: relations to the output type, enums to the enum.
    expect(user?.fields.map((f) => f.kind)).toStrictEqual([
      'scalar',
      'scalar',
      'enum',
      'scalar',
      'scalar',
      'scalar',
      'object',
    ])
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
      { type: 'UserWhereUniqueInput', isList: false, location: 'inputObjectTypes' },
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
    expect(email?.types).toStrictEqual([{ type: 'String', isList: false, location: 'scalar' }])
    const role = docs.inputTypes
      .find((t) => t.name === 'UserCreateInput')
      ?.fields.find((f) => f.name === 'role')
    expect(role?.types).toStrictEqual([{ type: 'Role', isList: false, location: 'enumTypes' }])
    expect(docs.outputTypes.slice(0, 2).map((t) => t.name)).toStrictEqual(['User', 'Post'])
    expect(docs.outputTypes.some((t) => t.name === 'Query' || t.name === 'Mutation')).toBe(false)
    const user = docs.outputTypes.find((t) => t.name === 'User')
    expect(user?.fields.find((f) => f.name === 'email')).toStrictEqual({
      name: 'email',
      types: [{ type: 'String', isList: false, location: 'scalar' }],
      nullable: true,
    })
  })

  it('lists the schema enums first, then the ones Prisma derives', () => {
    const docs = docsOf(SCHEMA)
    expect(docs.enumTypes[0]).toStrictEqual({ name: 'Role', values: ['ADMIN', 'VIEWER'] })
    const names = docs.enumTypes.map((t) => t.name)
    expect(names).toContain('SortOrder')
    expect(names).toContain('UserScalarFieldEnum')
    // Every non-scalar type the models and operations mention has a section to link to.
    const sections = new Set([
      ...docs.inputTypes.map((t) => t.name),
      ...docs.outputTypes.map((t) => t.name),
      ...names,
    ])
    const refs = [
      ...docs.inputTypes.flatMap((t) => t.fields.flatMap((f) => f.types)),
      ...docs.outputTypes.flatMap((t) => t.fields.flatMap((f) => f.types)),
      ...docs.models
        .flatMap((m) => m.operations.flatMap((op) => op.inputs ?? []))
        .flatMap((i) => i.types),
    ].filter((ref) => ref.location !== 'scalar' && ref.location !== 'fieldRefTypes')
    expect(refs.length).toBeGreaterThan(0)
    expect(refs.filter((ref) => !sections.has(ref.type))).toStrictEqual([])
  })

  // A datasource with nothing declared under it parses, and Prisma leaves the type lists out of
  // its DMMF rather than answering with empty ones.
  it('has nothing to say about a schema with no models', () => {
    const docs = docsOf('datasource db {\n  provider = "sqlite"\n}\n')
    expect(docs.models).toStrictEqual([])
    expect(docs.outputTypes).toStrictEqual([])
    expect(docs.inputTypes).toStrictEqual([])
    // Prisma still declares its own enums for a schema that declares none of its own.
    expect(docs.enumTypes.map((type) => type.name)).toStrictEqual(['TransactionIsolationLevel'])
  })
})
