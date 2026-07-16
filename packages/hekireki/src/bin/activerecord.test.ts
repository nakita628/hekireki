import { exec } from 'node:child_process'
import fs from 'node:fs'
import { promisify } from 'node:util'

import { afterAll, afterEach, describe, expect, it } from 'vite-plus/test'

// Test run
// pnpm vitest run ./src/bin/activerecord.test.ts

describe('prisma generate', () => {
  afterEach(() => {
    fs.rmSync('./prisma-activerecord/schema.prisma', { force: true })
    fs.rmSync('./prisma-activerecord/activerecord', { recursive: true, force: true })
  })
  afterAll(() => {
    fs.rmSync('./prisma-activerecord', { recursive: true, force: true })
  })
  it('hekireki-activerecord', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator Hekireki-ActiveRecord {
    provider = "hekireki-activerecord"
    output   = "activerecord"
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

    fs.mkdirSync('./prisma-activerecord', { recursive: true })
    fs.writeFileSync('./prisma-activerecord/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-activerecord/schema.prisma')

    const userResult = fs.readFileSync('./prisma-activerecord/activerecord/user.rb', {
      encoding: 'utf-8',
    })
    const userExpected = `class User < ApplicationRecord
  self.table_name = "user"

  attribute :id, :string, default: -> { SecureRandom.uuid }

  has_many :posts, class_name: "Post", foreign_key: "userId"
end`

    expect(userResult).toBe(userExpected)

    const postResult = fs.readFileSync('./prisma-activerecord/activerecord/post.rb', {
      encoding: 'utf-8',
    })
    const postExpected = `class Post < ApplicationRecord
  self.table_name = "post"

  attribute :id, :string, default: -> { SecureRandom.uuid }

  belongs_to :user, class_name: "User", foreign_key: "userId"
end`

    expect(postResult).toBe(postExpected)
  }, 30000)

  it('hekireki-activerecord with implicit many-to-many and self-referencing relations', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator Hekireki-ActiveRecord {
    provider = "hekireki-activerecord"
    output   = "activerecord"
}

model User {
    id        String   @id @default(uuid())
    name      String
    followers Follow[] @relation("Follower")
    following Follow[] @relation("Following")
    groups    Group[]
}

model Group {
    id      String @id @default(uuid())
    name    String
    members User[]
}

model Follow {
    followerId  String
    followingId String
    follower    User   @relation("Following", fields: [followerId], references: [id])
    following   User   @relation("Follower", fields: [followingId], references: [id])

    @@id([followerId, followingId])
}

model Post {
    id   String @id @default(uuid())
    tags Tag[]  @relation("PostTags")
}

model Tag {
    id    String @id @default(uuid())
    posts Post[] @relation("PostTags")
}
`

    fs.mkdirSync('./prisma-activerecord', { recursive: true })
    fs.writeFileSync('./prisma-activerecord/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-activerecord/schema.prisma')

    const userResult = fs.readFileSync('./prisma-activerecord/activerecord/user.rb', {
      encoding: 'utf-8',
    })
    const userExpected = `class User < ApplicationRecord
  self.table_name = "user"

  attribute :id, :string, default: -> { SecureRandom.uuid }

  has_many :followers, class_name: "Follow", foreign_key: "followingId"
  has_many :following, class_name: "Follow", foreign_key: "followerId"
  has_and_belongs_to_many :groups, class_name: "Group", join_table: "_GroupToUser", foreign_key: "B", association_foreign_key: "A"
end`

    expect(userResult).toBe(userExpected)

    const groupResult = fs.readFileSync('./prisma-activerecord/activerecord/group.rb', {
      encoding: 'utf-8',
    })
    const groupExpected = `class Group < ApplicationRecord
  self.table_name = "group"

  attribute :id, :string, default: -> { SecureRandom.uuid }

  has_and_belongs_to_many :members, class_name: "User", join_table: "_GroupToUser", foreign_key: "A", association_foreign_key: "B"
end`

    expect(groupResult).toBe(groupExpected)

    const followResult = fs.readFileSync('./prisma-activerecord/activerecord/follow.rb', {
      encoding: 'utf-8',
    })
    const followExpected = `class Follow < ApplicationRecord
  self.table_name = "follow"
  self.primary_key = ["followerId", "followingId"]

  belongs_to :follower, class_name: "User", foreign_key: "followerId"
  belongs_to :following, class_name: "User", foreign_key: "followingId"
end`

    expect(followResult).toBe(followExpected)

    const postResult = fs.readFileSync('./prisma-activerecord/activerecord/post.rb', {
      encoding: 'utf-8',
    })
    const postExpected = `class Post < ApplicationRecord
  self.table_name = "post"

  attribute :id, :string, default: -> { SecureRandom.uuid }

  has_and_belongs_to_many :tags, class_name: "Tag", join_table: "_PostTags", foreign_key: "A", association_foreign_key: "B"
end`

    expect(postResult).toBe(postExpected)

    const tagResult = fs.readFileSync('./prisma-activerecord/activerecord/tag.rb', {
      encoding: 'utf-8',
    })
    const tagExpected = `class Tag < ApplicationRecord
  self.table_name = "tag"

  attribute :id, :string, default: -> { SecureRandom.uuid }

  has_and_belongs_to_many :posts, class_name: "Post", join_table: "_PostTags", foreign_key: "B", association_foreign_key: "A"
end`

    expect(tagResult).toBe(tagExpected)
  }, 30000)

  it('hekireki-activerecord with enum and composite primary key', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "postgresql"
}

generator Hekireki-ActiveRecord {
    provider = "hekireki-activerecord"
    output   = "activerecord"
}

enum Role {
    ADMIN
    USER
}

model User {
    id    String @id @default(uuid())
    name  String
    role  Role   @default(USER)
    likes Like[]
}

model Post {
    id    String @id @default(uuid())
    title String
    likes Like[]
}

model Like {
    userId String
    postId String
    user   User   @relation(fields: [userId], references: [id])
    post   Post   @relation(fields: [postId], references: [id])

    @@id([userId, postId])
}
`

    fs.mkdirSync('./prisma-activerecord', { recursive: true })
    fs.writeFileSync('./prisma-activerecord/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-activerecord/schema.prisma')

    const userResult = fs.readFileSync('./prisma-activerecord/activerecord/user.rb', {
      encoding: 'utf-8',
    })
    const userExpected = `class User < ApplicationRecord
  self.table_name = "user"

  attribute :id, :string, default: -> { SecureRandom.uuid }

  enum :role, { ADMIN: "ADMIN", USER: "USER" }

  has_many :likes, class_name: "Like", foreign_key: "userId"
end`

    expect(userResult).toBe(userExpected)

    const likeResult = fs.readFileSync('./prisma-activerecord/activerecord/like.rb', {
      encoding: 'utf-8',
    })
    const likeExpected = `class Like < ApplicationRecord
  self.table_name = "like"
  self.primary_key = ["userId", "postId"]

  belongs_to :user, class_name: "User", foreign_key: "userId"
  belongs_to :post, class_name: "Post", foreign_key: "postId"
end`

    expect(likeResult).toBe(likeExpected)
  }, 30000)
})
