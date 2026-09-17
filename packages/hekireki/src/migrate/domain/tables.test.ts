import type { DMMF } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
import type { GetDMMFError } from '@prisma/get-dmmf'
import { describe, expect, it } from 'vite-plus/test'

import { makeExpectedTables } from './tables.js'

function datamodel(schema: string) {
  const result: DMMF.Document | GetDMMFError = getDMMF({
    datamodel: [['schema.prisma', `datasource db {\n  provider = "postgresql"\n}\n${schema}`]],
  })
  if ('type' in result) throw new Error(result.error.message)
  return result.datamodel
}

describe('makeExpectedTables', () => {
  it('maps models and fields to tables and columns, @map and @@map applied', () => {
    const [user] = makeExpectedTables(
      datamodel(`
enum Role {
  ADMIN  @map("admin")
  VIEWER @map("viewer")
}

model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique @map("email_address")
  role      Role     @default(VIEWER)
  nickname  String?
  tags      String[]
  updatedAt DateTime @updatedAt
  token     String   @default(uuid())
  code      String   @default("x") @db.VarChar(8)
  createdAt DateTime @default(now())

  @@map("users")
}
`),
    )
    expect(user?.table).toBe('users')
    expect(user?.columns.map((c) => [c.column, c.required, c.databaseDefault])).toStrictEqual([
      ['id', true, true],
      ['email_address', true, false],
      ['role', true, true],
      ['nickname', false, false],
      // A scalar list is created without NOT NULL.
      ['tags', false, false],
      // Prisma Client fills these; the column has no default of its own.
      ['updatedAt', true, false],
      ['token', true, false],
      ['code', true, true],
      ['createdAt', true, true],
    ])
    expect(user?.columns.find((c) => c.field === 'code')?.nativeType).toStrictEqual([
      'VarChar',
      ['8'],
    ])
    expect(user?.columns.find((c) => c.field === 'role')?.enumValues).toStrictEqual([
      'admin',
      'viewer',
    ])
    expect(user?.uniques).toStrictEqual([
      { fields: ['id'], columns: ['id'] },
      { fields: ['email'], columns: ['email_address'] },
    ])
  })

  it('keeps composite keys and points foreign keys at the mapped columns of the target', () => {
    const tables = makeExpectedTables(
      datamodel(`
model Account {
  tenant String
  code   String @map("account_code")
  orders Order[]

  @@id([tenant, code])
  @@map("accounts")
}

model Order {
  id      Int     @id
  tenant  String
  code    String
  account Account @relation(fields: [tenant, code], references: [tenant, code])

  @@unique([tenant, id])
}
`),
    )
    const order = tables.find((t) => t.model === 'Order')
    expect(order?.foreignKeys).toStrictEqual([
      {
        field: 'account',
        fromColumns: ['tenant', 'code'],
        toModel: 'Account',
        toTable: 'accounts',
        toSchema: null,
        toColumns: ['tenant', 'account_code'],
      },
    ])
    expect(order?.uniques.map((u) => u.fields)).toStrictEqual([['id'], ['tenant', 'id']])
    expect(tables.find((t) => t.model === 'Account')?.uniques).toStrictEqual([
      { fields: ['tenant', 'code'], columns: ['tenant', 'account_code'] },
    ])
  })

  it('adds the join table of an implicit many-to-many once, with its A and B keys', () => {
    const tables = makeExpectedTables(
      datamodel(`
model Post {
  id   Int   @id
  tags Tag[]
}

model Tag {
  id    String @id @map("tag_id")
  posts Post[]
}
`),
    )
    expect(tables.map((t) => t.table)).toStrictEqual(['Post', 'Tag', '_PostToTag'])
    const join = tables.at(-1)
    expect(join?.columns.map((c) => [c.column, c.type])).toStrictEqual([
      ['A', 'Int'],
      ['B', 'String'],
    ])
    expect(join?.foreignKeys.map((fk) => [fk.fromColumns, fk.toTable, fk.toColumns])).toStrictEqual(
      [
        [['A'], 'Post', ['id']],
        [['B'], 'Tag', ['tag_id']],
      ],
    )
  })
})
