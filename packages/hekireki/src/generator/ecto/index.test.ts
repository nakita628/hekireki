import { exec } from 'node:child_process'
import fs from 'node:fs'
import { promisify } from 'node:util'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

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
}

generator Hekireki-Ecto {
    provider = "hekireki-ecto"
    output   = "ecto"
    app      = "DBSchema"
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

    const usersExpected = `defmodule DBSchema.User do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          name: String.t(),
          posts: [DBSchema.Post.t()]
        }

  schema "user" do
    field(:name, :string)
    has_many(:posts, DBSchema.Post, foreign_key: :userId)
  end
end`

    expect(usersResult).toBe(usersExpected)

    const postsresult = fs.readFileSync('./prisma-ecto/ecto/post.ex', {
      encoding: 'utf-8',
    })

    const postsExpected = `defmodule DBSchema.Post do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          title: String.t(),
          content: String.t(),
          user: DBSchema.User.t() | nil
        }

  schema "post" do
    field(:title, :string)
    field(:content, :string)
    belongs_to(:user, DBSchema.User, foreign_key: :userId, type: :binary_id)
  end
end`

    expect(postsresult).toBe(postsExpected)
  }, 30000)

  it('hekireki-ecto with has_one relation', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator Hekireki-Ecto {
    provider = "hekireki-ecto"
    output   = "ecto"
    app      = "DBSchema"
}

model User {
    id      String   @id @default(uuid())
    name    String
    profile Profile?
}

model Profile {
    id     String @id @default(uuid())
    bio    String
    userId String @unique
    user   User   @relation(fields: [userId], references: [id])
}
`

    fs.mkdirSync('./prisma-ecto', { recursive: true })
    fs.writeFileSync('./prisma-ecto/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-ecto/schema.prisma')

    const userResult = fs.readFileSync('./prisma-ecto/ecto/user.ex', { encoding: 'utf-8' })
    const userExpected = `defmodule DBSchema.User do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          name: String.t(),
          profile: DBSchema.Profile.t() | nil
        }

  schema "user" do
    field(:name, :string)
    has_one(:profile, DBSchema.Profile, foreign_key: :userId)
  end
end`

    expect(userResult).toBe(userExpected)

    const profileResult = fs.readFileSync('./prisma-ecto/ecto/profile.ex', { encoding: 'utf-8' })
    const profileExpected = `defmodule DBSchema.Profile do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          bio: String.t(),
          user: DBSchema.User.t() | nil
        }

  schema "profile" do
    field(:bio, :string)
    belongs_to(:user, DBSchema.User, foreign_key: :userId, type: :binary_id)
  end
end`

    expect(profileResult).toBe(profileExpected)
  }, 30000)

  it('hekireki-ecto with self-referencing relation', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator Hekireki-Ecto {
    provider = "hekireki-ecto"
    output   = "ecto"
    app      = "DBSchema"
}

model User {
    id        String   @id @default(uuid())
    name      String
    followers Follow[] @relation("Follower")
    following Follow[] @relation("Following")
}

model Follow {
    id          String @id @default(uuid())
    followerId  String
    followingId String
    follower    User   @relation("Following", fields: [followerId], references: [id])
    following   User   @relation("Follower", fields: [followingId], references: [id])
}
`

    fs.mkdirSync('./prisma-ecto', { recursive: true })
    fs.writeFileSync('./prisma-ecto/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-ecto/schema.prisma')

    const followResult = fs.readFileSync('./prisma-ecto/ecto/follow.ex', { encoding: 'utf-8' })
    const followExpected = `defmodule DBSchema.Follow do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          follower: DBSchema.User.t() | nil,
          following: DBSchema.User.t() | nil
        }

  schema "follow" do
    belongs_to(:follower, DBSchema.User, foreign_key: :followerId, type: :binary_id)
    belongs_to(:following, DBSchema.User, foreign_key: :followingId, type: :binary_id)
  end
end`

    expect(followResult).toBe(followExpected)

    const userResult = fs.readFileSync('./prisma-ecto/ecto/user.ex', { encoding: 'utf-8' })
    const userExpected = `defmodule DBSchema.User do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          name: String.t(),
          followers: [DBSchema.Follow.t()],
          following: [DBSchema.Follow.t()]
        }

  schema "user" do
    field(:name, :string)
    has_many(:followers, DBSchema.Follow, foreign_key: :followingId)
    has_many(:following, DBSchema.Follow, foreign_key: :followerId)
  end
end`

    expect(userResult).toBe(userExpected)
  }, 30000)
})
