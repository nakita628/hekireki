import { exec } from 'node:child_process'
import fs from 'node:fs'
import { promisify } from 'node:util'

import { afterAll, afterEach, describe, expect, it } from 'vitest'

// Test run
// pnpm vitest run ./src/generator/sqlalchemy/index.test.ts

describe('prisma generate', () => {
  afterEach(() => {
    fs.rmSync('./prisma-sqlalchemy/sqlalchemy', { recursive: true, force: true })
    fs.rmSync('./prisma-sqlalchemy/schema.prisma', { force: true })
  })
  afterAll(() => {
    fs.rmSync('./prisma-sqlalchemy', { recursive: true, force: true })
  })

  it('hekireki-sqlalchemy basic model with UUID PK and relations', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator Hekireki-SQLAlchemy {
    provider = "hekireki-sqlalchemy"
    output   = "sqlalchemy"
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

    fs.mkdirSync('./prisma-sqlalchemy', { recursive: true })
    fs.writeFileSync('./prisma-sqlalchemy/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-sqlalchemy/schema.prisma')

    const result = fs.readFileSync('./prisma-sqlalchemy/sqlalchemy/models.py', {
      encoding: 'utf-8',
    })
    const expected = `from sqlalchemy import ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "user"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]

    posts: Mapped[list["Post"]] = relationship(back_populates="user")

class Post(Base):
    __tablename__ = "post"

    id: Mapped[str] = mapped_column(primary_key=True)
    title: Mapped[str]
    content: Mapped[str]
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"))

    user: Mapped["User"] = relationship(back_populates="posts")
`
    expect(result).toBe(expected)
  }, 30000)

  it('hekireki-sqlalchemy with has_one relation', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator Hekireki-SQLAlchemy {
    provider = "hekireki-sqlalchemy"
    output   = "sqlalchemy"
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

    fs.mkdirSync('./prisma-sqlalchemy', { recursive: true })
    fs.writeFileSync('./prisma-sqlalchemy/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-sqlalchemy/schema.prisma')

    const result = fs.readFileSync('./prisma-sqlalchemy/sqlalchemy/models.py', {
      encoding: 'utf-8',
    })
    const expected = `from sqlalchemy import ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "user"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]

    profile: Mapped["Profile"] = relationship(back_populates="user", uselist=False)

class Profile(Base):
    __tablename__ = "profile"

    id: Mapped[str] = mapped_column(primary_key=True)
    bio: Mapped[str]
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"), unique=True)

    user: Mapped["User"] = relationship(back_populates="profile")
`
    expect(result).toBe(expected)
  }, 30000)

  it('hekireki-sqlalchemy with self-referencing relation', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator Hekireki-SQLAlchemy {
    provider = "hekireki-sqlalchemy"
    output   = "sqlalchemy"
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

    fs.mkdirSync('./prisma-sqlalchemy', { recursive: true })
    fs.writeFileSync('./prisma-sqlalchemy/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-sqlalchemy/schema.prisma')

    const result = fs.readFileSync('./prisma-sqlalchemy/sqlalchemy/models.py', {
      encoding: 'utf-8',
    })
    const expected = `from sqlalchemy import ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "user"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]

    followers: Mapped[list["Follow"]] = relationship(foreign_keys="Follow.following_id", back_populates="following")
    following: Mapped[list["Follow"]] = relationship(foreign_keys="Follow.follower_id", back_populates="follower")

class Follow(Base):
    __tablename__ = "follow"

    id: Mapped[str] = mapped_column(primary_key=True)
    follower_id: Mapped[str] = mapped_column(ForeignKey("user.id"))
    following_id: Mapped[str] = mapped_column(ForeignKey("user.id"))

    follower: Mapped["User"] = relationship(foreign_keys=[follower_id], back_populates="following")
    following: Mapped["User"] = relationship(foreign_keys=[following_id], back_populates="followers")
`
    expect(result).toBe(expected)
  }, 30000)

  it('hekireki-sqlalchemy with enum, nullable fields, and cuid PK', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "postgresql"
}

generator Hekireki-SQLAlchemy {
    provider = "hekireki-sqlalchemy"
    output   = "sqlalchemy"
}

enum Role {
    ADMIN
    USER
    MODERATOR
}

model User {
    id    String  @id @default(cuid())
    name  String
    bio   String?
    role  Role    @default(USER)
    posts Post[]
}

model Post {
    id      String  @id @default(cuid())
    title   String
    content String?
    userId  String
    user    User    @relation(fields: [userId], references: [id])
}
`

    fs.mkdirSync('./prisma-sqlalchemy', { recursive: true })
    fs.writeFileSync('./prisma-sqlalchemy/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-sqlalchemy/schema.prisma')

    const result = fs.readFileSync('./prisma-sqlalchemy/sqlalchemy/models.py', {
      encoding: 'utf-8',
    })
    const expected = `from sqlalchemy import Enum, ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from typing import Optional


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "user"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]
    bio: Mapped[Optional[str]]
    role: Mapped[str] = mapped_column(Enum("ADMIN", "USER", "MODERATOR", name="role"), default="USER")

    posts: Mapped[list["Post"]] = relationship(back_populates="user")

class Post(Base):
    __tablename__ = "post"

    id: Mapped[str] = mapped_column(primary_key=True)
    title: Mapped[str]
    content: Mapped[Optional[str]]
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"))

    user: Mapped["User"] = relationship(back_populates="posts")
`
    expect(result).toBe(expected)
  }, 30000)

  it('hekireki-sqlalchemy with autoincrement PK', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "postgresql"
}

generator Hekireki-SQLAlchemy {
    provider = "hekireki-sqlalchemy"
    output   = "sqlalchemy"
}

model User {
    id     Int    @id @default(autoincrement())
    name   String
    posts  Post[]
}

model Post {
    id     Int    @id @default(autoincrement())
    title  String
    userId Int
    user   User   @relation(fields: [userId], references: [id])
}
`

    fs.mkdirSync('./prisma-sqlalchemy', { recursive: true })
    fs.writeFileSync('./prisma-sqlalchemy/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-sqlalchemy/schema.prisma')

    const result = fs.readFileSync('./prisma-sqlalchemy/sqlalchemy/models.py', {
      encoding: 'utf-8',
    })
    const expected = `from sqlalchemy import ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str]

    posts: Mapped[list["Post"]] = relationship(back_populates="user")

class Post(Base):
    __tablename__ = "post"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str]
    user_id: Mapped[int] = mapped_column(ForeignKey("user.id"))

    user: Mapped["User"] = relationship(back_populates="posts")
`
    expect(result).toBe(expected)
  }, 30000)

  it('hekireki-sqlalchemy with composite primary key', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator Hekireki-SQLAlchemy {
    provider = "hekireki-sqlalchemy"
    output   = "sqlalchemy"
}

model User {
    id    String @id @default(uuid())
    name  String
    likes Like[]
}

model Post {
    id    String @id @default(uuid())
    title String
    likes Like[]
}

model Like {
    userId    String
    postId    String
    user      User     @relation(fields: [userId], references: [id])
    post      Post     @relation(fields: [postId], references: [id])

    @@id([userId, postId])
}
`

    fs.mkdirSync('./prisma-sqlalchemy', { recursive: true })
    fs.writeFileSync('./prisma-sqlalchemy/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-sqlalchemy/schema.prisma')

    const result = fs.readFileSync('./prisma-sqlalchemy/sqlalchemy/models.py', {
      encoding: 'utf-8',
    })
    const expected = `from sqlalchemy import ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "user"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]

    likes: Mapped[list["Like"]] = relationship(back_populates="user")

