import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { DMMF } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
import type { GetDMMFError } from '@prisma/get-dmmf'
import { Effect, Exit } from 'effect'
import { afterAll, describe, expect, it } from 'vite-plus/test'

import { queryExamples } from '../generator/query-examples.js'
import { compileQueries } from './query-compiler.js'

const MODELS = `
model User {
  id    Int    @id @default(autoincrement())
  email String @unique
  posts Post[]
}

model Post {
  id       Int  @id @default(autoincrement())
  authorId Int
  author   User @relation(fields: [authorId], references: [id])
}
`

// This package resolves `@prisma/client` as a project with it installed would.
const HERE = import.meta.dirname

const outside = mkdtempSync(path.join(tmpdir(), 'hekireki-query-compiler-'))

afterAll(() => {
  rmSync(outside, { recursive: true, force: true })
})

function compile(provider: 'postgresql' | 'mysql' | 'sqlite', schemaPath = HERE) {
  const text = `datasource db {\n  provider = "${provider}"\n}\n${MODELS}`
  const result: DMMF.Document | GetDMMFError = getDMMF({ datamodel: [['schema.prisma', text]] })
  if ('type' in result) throw new Error(result.error.message)
  return Effect.runPromiseExit(
    compileQueries({
      schemaPath,
      datamodel: text,
      dialect: provider,
      examples: queryExamples(result.datamodel),
    }),
  )
}

describe('compileQueries', () => {
  it.each([
    ['postgresql', 'SELECT "public"."User"."id", "public"."User"."email" FROM "public"."User"'],
    ['mysql', 'SELECT `User`.`id`, `User`.`email` FROM `User`'],
    ['sqlite', 'SELECT `main`.`User`.`id`, `main`.`User`.`email` FROM `main`.`User`'],
  ] as const)('compiles every query on %s, with no database', async (provider, select) => {
    const exit = await compile(provider)
    if (!Exit.isSuccess(exit)) throw new Error(String(exit.cause))
    const compiled = exit.value
    expect(compiled.every((query) => query.error === null)).toBe(true)
    const findMany = compiled.find((query) => query.example.code === 'await prisma.user.findMany()')
    expect(findMany?.statements?.[0]?.sql.startsWith(select)).toBe(true)
  })

  it('reads a relation with a query of its own, bound to the rows before', async () => {
    const exit = await compile('postgresql')
    if (!Exit.isSuccess(exit)) throw new Error(String(exit.cause))
    const include = exit.value.find(
      (query) => query.example.code === 'await prisma.user.findMany({ include: { posts: true } })',
    )
    expect(include?.statements).toHaveLength(2)
    expect(include?.statements?.[1]?.params).toStrictEqual(['<id of the rows above>', '0'])
  })

  it('fails where the schema has no @prisma/client to compile with', async () => {
    const exit = await compile('postgresql', path.join(outside, 'schema.prisma'))
    expect(Exit.isFailure(exit) && String(exit.cause)).toContain('@prisma/client is not installed')
  })
})
