import { afterEach, afterAll, describe, it, expect } from 'vitest'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'

// Test run
// pnpm vitest run ./src/generator/ecto/index.test.ts

describe('prisma generate', () => {
  afterEach(() => {
    // Clean up generated files
    fs.rmSync('./prisma-ecto/schema.prisma', { force: true })
    fs.rmSync('./prisma-ecto/ecto', { recursive: true, force: true })
  })
  afterAll(() => {
    // Clean up the directory itself
    fs.rmSync('./prisma-ecto', { recursive: true, force: true })
  })
  it('hekireki-ecto', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
    url      = env("DATABASE_URL")
}

generator Hekireki-Ecto {
    provider = "hekireki-ecto"
}

model User {
    id    String @id @default(uuid())
    name  String
    posts Post[]
}

model Post {
    id      String @id @default(uuid())
    title   String
    content String
    userId  String
    user    User   @relation(fields: [userId], references: [id])
}
`

    fs.mkdirSync('./prisma-ecto', { recursive: true })
    fs.writeFileSync('./prisma-ecto/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-ecto/schema.prisma')
    const usersResult = fs.readFileSync('./prisma-ecto/ecto/user.ex', {
      encoding: 'utf-8',
    })

    const usersExpected = `defmodule MyApp.User do
  use Ecto.Schema
  @primary_key false
  schema "user" do
    field(:id, :binary_id, primary_key: true)
    field(:name, :string)
  end
end`

    expect(usersResult).toBe(usersExpected)

    const postsresult = fs.readFileSync('./prisma-ecto/ecto/post.ex', {
      encoding: 'utf-8',
    })

    const postsExpected = `defmodule MyApp.Post do
  use Ecto.Schema
  @primary_key false
  schema "post" do
    field(:id, :binary_id, primary_key: true)
    field(:title, :string)
    field(:content, :string)
    field(:userId, :string)
  end
end`

    expect(postsresult).toBe(postsExpected)
  })
})
