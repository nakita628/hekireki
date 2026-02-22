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
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          name: String.t(),
          posts: [DBSchema.Post.t()]
        }

  schema "user" do
    field(:name, :string)
    has_many(:posts, DBSchema.Post, foreign_key: :user_id)
  end
end`

    expect(usersResult).toBe(usersExpected)

    const postsresult = fs.readFileSync('./prisma-ecto/ecto/post.ex', {
      encoding: 'utf-8',
    })

    const postsExpected = `defmodule DBSchema.Post do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          title: String.t(),
          content: String.t(),
          user: DBSchema.User.t() | nil
        }

  schema "post" do
    field(:title, :string)
    field(:content, :string)
    field(:user_id, :binary_id, source: :userId)
    belongs_to(:user, DBSchema.User, foreign_key: :user_id, define_field: false)
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
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          name: String.t(),
          profile: DBSchema.Profile.t() | nil
        }

  schema "user" do
    field(:name, :string)
    has_one(:profile, DBSchema.Profile, foreign_key: :user_id)
  end
end`

    expect(userResult).toBe(userExpected)

    const profileResult = fs.readFileSync('./prisma-ecto/ecto/profile.ex', { encoding: 'utf-8' })
    const profileExpected = `defmodule DBSchema.Profile do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          bio: String.t(),
          user: DBSchema.User.t() | nil
        }

  schema "profile" do
    field(:bio, :string)
    field(:user_id, :binary_id, source: :userId)
    belongs_to(:user, DBSchema.User, foreign_key: :user_id, define_field: false)
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
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          follower: DBSchema.User.t() | nil,
          following: DBSchema.User.t() | nil
        }

  schema "follow" do
    field(:follower_id, :binary_id, source: :followerId)
    field(:following_id, :binary_id, source: :followingId)
    belongs_to(:follower, DBSchema.User, foreign_key: :follower_id, define_field: false)
    belongs_to(:following, DBSchema.User, foreign_key: :following_id, define_field: false)
  end
end`

    expect(followResult).toBe(followExpected)

    const userResult = fs.readFileSync('./prisma-ecto/ecto/user.ex', { encoding: 'utf-8' })
    const userExpected = `defmodule DBSchema.User do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          name: String.t(),
          followers: [DBSchema.Follow.t()],
          following: [DBSchema.Follow.t()]
        }

  schema "user" do
    field(:name, :string)
    has_many(:followers, DBSchema.Follow, foreign_key: :following_id)
    has_many(:following, DBSchema.Follow, foreign_key: :follower_id)
  end
end`

    expect(userResult).toBe(userExpected)
  }, 30000)

  it('hekireki-ecto with timestamps, defaults, and join model', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "postgresql"
}

generator Hekireki-Ecto {
    provider = "hekireki-ecto"
    output   = "ecto"
    app      = "WISE"
}

model Agent {
    id       String  @id @default(uuid())
    codeName String
    active   Boolean @default(true)

    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt

    assignments MissionAssignment[]
}

model Mission {
    id        String  @id @default(uuid())
    name      String
    priority  Int     @default(1)
    completed Boolean @default(false)

    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt

    assignments MissionAssignment[]
}

model MissionAssignment {
    id   String @id @default(uuid())
    role String

    agentId   String
    agent     Agent   @relation(fields: [agentId], references: [id])
    missionId String
    mission   Mission @relation(fields: [missionId], references: [id])

    assignedAt DateTime @default(now())
}
`

    fs.mkdirSync('./prisma-ecto', { recursive: true })
    fs.writeFileSync('./prisma-ecto/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-ecto/schema.prisma')

    const agentResult = fs.readFileSync('./prisma-ecto/ecto/agent.ex', { encoding: 'utf-8' })
    const agentExpected = `defmodule WISE.Agent do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          code_name: String.t(),
          active: boolean(),
          assignments: [WISE.MissionAssignment.t()]
        }

  schema "agent" do
    field(:code_name, :string, source: :codeName)
    field(:active, :boolean, default: true)
    has_many(:assignments, WISE.MissionAssignment, foreign_key: :agent_id)
    timestamps(type: :utc_datetime, inserted_at_source: :createdAt, updated_at_source: :updatedAt)
  end
end`

    expect(agentResult).toBe(agentExpected)

    const missionResult = fs.readFileSync('./prisma-ecto/ecto/mission.ex', { encoding: 'utf-8' })
    const missionExpected = `defmodule WISE.Mission do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          name: String.t(),
          priority: integer(),
          completed: boolean(),
          assignments: [WISE.MissionAssignment.t()]
        }

  schema "mission" do
    field(:name, :string)
    field(:priority, :integer, default: 1)
    field(:completed, :boolean, default: false)
    has_many(:assignments, WISE.MissionAssignment, foreign_key: :mission_id)
    timestamps(type: :utc_datetime, inserted_at_source: :createdAt, updated_at_source: :updatedAt)
  end
end`

    expect(missionResult).toBe(missionExpected)

    const assignmentResult = fs.readFileSync('./prisma-ecto/ecto/mission_assignment.ex', {
      encoding: 'utf-8',
    })
    const assignmentExpected = `defmodule WISE.MissionAssignment do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{
          id: Ecto.UUID.t(),
          role: String.t(),
          assigned_at: DateTime.t(),
          agent: WISE.Agent.t() | nil,
          mission: WISE.Mission.t() | nil
        }

  schema "mission_assignment" do
    field(:role, :string)
    field(:assigned_at, :utc_datetime, source: :assignedAt)
    field(:agent_id, :binary_id, source: :agentId)
    field(:mission_id, :binary_id, source: :missionId)
    belongs_to(:agent, WISE.Agent, foreign_key: :agent_id, define_field: false)
    belongs_to(:mission, WISE.Mission, foreign_key: :mission_id, define_field: false)
  end
end`

    expect(assignmentResult).toBe(assignmentExpected)
  }, 30000)
})