class Post(Base):
    __tablename__ = "post"

    id: Mapped[str] = mapped_column(primary_key=True)
    title: Mapped[str]

    likes: Mapped[list["Like"]] = relationship(back_populates="post")

class Like(Base):
    __tablename__ = "like"

    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"), primary_key=True)
    post_id: Mapped[str] = mapped_column(ForeignKey("post.id"), primary_key=True)

    user: Mapped["User"] = relationship(back_populates="likes")
    post: Mapped["Post"] = relationship(back_populates="likes")
`
    expect(result).toBe(expected)
  }, 30000)

  it('hekireki-sqlalchemy with defaults and boolean fields', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "postgresql"
}

generator Hekireki-SQLAlchemy {
    provider = "hekireki-sqlalchemy"
    output   = "sqlalchemy"
}

model Agent {
    id       String  @id @default(uuid())
    codeName String
    active   Boolean @default(true)
    priority Int     @default(1)
}
`

    fs.mkdirSync('./prisma-sqlalchemy', { recursive: true })
    fs.writeFileSync('./prisma-sqlalchemy/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-sqlalchemy/schema.prisma')

    const result = fs.readFileSync('./prisma-sqlalchemy/sqlalchemy/models.py', {
      encoding: 'utf-8',
    })
    const expected = `from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Agent(Base):
    __tablename__ = "agent"

    id: Mapped[str] = mapped_column(primary_key=True)
    code_name: Mapped[str]
    active: Mapped[bool] = mapped_column(default=True)
    priority: Mapped[int] = mapped_column(default=1)
`
    expect(result).toBe(expected)
  }, 30000)

  it('hekireki-sqlalchemy with many-to-many relation', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "postgresql"
}

