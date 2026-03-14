import { exec } from 'node:child_process'
import fs from 'node:fs'
import { promisify } from 'node:util'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

// Test run
// pnpm vitest run ./src/generator/sqlalchemy/index.test.ts

describe('prisma generate', () => {
  afterEach(() => {
    fs.rmSync('./prisma-sqlalchemy/schema.prisma', { force: true })
    fs.rmSync('./prisma-sqlalchemy/sqlalchemy', { recursive: true, force: true })
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

    const baseResult = fs.readFileSync('./prisma-sqlalchemy/sqlalchemy/base.py', {
      encoding: 'utf-8',
    })
    const baseExpected = `from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
`
    expect(baseResult).toBe(baseExpected)

    const userResult = fs.readFileSync('./prisma-sqlalchemy/sqlalchemy/user.py', {
      encoding: 'utf-8',
    })
    const userExpected = `from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class User(Base):
    __tablename__ = "user"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    name: Mapped[str] = mapped_column(String, nullable=False)

    posts: Mapped[list["Post"]] = relationship("Post", back_populates="user")
`
    expect(userResult).toBe(userExpected)

    const postResult = fs.readFileSync('./prisma-sqlalchemy/sqlalchemy/post.py', {
      encoding: 'utf-8',
    })
    const postExpected = `from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Post(Base):
    __tablename__ = "post"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    title: Mapped[str] = mapped_column(String, nullable=False)

    content: Mapped[str] = mapped_column(String, nullable=False)

    user_id: Mapped[str] = mapped_column(String, ForeignKey("user.id"), nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="posts")
`
    expect(postResult).toBe(postExpected)

    const initResult = fs.readFileSync('./prisma-sqlalchemy/sqlalchemy/__init__.py', {
      encoding: 'utf-8',
    })
    const initExpected = `from .user import User
from .post import Post

__all__ = [
    "User",
    "Post",
]
`
    expect(initResult).toBe(initExpected)
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

    const userResult = fs.readFileSync('./prisma-sqlalchemy/sqlalchemy/user.py', {
      encoding: 'utf-8',
    })
    const userExpected = `from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class User(Base):
    __tablename__ = "user"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    name: Mapped[str] = mapped_column(String, nullable=False)

    profile: Mapped["Profile"] = relationship("Profile", back_populates="user", uselist=False)
`
    expect(userResult).toBe(userExpected)

    const profileResult = fs.readFileSync('./prisma-sqlalchemy/sqlalchemy/profile.py', {
      encoding: 'utf-8',
    })
    const profileExpected = `from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Profile(Base):
    __tablename__ = "profile"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    bio: Mapped[str] = mapped_column(String, nullable=False)

    user_id: Mapped[str] = mapped_column(String, ForeignKey("user.id"), unique=True, nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="profile")
`
    expect(profileResult).toBe(profileExpected)
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

    const userResult = fs.readFileSync('./prisma-sqlalchemy/sqlalchemy/user.py', {
      encoding: 'utf-8',
    })
    const userExpected = `from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class User(Base):
    __tablename__ = "user"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    name: Mapped[str] = mapped_column(String, nullable=False)

    followers: Mapped[list["Follow"]] = relationship("Follow", foreign_keys="Follow.following_id", back_populates="following")

    following: Mapped[list["Follow"]] = relationship("Follow", foreign_keys="Follow.follower_id", back_populates="follower")
`
    expect(userResult).toBe(userExpected)

    const followResult = fs.readFileSync('./prisma-sqlalchemy/sqlalchemy/follow.py', {
      encoding: 'utf-8',
    })
    const followExpected = `from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Follow(Base):
    __tablename__ = "follow"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    follower_id: Mapped[str] = mapped_column(String, ForeignKey("user.id"), nullable=False)

    following_id: Mapped[str] = mapped_column(String, ForeignKey("user.id"), nullable=False)

    follower: Mapped["User"] = relationship("User", foreign_keys=[follower_id], back_populates="following")

    following: Mapped["User"] = relationship("User", foreign_keys=[following_id], back_populates="followers")
`
    expect(followResult).toBe(followExpected)
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

    const userResult = fs.readFileSync('./prisma-sqlalchemy/sqlalchemy/user.py', {
      encoding: 'utf-8',
    })
    const userExpected = `from sqlalchemy import Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional

from .base import Base


class User(Base):
    __tablename__ = "user"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    name: Mapped[str] = mapped_column(String, nullable=False)

    bio: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    role: Mapped[str] = mapped_column(Enum("ADMIN", "USER", "MODERATOR", name="role"), nullable=False, default="USER")

    posts: Mapped[list["Post"]] = relationship("Post", back_populates="user")
`
    expect(userResult).toBe(userExpected)

    const postResult = fs.readFileSync('./prisma-sqlalchemy/sqlalchemy/post.py', {
      encoding: 'utf-8',
    })
    const postExpected = `from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional

from .base import Base


class Post(Base):
    __tablename__ = "post"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    title: Mapped[str] = mapped_column(String, nullable=False)

    content: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    user_id: Mapped[str] = mapped_column(String, ForeignKey("user.id"), nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="posts")
`
    expect(postResult).toBe(postExpected)
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

    const userResult = fs.readFileSync('./prisma-sqlalchemy/sqlalchemy/user.py', {
      encoding: 'utf-8',
    })
    const userExpected = `from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class User(Base):
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    name: Mapped[str] = mapped_column(String, nullable=False)

    posts: Mapped[list["Post"]] = relationship("Post", back_populates="user")
`
    expect(userResult).toBe(userExpected)

    const postResult = fs.readFileSync('./prisma-sqlalchemy/sqlalchemy/post.py', {
      encoding: 'utf-8',
    })
    const postExpected = `from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Post(Base):
    __tablename__ = "post"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    title: Mapped[str] = mapped_column(String, nullable=False)

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("user.id"), nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="posts")
`
    expect(postResult).toBe(postExpected)
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

    const likeResult = fs.readFileSync('./prisma-sqlalchemy/sqlalchemy/like.py', {
      encoding: 'utf-8',
    })
    const likeExpected = `from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Like(Base):
    __tablename__ = "like"

    user_id: Mapped[str] = mapped_column(String, ForeignKey("user.id"), primary_key=True)

    post_id: Mapped[str] = mapped_column(String, ForeignKey("post.id"), primary_key=True)

    user: Mapped["User"] = relationship("User", back_populates="likes")

    post: Mapped["Post"] = relationship("Post", back_populates="likes")
`
    expect(likeResult).toBe(likeExpected)
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

    const agentResult = fs.readFileSync('./prisma-sqlalchemy/sqlalchemy/agent.py', {
      encoding: 'utf-8',
    })
    const agentExpected = `from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class Agent(Base):
    __tablename__ = "agent"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    code_name: Mapped[str] = mapped_column(String, nullable=False)

    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
`
    expect(agentResult).toBe(agentExpected)
  }, 30000)
})
