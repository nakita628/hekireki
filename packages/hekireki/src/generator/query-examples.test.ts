import type { DMMF } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
import type { GetDMMFError } from '@prisma/get-dmmf'
import { describe, expect, it } from 'vite-plus/test'

import { planStatements, queryExamples } from './query-examples.js'

function datamodel(schema: string) {
  const result: DMMF.Document | GetDMMFError = getDMMF({
    datamodel: [['schema.prisma', `datasource db {\n  provider = "postgresql"\n}\n${schema}`]],
  })
  if ('type' in result) throw new Error(result.error.message)
  return result.datamodel
}

const SCHEMA = `
model User {
  id    String @id @default(uuid())
  email String @unique
  role  Role   @default(USER)
  posts Post[]
}

model Post {
  id       Int      @id @default(autoincrement())
  title    String
  at       DateTime
  authorId String
  author   User     @relation(fields: [authorId], references: [id])
}

model Follow {
  followerId  String
  followingId String
  since       DateTime @default(now())

  @@id([followerId, followingId])
}

model Tagging {
  postId Int
  tagId  Int

  @@unique([postId, tagId])
}

model Shape {
  id   Int                     @id
  area Unsupported("polygon")
}

enum Role {
  USER
  ADMIN
}
`

describe('queryExamples', () => {
  const examples = queryExamples(datamodel(SCHEMA))
  const codes = (model: string) => examples.filter((e) => e.model === model).map((e) => e.code)

  it('writes every query a model with a key and relations takes', () => {
    expect(codes('Post')).toStrictEqual([
      'await prisma.post.findMany()',
      'await prisma.post.count()',
      'await prisma.post.findMany({ include: { author: true } })',
      'await prisma.post.findUnique({ where: { id: 1 } })',
      "await prisma.post.create({ data: { title: 'example', at: new Date('2026-01-01T00:00:00.000Z'), authorId: 'example' } })",
      "await prisma.post.update({ where: { id: 1 }, data: { title: 'example' } })",
      'await prisma.post.delete({ where: { id: 1 } })',
    ])
  })

  it('finds a row by its compound key under the name Prisma gives it', () => {
    expect(codes('Follow')).toContain(
      "await prisma.follow.findUnique({ where: { followerId_followingId: { followerId: 'example', followingId: 'example' } } })",
    )
  })

  it('finds a row by a compound unique when there is no key', () => {
    expect(codes('Tagging')).toContain(
      'await prisma.tagging.findUnique({ where: { postId_tagId: { postId: 1, tagId: 1 } } })',
    )
  })

  it('leaves out a create for a model with a required field it has no value for', () => {
    expect(codes('Shape')).not.toContain(expect.stringContaining('create('))
    expect(codes('Shape')).toContain('await prisma.shape.delete({ where: { id: 1 } })')
  })

  it('carries the same values in the request the SQL is compiled from', () => {
    const create = examples.find((e) => e.model === 'Post' && e.name === 'create')
    expect(create?.request).toStrictEqual({
      modelName: 'Post',
      action: 'createOne',
      query: {
        arguments: {
          data: {
            title: 'example',
            at: { $type: 'DateTime', value: '2026-01-01T00:00:00.000Z' },
            authorId: 'example',
          },
        },
        selection: { $scalars: true, $composites: true },
      },
    })
  })
})

describe('planStatements', () => {
  const template = (fragments: unknown[], args: unknown[], numbered = true) => ({
    type: 'templateSql',
    fragments,
    args,
    argTypes: [],
    placeholderFormat: { prefix: numbered ? '$' : '?', hasNumbering: numbered },
  })

  it('numbers the placeholders where the database does, and binds a list item by item', () => {
    const plan = {
      type: 'dataMap',
      args: {
        expr: {
          type: 'query',
          args: template(
            [
              { type: 'stringChunk', chunk: 'SELECT "id" FROM "User" WHERE "id" IN ' },
              { type: 'parameterTuple', itemPrefix: '', itemSeparator: ',', itemSuffix: '' },
              { type: 'stringChunk', chunk: ' OFFSET ' },
              { type: 'parameter' },
            ],
            [['a', 'b'], '0'],
          ),
        },
      },
    }
    expect(planStatements(plan)).toStrictEqual([
      { sql: 'SELECT "id" FROM "User" WHERE "id" IN ($1,$2) OFFSET $3', params: ['a', 'b', '0'] },
    ])
  })

  it('names a value the plan computes, and one it reads from the rows before', () => {
    const plan = {
      type: 'let',
      args: {
        bindings: [
          {
            name: '@generated$row0$id',
            expr: {
              type: 'value',
              args: {
                prisma__type: 'generatorCall',
                prisma__value: { name: 'uuid', args: [4], returnType: { type: 'String' } },
              },
            },
          },
        ],
        expr: [
          {
            type: 'query',
            args: template(
              [
                { type: 'stringChunk', chunk: 'INSERT INTO `Post` (`id`, `authorId`) VALUES (' },
                { type: 'parameter' },
                { type: 'stringChunk', chunk: ', ' },
                { type: 'parameter' },
                { type: 'stringChunk', chunk: ')' },
              ],
              [
                { prisma__type: 'param', prisma__value: { name: '@generated$row0$id' } },
                { prisma__type: 'param', prisma__value: { name: '@parent$id' } },
              ],
              false,
            ),
          },
        ],
      },
    }
    expect(planStatements(plan)).toStrictEqual([
      {
        sql: 'INSERT INTO `Post` (`id`, `authorId`) VALUES (?, ?)',
        params: ['<uuid(4)>', '<id of the rows above>'],
      },
    ])
  })
})