generator Hekireki-SQLAlchemy {
    provider = "hekireki-sqlalchemy"
    output   = "sqlalchemy"
}

model Post {
    id    String @id @default(uuid())
    title String
    tags  Tag[]
}

model Tag {
    id    String @id @default(uuid())
    name  String
    posts Post[]
}
`

    fs.mkdirSync('./prisma-sqlalchemy', { recursive: true })
    fs.writeFileSync('./prisma-sqlalchemy/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-sqlalchemy/schema.prisma')

    const result = fs.readFileSync('./prisma-sqlalchemy/sqlalchemy/models.py', {
      encoding: 'utf-8',
    })
    const expected = `from sqlalchemy import Column, ForeignKey, String, Table
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass

post_to_tag = Table(
    "_PostToTag",
    Base.metadata,
    Column("A", String, ForeignKey("post.id"), primary_key=True),
    Column("B", String, ForeignKey("tag.id"), primary_key=True),
)


class Post(Base):
    __tablename__ = "post"

    id: Mapped[str] = mapped_column(primary_key=True)
    title: Mapped[str]

    tags: Mapped[list["Tag"]] = relationship(secondary=post_to_tag, back_populates="posts")

class Tag(Base):
    __tablename__ = "tag"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]

    posts: Mapped[list["Post"]] = relationship(secondary=post_to_tag, back_populates="tags")
`
    expect(result).toBe(expected)
  }, 30000)

  it('hekireki-sqlalchemy with @@unique composite constraint', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "postgresql"
}

generator Hekireki-SQLAlchemy {
    provider = "hekireki-sqlalchemy"
    output   = "sqlalchemy"
}

model Account {
    id                String @id @default(uuid())
    provider          String
    providerAccountId String

    @@unique([provider, providerAccountId])
}
`

    fs.mkdirSync('./prisma-sqlalchemy', { recursive: true })
    fs.writeFileSync('./prisma-sqlalchemy/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-sqlalchemy/schema.prisma')

    const result = fs.readFileSync('./prisma-sqlalchemy/sqlalchemy/models.py', {
      encoding: 'utf-8',
    })
    const expected = `from sqlalchemy import UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Account(Base):
    __tablename__ = "account"

    id: Mapped[str] = mapped_column(primary_key=True)
    provider: Mapped[str]
    provider_account_id: Mapped[str]

    __table_args__ = (
        UniqueConstraint("provider", "provider_account_id"),
    )
`
    expect(result).toBe(expected)
  }, 30000)

  it('hekireki-sqlalchemy with @db.VarChar native type', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "postgresql"
}

generator Hekireki-SQLAlchemy {
    provider = "hekireki-sqlalchemy"
    output   = "sqlalchemy"
}

model User {
    id   String @id @default(uuid())
    name String @db.VarChar(191)
}
`

    fs.mkdirSync('./prisma-sqlalchemy', { recursive: true })
    fs.writeFileSync('./prisma-sqlalchemy/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-sqlalchemy/schema.prisma')

    const result = fs.readFileSync('./prisma-sqlalchemy/sqlalchemy/models.py', {
      encoding: 'utf-8',
    })
    const expected = `from sqlalchemy import String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "user"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(191))
