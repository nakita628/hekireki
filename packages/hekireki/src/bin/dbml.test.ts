import { exec } from 'node:child_process'
import fs from 'node:fs'
import { promisify } from 'node:util'

import { afterAll, afterEach, describe, expect, it } from 'vite-plus/test'

describe('prisma generate', () => {
  afterEach(() => {
    fs.rmSync('./prisma-dbml/dbml', { recursive: true, force: true })
    fs.rmSync('./prisma-dbml/schema.prisma', { force: true })
  })
  afterAll(() => {
    fs.rmSync('./prisma-dbml', { recursive: true, force: true })
  })

  it('hekireki-dbml lowercases every referential action and omits it when absent', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "postgresql"
}

generator Hekireki-DBML {
    provider = "hekireki-dbml"
    output   = "dbml"
}

model User {
    id        String     @id @default(uuid())
    name      String
    posts     Post[]
    comments  Comment[]
    profiles  Profile[]
    auditLogs AuditLog[]
    sessions  Session[]
}

model Post {
    id     String @id @default(uuid())
    title  String
    userId String
    user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Comment {
    id     String  @id @default(uuid())
    body   String
    userId String?
    user   User?   @relation(fields: [userId], references: [id], onDelete: SetNull)
}

model Profile {
    id     String @id @default(uuid())
    bio    String
    userId String
    user   User   @relation(fields: [userId], references: [id], onDelete: SetDefault)
}

model AuditLog {
    id     String @id @default(uuid())
    action String
    userId String
    user   User   @relation(fields: [userId], references: [id], onDelete: NoAction)
}

model Session {
    id     String @id @default(uuid())
    token  String
    userId String
    user   User   @relation(fields: [userId], references: [id], onDelete: Restrict)
}

model Tag {
    id      String   @id @default(uuid())
    label   String
    ownerId String
    owner   TagOwner @relation(fields: [ownerId], references: [id])
}

model TagOwner {
    id   String @id @default(uuid())
    name String
    tags Tag[]
}
`

    fs.mkdirSync('./prisma-dbml', { recursive: true })
    fs.writeFileSync('./prisma-dbml/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-dbml/schema.prisma')

    const result = fs.readFileSync('./prisma-dbml/dbml/schema.dbml', {
      encoding: 'utf-8',
    })
    const expected = `Table User {
  id String [pk]
  name String [not null]
}

Table Post {
  id String [pk]
  title String [not null]
  userId String [not null]
}

Table Comment {
  id String [pk]
  body String [not null]
  userId String
}

Table Profile {
  id String [pk]
  bio String [not null]
  userId String [not null]
}

Table AuditLog {
  id String [pk]
  action String [not null]
  userId String [not null]
}

Table Session {
  id String [pk]
  token String [not null]
  userId String [not null]
}

Table Tag {
  id String [pk]
  label String [not null]
  ownerId String [not null]
}

Table TagOwner {
  id String [pk]
  name String [not null]
}

Ref Post_userId_fk: Post.userId > User.id [delete: cascade]

Ref Comment_userId_fk: Comment.userId > User.id [delete: set null]

Ref Profile_userId_fk: Profile.userId > User.id [delete: set default]

Ref AuditLog_userId_fk: AuditLog.userId > User.id [delete: no action]

Ref Session_userId_fk: Session.userId > User.id [delete: restrict]

Ref Tag_ownerId_fk: Tag.ownerId > TagOwner.id`
    expect(result).toStrictEqual(expected)
  }, 30000)

  it('hekireki-dbml emits update actions and combines them with delete', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "postgresql"
}

generator Hekireki-DBML {
    provider = "hekireki-dbml"
    output   = "dbml"
}

model User {
    id    String @id @default(uuid())
    posts Post[]
    tags  Tag[]
}

model Post {
    id     String @id @default(uuid())
    userId String
    user   User   @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: Restrict)
}

model Tag {
    id     String @id @default(uuid())
    userId String
    user   User   @relation(fields: [userId], references: [id], onUpdate: SetNull)
}
`

    fs.mkdirSync('./prisma-dbml', { recursive: true })
    fs.writeFileSync('./prisma-dbml/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-dbml/schema.prisma')

    const result = fs.readFileSync('./prisma-dbml/dbml/schema.dbml', {
      encoding: 'utf-8',
    })
    const expected = `Table User {
  id String [pk]
}

Table Post {
  id String [pk]
  userId String [not null]
}

Table Tag {
  id String [pk]
  userId String [not null]
}

Ref Post_userId_fk: Post.userId > User.id [delete: cascade, update: restrict]

Ref Tag_userId_fk: Tag.userId > User.id [update: set null]`
    expect(result).toStrictEqual(expected)
  }, 30000)

  it('hekireki-dbml emits a composite foreign key with referential actions', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "postgresql"
}

generator Hekireki-DBML {
    provider = "hekireki-dbml"
    output   = "dbml"
}

model User {
    tenantId    String
    id          String       @default(uuid())
    memberships Membership[]

    @@id([tenantId, id])
}

model Membership {
    id       String @id @default(uuid())
    tenantId String
    userId   String
    user     User   @relation(fields: [tenantId, userId], references: [tenantId, id], onDelete: Cascade, onUpdate: Cascade)
}
`

    fs.mkdirSync('./prisma-dbml', { recursive: true })
    fs.writeFileSync('./prisma-dbml/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-dbml/schema.prisma')

    const result = fs.readFileSync('./prisma-dbml/dbml/schema.dbml', {
      encoding: 'utf-8',
    })
    const expected = `Table User {
  tenantId String [not null]
  id String [not null]

  indexes {
    (tenantId, id) [pk]
  }
}

Table Membership {
  id String [pk]
  tenantId String [not null]
  userId String [not null]
}

Ref Membership_(tenantId, userId)_fk: Membership.(tenantId, userId) > User.(tenantId, id) [delete: cascade, update: cascade]`
    expect(result).toStrictEqual(expected)
  }, 30000)

  it('hekireki-dbml emits a self-relation with a referential action', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "postgresql"
}

generator Hekireki-DBML {
    provider = "hekireki-dbml"
    output   = "dbml"
}

model Employee {
    id        String     @id @default(uuid())
    managerId String?
    manager   Employee?  @relation("EmployeeHierarchy", fields: [managerId], references: [id], onDelete: SetNull)
    reports   Employee[] @relation("EmployeeHierarchy")
}
`

    fs.mkdirSync('./prisma-dbml', { recursive: true })
    fs.writeFileSync('./prisma-dbml/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-dbml/schema.prisma')

    const result = fs.readFileSync('./prisma-dbml/dbml/schema.dbml', {
      encoding: 'utf-8',
    })
    const expected = `Table Employee {
  id String [pk]
  managerId String
}

Ref Employee_managerId_fk: Employee.managerId - Employee.id [delete: set null]`
    expect(result).toStrictEqual(expected)
  }, 30000)
})
