import type { DMMF } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
import type { GetDMMFError } from '@prisma/get-dmmf'
import { describe, expect, it } from 'vite-plus/test'

import { ddlBySubject, docsMarkdown, modelDiagramPath } from './docs.js'

function datamodel(schema: string) {
  const result: DMMF.Document | GetDMMFError = getDMMF({
    datamodel: [['schema.prisma', `datasource db {\n  provider = "postgresql"\n}\n${schema}`]],
  })
  if ('type' in result) throw new Error(result.error.message)
  return result.datamodel
}

const SCHEMA = `
/// Who writes.
model User {
  id    Int    @id @default(autoincrement())
  /// Where to write to.
  email String @unique @db.VarChar(255)
  role  Role   @default(USER)
  posts Post[]

  @@map("users")
}

model Post {
  id        Int      @id @default(autoincrement())
  title     String?
  authorId  Int      @map("author_id")
  author    User     @relation(fields: [authorId], references: [id], onDelete: Cascade)
  tags      Tag[]
  updatedAt DateTime @updatedAt

  @@index([authorId])
}

model Tag {
  id    Int    @id
  posts Post[]
}

model Note {
  id Int @id
}

enum Role {
  USER
  ADMIN @map("admin")

  @@map("role")
}
`

describe('docsMarkdown', () => {
  const markdown = docsMarkdown({ datamodel: datamodel(SCHEMA), statements: [], queries: [] })

  it('lists every model and enum with the name the database has for it', () => {
    expect(markdown).toContain('| [User](#model-User) | `users` | Who writes. |')
    expect(markdown).toContain('| [Role](#enum-Role) | `role` |  |')
  })

  it('shows a field with its column, type, constraints, default and comment', () => {
    expect(markdown).toContain(
      '| `email` | `String` `@db.VarChar(255)` | UNIQUE NOT NULL |  | Where to write to. |',
    )
    expect(markdown).toContain('| `role` | [`Role`](#enum-Role) | NOT NULL | `USER` |  |')
    expect(markdown).toContain(
      '| `authorId` (`author_id`) | `Int` | NOT NULL → [User.id](#model-User) |  |  |',
    )
    expect(markdown).toContain('| `title` | `String` | NULL |  |  |')
    expect(markdown).toContain('| `updatedAt` | `DateTime` | NOT NULL | `@updatedAt` |  |')
    // A relation field is no column: it is read under the relations.
    expect(markdown).not.toContain('| `author` |')
  })

  it('reads a relation from both ends, and an implicit many-to-many through its join table', () => {
    expect(markdown).toContain(
      '- `authorId` → [User.id](#model-User) (many-to-one, on delete Cascade)',
    )
    expect(markdown).toContain(
      '- `id` ← [Post.authorId](#model-Post) (one-to-many, on delete Cascade)',
    )
    expect(markdown).toContain('- `tags` ↔ [Tag.posts](#model-Tag) through `_PostToTag`')
    expect(markdown).toContain('- `posts` ↔ [Post.tags](#model-Post) through `_PostToTag`')
  })

  it('links the diagram of a model with a relation, and of no other', () => {
    expect(markdown).toContain(`(${modelDiagramPath('Post')})`)
    expect(markdown).not.toContain(`(${modelDiagramPath('Note')})`)
  })

  it('lists the indexes a block declares', () => {
    expect(markdown).toContain('#### Indexes\n\n- `@@index([authorId])`')
  })

  it('shows an enum with the values the database stores', () => {
    expect(markdown).toContain('Type `role`.\n\n- `USER`\n- `ADMIN` (`admin`)')
  })

  it('leaves the SQL out when there is none', () => {
    expect(markdown).not.toContain('```sql')
  })

  it('puts each statement under what it defines, and every one at the top', () => {
    const statements = [
      "CREATE TYPE \"role\" AS ENUM ('USER', 'admin');",
      'CREATE TABLE "users" (\n    "id" SERIAL NOT NULL\n);',
      'CREATE UNIQUE INDEX "users_email_key" ON "users"("email");',
    ]
    const withSql = docsMarkdown({ datamodel: datamodel(SCHEMA), statements, queries: [] })
    expect(withSql).toContain(
      `<summary>The whole schema as SQL</summary>\n\n\`\`\`sql\n${statements.join('\n\n')}\n\`\`\``,
    )
    expect(withSql).toContain(
      `#### Definition\n\n\`\`\`sql\n${statements[1]}\n\n${statements[2]}\n\`\`\``,
    )
    expect(withSql).toContain(
      `- \`ADMIN\` (\`admin\`)\n\n#### Definition\n\n\`\`\`sql\n${statements[0]}`,
    )
  })
})

describe('docsMarkdown queries', () => {
  const example = (name: string, code: string) => ({
    model: 'Note',
    name,
    description: `The ${name}`,
    code,
  })

  it('shows each query beside the SQL it sends, with the values bound', () => {
    const markdown = docsMarkdown({
      datamodel: datamodel(SCHEMA),
      statements: [],
      queries: [
        {
          example: example('findMany', 'await prisma.note.findMany()'),
          statements: [{ sql: 'SELECT "id" FROM "Note" OFFSET $1', params: ['0'] }],
          error: null,
        },
        {
          example: example('count', 'await prisma.note.count()'),
          statements: null,
          error: 'unsupported',
        },
      ],
    })
    expect(markdown).toContain(
      '<summary>Queries and their SQL</summary>\n\n**findMany**: The findMany\n\n```ts\nawait prisma.note.findMany()\n```\n\n```sql\nSELECT "id" FROM "Note" OFFSET $1\n-- params: ["0"]\n```',
    )
    expect(markdown).toContain(
      '```ts\nawait prisma.note.count()\n```\n\n> The query compiler refused it: unsupported',
    )
  })

  it('shows the calls alone where there is no SQL to show', () => {
    const markdown = docsMarkdown({
      datamodel: datamodel(SCHEMA),
      statements: [],
      queries: [
        {
          example: example('findMany', 'await prisma.note.findMany()'),
          statements: null,
          error: null,
        },
      ],
    })
    expect(markdown).toContain(
      '<summary>Queries</summary>\n\n**findMany**: The findMany\n\n```ts\nawait prisma.note.findMany()\n```\n\n</details>',
    )
  })
})

describe('ddlBySubject', () => {
  it('groups the statements by the table or type they define, in every quoting', () => {
    const grouped = ddlBySubject([
      'CREATE SCHEMA IF NOT EXISTS "public";',
      'CREATE TYPE "Role" AS ENUM (\'USER\');',
      'CREATE TABLE "auth"."User" ("id" TEXT);',
      'CREATE TABLE `Post` (`id` INTEGER);',
      'CREATE INDEX "User_email_idx" ON "auth"."User"("email");',
      'ALTER TABLE `Post` ADD CONSTRAINT `Post_fkey` FOREIGN KEY (`id`) REFERENCES `User`(`id`);',
    ])
    expect([...grouped.keys()]).toStrictEqual(['enum:Role', 'table:User', 'table:Post'])
    expect(grouped.get('table:User')).toHaveLength(2)
    expect(grouped.get('table:Post')).toHaveLength(2)
  })
})