`
    expect(result).toBe(expected)
  }, 30000)

  it('hekireki-sqlalchemy with many-to-many and other relations combined', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "postgresql"
}

generator Hekireki-SQLAlchemy {
    provider = "hekireki-sqlalchemy"
    output   = "sqlalchemy"
}

model User {
    id    String @id @default(uuid())
    name  String
    posts Post[]
}

model Post {
    id       String    @id @default(uuid())
    title    String
    userId   String
    user     User      @relation(fields: [userId], references: [id])
    tags     Tag[]
    categories Category[]
}

model Tag {
    id    String @id @default(uuid())
    name  String
    posts Post[]
}

model Category {
    id    String @id @default(uuid())
    name  String
    posts Post[]
}
`

    fs.mkdirSync('./prisma-sqlalchemy', { recursive: true })
    fs.writeFileSync('./prisma-sqlalchemy/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-sqlalchemy/schema.prisma')

    const result = fs.readFileSync('./prisma-sqlalchemy/sqlalchemy/models.py', {
      encoding: 'utf-8',
    })
    const expected = `from sqlalchemy import Column, ForeignKey, String, Table
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass

post_to_tag = Table(
    "_PostToTag",
    Base.metadata,
    Column("A", String, ForeignKey("post.id"), primary_key=True),
    Column("B", String, ForeignKey("tag.id"), primary_key=True),
)

category_to_post = Table(
    "_CategoryToPost",
    Base.metadata,
    Column("A", String, ForeignKey("category.id"), primary_key=True),
    Column("B", String, ForeignKey("post.id"), primary_key=True),
)


class User(Base):
    __tablename__ = "user"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]

    posts: Mapped[list["Post"]] = relationship(back_populates="user")

class Post(Base):
    __tablename__ = "post"

    id: Mapped[str] = mapped_column(primary_key=True)
    title: Mapped[str]
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"))

    user: Mapped["User"] = relationship(back_populates="posts")
    tags: Mapped[list["Tag"]] = relationship(secondary=post_to_tag, back_populates="posts")
    categories: Mapped[list["Category"]] = relationship(secondary=category_to_post, back_populates="posts")

class Tag(Base):
    __tablename__ = "tag"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]

    posts: Mapped[list["Post"]] = relationship(secondary=post_to_tag, back_populates="tags")

class Category(Base):
    __tablename__ = "category"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]

    posts: Mapped[list["Post"]] = relationship(secondary=category_to_post, back_populates="categories")
`
    expect(result).toBe(expected)
  }, 30000)
})

// ============================================================================
// Fixture-based integration tests — strict toBe matching
// ============================================================================

describe('fixture: twitter-clone-sample', () => {
  afterAll(() => {
    fs.rmSync('../../fixtures/twitter-clone-sample/sqlalchemy', { recursive: true, force: true })
  })

  it('generates all models with self-ref, composite PK, @@index, @updatedAt', async () => {
    await promisify(exec)(
      'npx prisma generate --schema=../../fixtures/twitter-clone-sample/schema.prisma',
    )

    expect(fs.readFileSync('../../fixtures/twitter-clone-sample/sqlalchemy/models.py', 'utf-8'))
      .toBe(`from sqlalchemy import ForeignKey, Index, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from typing import Optional
from datetime import datetime


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "user"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]
    username: Mapped[str] = mapped_column(unique=True)
    bio: Mapped[Optional[str]] = mapped_column(default="")
    email: Mapped[str] = mapped_column(unique=True)
    email_verified: Mapped[Optional[datetime]]
    image: Mapped[Optional[str]]
    cover_image: Mapped[Optional[str]]
    profile_image: Mapped[Optional[str]]
    hashed_password: Mapped[Optional[str]]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(onupdate=func.now())
    has_notification: Mapped[Optional[bool]] = mapped_column(default=False)

    posts: Mapped[list["Post"]] = relationship(back_populates="user")
    comments: Mapped[list["Comment"]] = relationship(back_populates="user")
    notifications: Mapped[list["Notification"]] = relationship(back_populates="user")
    followers: Mapped[list["Follow"]] = relationship(foreign_keys="Follow.following_id", back_populates="following")
    following: Mapped[list["Follow"]] = relationship(foreign_keys="Follow.follower_id", back_populates="follower")
    likes: Mapped[list["Like"]] = relationship(back_populates="user")

class Post(Base):
    __tablename__ = "post"

    id: Mapped[str] = mapped_column(primary_key=True)
    body: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(onupdate=func.now())
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"))

    user: Mapped["User"] = relationship(back_populates="posts")
    comments: Mapped[list["Comment"]] = relationship(back_populates="post")
    likes: Mapped[list["Like"]] = relationship(back_populates="post")

class Follow(Base):
    __tablename__ = "follow"

    follower_id: Mapped[str] = mapped_column(ForeignKey("user.id"), primary_key=True)
    following_id: Mapped[str] = mapped_column(ForeignKey("user.id"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    follower: Mapped["User"] = relationship(foreign_keys=[follower_id], back_populates="following")
    following: Mapped["User"] = relationship(foreign_keys=[following_id], back_populates="followers")

class Like(Base):
    __tablename__ = "like"

    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"), primary_key=True)
    post_id: Mapped[str] = mapped_column(ForeignKey("post.id"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="likes")
    post: Mapped["Post"] = relationship(back_populates="likes")

class Comment(Base):
    __tablename__ = "comment"

    id: Mapped[str] = mapped_column(primary_key=True)
    body: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(onupdate=func.now())
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"))
    post_id: Mapped[str] = mapped_column(ForeignKey("post.id"))

    __table_args__ = (
        Index("idx_user_id", "user_id"),
        Index("idx_post_id", "post_id"),
    )

    user: Mapped["User"] = relationship(back_populates="comments")
    post: Mapped["Post"] = relationship(back_populates="comments")

class Notification(Base):
    __tablename__ = "notification"

    id: Mapped[str] = mapped_column(primary_key=True)
    body: Mapped[str]
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        Index("idx_user_id", "user_id"),
    )

    user: Mapped["User"] = relationship(back_populates="notifications")
`)
  }, 60000)
})

describe('fixture: rbac', () => {
  afterAll(() => {
    fs.rmSync('../../fixtures/rbac/sqlalchemy', { recursive: true, force: true })
  })

  it('generates RBAC models with @@map, @db.VarChar, @@unique, @@index, autoincrement, enum', async () => {
    await promisify(exec)('npx prisma generate --schema=../../fixtures/rbac/schema.prisma')

    expect(fs.readFileSync('../../fixtures/rbac/sqlalchemy/models.py', 'utf-8')).toBe(
      `from sqlalchemy import Enum, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from typing import Optional
from datetime import datetime


class Base(DeclarativeBase):
    pass


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(100), unique=True)
    status: Mapped[str] = mapped_column(Enum("ACTIVE", "INACTIVE", "SUSPENDED", name="org_status"), default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(onupdate=func.now())

    users: Mapped[list["User"]] = relationship(back_populates="organization")

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"))
    email: Mapped[str] = mapped_column(String(255), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(onupdate=func.now())

    __table_args__ = (
        Index("idx_organization_id", "organization_id"),
    )

    organization: Mapped["Organization"] = relationship(back_populates="users")
    user_roles: Mapped[list["UserRole"]] = relationship(back_populates="user")
    audit_logs: Mapped[list["AuditLog"]] = relationship(back_populates="user")

class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    description: Mapped[Optional[str]] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(onupdate=func.now())

    user_roles: Mapped[list["UserRole"]] = relationship(back_populates="role")
    role_permissions: Mapped[list["RolePermission"]] = relationship(back_populates="role")

class Permission(Base):
    __tablename__ = "permissions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    resource: Mapped[str] = mapped_column(String(100))
    action: Mapped[str] = mapped_column(String(100))
    description: Mapped[Optional[str]] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        UniqueConstraint("resource", "action"),
    )

    role_permissions: Mapped[list["RolePermission"]] = relationship(back_populates="permission")

class UserRole(Base):
    __tablename__ = "user_roles"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), primary_key=True)
    assigned_at: Mapped[datetime] = mapped_column(server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="user_roles")
    role: Mapped["Role"] = relationship(back_populates="user_roles")

class RolePermission(Base):
    __tablename__ = "role_permissions"

    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), primary_key=True)
    permission_id: Mapped[int] = mapped_column(ForeignKey("permissions.id"), primary_key=True)
    assigned_at: Mapped[datetime] = mapped_column(server_default=func.now())

    role: Mapped["Role"] = relationship(back_populates="role_permissions")
    permission: Mapped["Permission"] = relationship(back_populates="role_permissions")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(50))
    resource: Mapped[str] = mapped_column(String(100))
    detail: Mapped[Optional[str]]
    ip_address: Mapped[Optional[str]] = mapped_column(String(45))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        Index("idx_user_id", "user_id"),
        Index("idx_created_at", "created_at"),
    )

    user: Mapped["User"] = relationship(back_populates="audit_logs")
`,
    )
  }, 60000)
})

describe('fixture: no-annotation (M2M implicit)', () => {
  afterAll(() => {
    fs.rmSync('../../fixtures/no-annotation/sqlalchemy', { recursive: true, force: true })
  })

  it('generates models with implicit M2M (Post <-> Tag), enum, one-to-one, @updatedAt', async () => {
    await promisify(exec)('npx prisma generate --schema=../../fixtures/no-annotation/schema.prisma')

    expect(fs.readFileSync('../../fixtures/no-annotation/sqlalchemy/models.py', 'utf-8'))
      .toBe(`from sqlalchemy import Column, Enum, ForeignKey, String, Table, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from typing import Optional
from datetime import datetime


class Base(DeclarativeBase):
    pass

post_to_tag = Table(
    "_PostToTag",
    Base.metadata,
    Column("A", String, ForeignKey("post.id"), primary_key=True),
    Column("B", String, ForeignKey("tag.id"), primary_key=True),
)


class User(Base):
    __tablename__ = "user"

    id: Mapped[str] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(unique=True)
    name: Mapped[Optional[str]]
    age: Mapped[Optional[int]]
    is_active: Mapped[bool] = mapped_column(default=True)
    role: Mapped[str] = mapped_column(Enum("ADMIN", "MEMBER", "GUEST", name="role"), default="MEMBER")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(onupdate=func.now())

    posts: Mapped[list["Post"]] = relationship(back_populates="author")
    profile: Mapped["Profile"] = relationship(back_populates="user", uselist=False)

class Post(Base):
    __tablename__ = "post"

    id: Mapped[str] = mapped_column(primary_key=True)
    title: Mapped[str]
    content: Mapped[str]
    published: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(onupdate=func.now())
    author_id: Mapped[str] = mapped_column(ForeignKey("user.id"))

    author: Mapped["User"] = relationship(back_populates="posts")
    tags: Mapped[list["Tag"]] = relationship(secondary=post_to_tag, back_populates="posts")

class Profile(Base):
    __tablename__ = "profile"

    id: Mapped[str] = mapped_column(primary_key=True)
    bio: Mapped[Optional[str]]
    avatar: Mapped[Optional[str]]
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"), unique=True)

    user: Mapped["User"] = relationship(back_populates="profile")

class Tag(Base):
    __tablename__ = "tag"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True)

    posts: Mapped[list["Post"]] = relationship(secondary=post_to_tag, back_populates="tags")
`)
  }, 60000)
})

describe('fixture: jwt-auth-pg', () => {
  afterAll(() => {
    fs.rmSync('../../fixtures/jwt-auth-pg/sqlalchemy', { recursive: true, force: true })
  })

  it('generates PostgreSQL models with @db.Uuid, @db.VarChar, @db.Decimal, @db.Timestamptz, @@unique, @@index, @@map, multiple enums', async () => {
    await promisify(exec)('npx prisma generate --schema=../../fixtures/jwt-auth-pg/schema.prisma')

    expect(fs.readFileSync('../../fixtures/jwt-auth-pg/sqlalchemy/models.py', 'utf-8')).toBe(
      `from sqlalchemy import Enum, ForeignKey, Index, Numeric, String, UniqueConstraint, Uuid, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from typing import Optional
from decimal import Decimal as DecimalType
from datetime import datetime
import uuid as uuid_mod


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid_mod.UUID] = mapped_column(Uuid, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    password_hash: Mapped[Optional[str]]
    name: Mapped[str] = mapped_column(String(100))
    avatar_url: Mapped[Optional[str]]
    role: Mapped[str] = mapped_column(Enum("ADMIN", "USER", "GUEST", name="role"), default="USER")
    credit_balance: Mapped[DecimalType] = mapped_column(Numeric(precision=10, scale=2), default=0)
    email_verified: Mapped[bool] = mapped_column(default=False)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(onupdate=func.now())
    last_login_at: Mapped[Optional[datetime]]

    oauth_accounts: Mapped[list["OAuthAccount"]] = relationship(back_populates="user")
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(back_populates="user")
    email_verifications: Mapped[list["EmailVerification"]] = relationship(back_populates="user")
    password_resets: Mapped[list["PasswordReset"]] = relationship(back_populates="user")
    two_factor_setting: Mapped["TwoFactorSetting"] = relationship(back_populates="user", uselist=False)

class OAuthAccount(Base):
    __tablename__ = "oauth_accounts"

    id: Mapped[uuid_mod.UUID] = mapped_column(Uuid, primary_key=True)
    user_id: Mapped[uuid_mod.UUID] = mapped_column(Uuid, ForeignKey("users.id"))
    provider: Mapped[str] = mapped_column(Enum("GOOGLE", "GITHUB", "FACEBOOK", "TWITTER", "APPLE", name="oauth_provider"))
    provider_account_id: Mapped[str] = mapped_column(String(255))
    access_token: Mapped[Optional[str]]
    refresh_token: Mapped[Optional[str]]
    expires_at: Mapped[Optional[datetime]]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        UniqueConstraint("provider", "provider_account_id"),
        Index("idx_user_id", "user_id"),
    )

    user: Mapped["User"] = relationship(back_populates="oauth_accounts")

class TwoFactorSetting(Base):
    __tablename__ = "two_factor_settings"

    id: Mapped[uuid_mod.UUID] = mapped_column(Uuid, primary_key=True)
    user_id: Mapped[uuid_mod.UUID] = mapped_column(Uuid, ForeignKey("users.id"), unique=True)
    enabled: Mapped[bool] = mapped_column(default=False)
    method: Mapped[Optional[str]] = mapped_column(Enum("TOTP", "SMS", "EMAIL", name="two_factor_method"))
    totp_secret: Mapped[Optional[str]]
    phone_number: Mapped[Optional[str]] = mapped_column(String(20))
    backup_codes: Mapped[Optional[str]]
    verified_at: Mapped[Optional[datetime]]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(onupdate=func.now())

    user: Mapped["User"] = relationship(back_populates="two_factor_setting")

class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[str] = mapped_column(primary_key=True)
    user_id: Mapped[uuid_mod.UUID] = mapped_column(Uuid, ForeignKey("users.id"))
    token_hash: Mapped[str] = mapped_column(unique=True)
    device_info: Mapped[Optional[str]]
    ip_address: Mapped[Optional[str]] = mapped_column(String(45))
    expires_at: Mapped[datetime]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    revoked: Mapped[bool] = mapped_column(default=False)

    __table_args__ = (
        Index("idx_user_id", "user_id"),
    )

    user: Mapped["User"] = relationship(back_populates="refresh_tokens")

class EmailVerification(Base):
    __tablename__ = "email_verifications"

    id: Mapped[uuid_mod.UUID] = mapped_column(Uuid, primary_key=True)
    user_id: Mapped[uuid_mod.UUID] = mapped_column(Uuid, ForeignKey("users.id"))
    token_hash: Mapped[str] = mapped_column(unique=True)
    expires_at: Mapped[datetime]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        Index("idx_user_id", "user_id"),
    )

    user: Mapped["User"] = relationship(back_populates="email_verifications")

class PasswordReset(Base):
    __tablename__ = "password_resets"

    id: Mapped[uuid_mod.UUID] = mapped_column(Uuid, primary_key=True)
    user_id: Mapped[uuid_mod.UUID] = mapped_column(Uuid, ForeignKey("users.id"))
    token_hash: Mapped[str] = mapped_column(unique=True)
    expires_at: Mapped[datetime]
    used: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        Index("idx_user_id", "user_id"),
    )

    user: Mapped["User"] = relationship(back_populates="password_resets")
`,
    )
  }, 60000)
})
