import { exec } from 'node:child_process'
import fs from 'node:fs'
import { promisify } from 'node:util'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

// Test run
// pnpm vitest run ./src/generator/gorm/index.test.ts

describe('prisma generate', () => {
  afterEach(() => {
    fs.rmSync('./prisma-gorm/gorm', { recursive: true, force: true })
    fs.rmSync('./prisma-gorm/schema.prisma', { force: true })
  })
  afterAll(() => {
    fs.rmSync('./prisma-gorm', { recursive: true, force: true })
  })

  it('hekireki-gorm basic model with UUID PK and relations', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator Hekireki-GORM {
    provider = "hekireki-gorm"
    output   = "gorm"
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

    fs.mkdirSync('./prisma-gorm', { recursive: true })
    fs.writeFileSync('./prisma-gorm/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-gorm/schema.prisma')

    const result = fs.readFileSync('./prisma-gorm/gorm/models.go', {
      encoding: 'utf-8',
    })
    const expected = `package model

type User struct {
\tID string \`gorm:"column:id;primaryKey;type:char(36)" json:"id"\`
\tName string \`gorm:"column:name;not null" json:"name"\`
\tPosts []Post \`gorm:"foreignKey:UserID"\`
}

type Post struct {
\tID string \`gorm:"column:id;primaryKey;type:char(36)" json:"id"\`
\tTitle string \`gorm:"column:title;not null" json:"title"\`
\tContent string \`gorm:"column:content;not null" json:"content"\`
\tUserID string \`gorm:"column:user_id;not null" json:"user_id"\`
\tUser User
}
`
    expect(result).toStrictEqual(expected)
  }, 30000)

  it('hekireki-gorm with has_one relation', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator Hekireki-GORM {
    provider = "hekireki-gorm"
    output   = "gorm"
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

    fs.mkdirSync('./prisma-gorm', { recursive: true })
    fs.writeFileSync('./prisma-gorm/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-gorm/schema.prisma')

    const result = fs.readFileSync('./prisma-gorm/gorm/models.go', {
      encoding: 'utf-8',
    })
    const expected = `package model

type User struct {
\tID string \`gorm:"column:id;primaryKey;type:char(36)" json:"id"\`
\tName string \`gorm:"column:name;not null" json:"name"\`
\tProfile Profile \`gorm:"foreignKey:UserID"\`
}

type Profile struct {
\tID string \`gorm:"column:id;primaryKey;type:char(36)" json:"id"\`
\tBio string \`gorm:"column:bio;not null" json:"bio"\`
\tUserID string \`gorm:"column:user_id;uniqueIndex;not null" json:"user_id"\`
\tUser User
}
`
    expect(result).toStrictEqual(expected)
  }, 30000)

  it('hekireki-gorm with enum and nullable fields', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "postgresql"
}

generator Hekireki-GORM {
    provider = "hekireki-gorm"
    output   = "gorm"
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

    fs.mkdirSync('./prisma-gorm', { recursive: true })
    fs.writeFileSync('./prisma-gorm/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-gorm/schema.prisma')

    const result = fs.readFileSync('./prisma-gorm/gorm/models.go', {
      encoding: 'utf-8',
    })
    const expected = `package model

type User struct {
\tID string \`gorm:"column:id;primaryKey" json:"id"\`
\tName string \`gorm:"column:name;not null" json:"name"\`
\tBio *string \`gorm:"column:bio" json:"bio"\`
\tRole string \`gorm:"column:role;default:USER;not null" json:"role"\`
\tPosts []Post \`gorm:"foreignKey:UserID"\`
}

type Post struct {
\tID string \`gorm:"column:id;primaryKey" json:"id"\`
\tTitle string \`gorm:"column:title;not null" json:"title"\`
\tContent *string \`gorm:"column:content" json:"content"\`
\tUserID string \`gorm:"column:user_id;not null" json:"user_id"\`
\tUser User
}
`
    expect(result).toStrictEqual(expected)
  }, 30000)

  it('hekireki-gorm with autoincrement PK', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "postgresql"
}

generator Hekireki-GORM {
    provider = "hekireki-gorm"
    output   = "gorm"
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

    fs.mkdirSync('./prisma-gorm', { recursive: true })
    fs.writeFileSync('./prisma-gorm/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-gorm/schema.prisma')

    const result = fs.readFileSync('./prisma-gorm/gorm/models.go', {
      encoding: 'utf-8',
    })
    const expected = `package model

type User struct {
\tID int \`gorm:"column:id;primaryKey;autoIncrement" json:"id"\`
\tName string \`gorm:"column:name;not null" json:"name"\`
\tPosts []Post \`gorm:"foreignKey:UserID"\`
}

type Post struct {
\tID int \`gorm:"column:id;primaryKey;autoIncrement" json:"id"\`
\tTitle string \`gorm:"column:title;not null" json:"title"\`
\tUserID int \`gorm:"column:user_id;not null" json:"user_id"\`
\tUser User
}
`
    expect(result).toStrictEqual(expected)
  }, 30000)

  it('hekireki-gorm with composite primary key', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator Hekireki-GORM {
    provider = "hekireki-gorm"
    output   = "gorm"
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

    fs.mkdirSync('./prisma-gorm', { recursive: true })
    fs.writeFileSync('./prisma-gorm/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-gorm/schema.prisma')

    const result = fs.readFileSync('./prisma-gorm/gorm/models.go', {
      encoding: 'utf-8',
    })
    const expected = `package model

type User struct {
\tID string \`gorm:"column:id;primaryKey;type:char(36)" json:"id"\`
\tName string \`gorm:"column:name;not null" json:"name"\`
\tLikes []Like \`gorm:"foreignKey:UserID"\`
}

type Post struct {
\tID string \`gorm:"column:id;primaryKey;type:char(36)" json:"id"\`
\tTitle string \`gorm:"column:title;not null" json:"title"\`
\tLikes []Like \`gorm:"foreignKey:PostID"\`
}

type Like struct {
\tUserID string \`gorm:"column:user_id;primaryKey" json:"user_id"\`
\tPostID string \`gorm:"column:post_id;primaryKey" json:"post_id"\`
\tUser User
\tPost Post
}
`
    expect(result).toStrictEqual(expected)
  }, 30000)

  it('hekireki-gorm with many-to-many relation', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "postgresql"
}

generator Hekireki-GORM {
    provider = "hekireki-gorm"
    output   = "gorm"
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

    fs.mkdirSync('./prisma-gorm', { recursive: true })
    fs.writeFileSync('./prisma-gorm/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-gorm/schema.prisma')

    const result = fs.readFileSync('./prisma-gorm/gorm/models.go', {
      encoding: 'utf-8',
    })
    const expected = `package model

type Post struct {
\tID string \`gorm:"column:id;primaryKey;type:char(36)" json:"id"\`
\tTitle string \`gorm:"column:title;not null" json:"title"\`
\tTags []Tag \`gorm:"many2many:_PostToTag;"\`
}

type Tag struct {
\tID string \`gorm:"column:id;primaryKey;type:char(36)" json:"id"\`
\tName string \`gorm:"column:name;not null" json:"name"\`
\tPosts []Post \`gorm:"many2many:_PostToTag;"\`
}
`
    expect(result).toStrictEqual(expected)
  }, 30000)

  it('hekireki-gorm with defaults and boolean fields', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "postgresql"
}

generator Hekireki-GORM {
    provider = "hekireki-gorm"
    output   = "gorm"
}

model Agent {
    id       String  @id @default(uuid())
    codeName String
    active   Boolean @default(true)
    priority Int     @default(1)
}
`

    fs.mkdirSync('./prisma-gorm', { recursive: true })
    fs.writeFileSync('./prisma-gorm/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-gorm/schema.prisma')

    const result = fs.readFileSync('./prisma-gorm/gorm/models.go', {
      encoding: 'utf-8',
    })
    const expected = `package model

type Agent struct {
\tID string \`gorm:"column:id;primaryKey;type:char(36)" json:"id"\`
\tCodeName string \`gorm:"column:code_name;not null" json:"code_name"\`
\tActive bool \`gorm:"column:active;default:true;not null" json:"active"\`
\tPriority int \`gorm:"column:priority;default:1;not null" json:"priority"\`
}
`
    expect(result).toStrictEqual(expected)
  }, 30000)

  it('hekireki-gorm with timestamps (createdAt + updatedAt)', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "postgresql"
}

generator Hekireki-GORM {
    provider = "hekireki-gorm"
    output   = "gorm"
}

model User {
    id        String   @id @default(uuid())
    name      String
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
}
`

    fs.mkdirSync('./prisma-gorm', { recursive: true })
    fs.writeFileSync('./prisma-gorm/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-gorm/schema.prisma')

    const result = fs.readFileSync('./prisma-gorm/gorm/models.go', {
      encoding: 'utf-8',
    })
    const expected = `package model

import "time"

type User struct {
\tID string \`gorm:"column:id;primaryKey;type:char(36)" json:"id"\`
\tName string \`gorm:"column:name;not null" json:"name"\`
\tCreatedAt time.Time \`gorm:"column:created_at;autoCreateTime;not null" json:"created_at"\`
\tUpdatedAt time.Time \`gorm:"column:updated_at;autoUpdateTime;not null" json:"updated_at"\`
}
`
    expect(result).toStrictEqual(expected)
  }, 30000)

  it('hekireki-gorm with custom package name', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator Hekireki-GORM {
    provider = "hekireki-gorm"
    output   = "gorm"
    package  = "entity"
}

model User {
    id   String @id @default(uuid())
    name String
}
`

    fs.mkdirSync('./prisma-gorm', { recursive: true })
    fs.writeFileSync('./prisma-gorm/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-gorm/schema.prisma')

    const result = fs.readFileSync('./prisma-gorm/gorm/models.go', {
      encoding: 'utf-8',
    })
    const expected = `package entity

type User struct {
\tID string \`gorm:"column:id;primaryKey;type:char(36)" json:"id"\`
\tName string \`gorm:"column:name;not null" json:"name"\`
}
`
    expect(result).toStrictEqual(expected)
  }, 30000)
})

// ============================================================================
// Fixture-based integration tests — strict toStrictEqual matching
// ============================================================================

describe('fixture: twitter-clone-sample', () => {
  afterAll(() => {
    fs.rmSync('../../fixtures/twitter-clone-sample/gorm', { recursive: true, force: true })
  })

  it('generates all models with self-ref, composite PK, @updatedAt, @default(now())', async () => {
    await promisify(exec)(
      'npx prisma generate --schema=../../fixtures/twitter-clone-sample/schema.prisma',
    )

    expect(
      fs.readFileSync('../../fixtures/twitter-clone-sample/gorm/models.go', 'utf-8'),
    ).toStrictEqual(`package model

import "time"

type User struct {
\tID string \`gorm:"column:id;primaryKey;type:char(36)" json:"id"\`
\tName string \`gorm:"column:name;not null" json:"name"\`
\tUsername string \`gorm:"column:username;uniqueIndex;not null" json:"username"\`
\tBio *string \`gorm:"column:bio;default:" json:"bio"\`
\tEmail string \`gorm:"column:email;uniqueIndex;not null" json:"email"\`
\tEmailVerified *time.Time \`gorm:"column:email_verified" json:"email_verified"\`
\tImage *string \`gorm:"column:image" json:"image"\`
\tCoverImage *string \`gorm:"column:cover_image" json:"cover_image"\`
\tProfileImage *string \`gorm:"column:profile_image" json:"profile_image"\`
\tHashedPassword *string \`gorm:"column:hashed_password" json:"hashed_password"\`
\tCreatedAt time.Time \`gorm:"column:created_at;autoCreateTime;not null" json:"created_at"\`
\tUpdatedAt time.Time \`gorm:"column:updated_at;autoUpdateTime;not null" json:"updated_at"\`
\tHasNotification *bool \`gorm:"column:has_notification;default:false" json:"has_notification"\`
\tPosts []Post \`gorm:"foreignKey:UserID"\`
\tComments []Comment \`gorm:"foreignKey:UserID"\`
\tNotifications []Notification \`gorm:"foreignKey:UserID"\`
\tFollowers []Follow \`gorm:"foreignKey:FollowingID"\`
\tFollowing []Follow \`gorm:"foreignKey:FollowerID"\`
\tLikes []Like \`gorm:"foreignKey:UserID"\`
}

type Post struct {
\tID string \`gorm:"column:id;primaryKey;type:char(36)" json:"id"\`
\tBody string \`gorm:"column:body;not null" json:"body"\`
\tCreatedAt time.Time \`gorm:"column:created_at;autoCreateTime;not null" json:"created_at"\`
\tUpdatedAt time.Time \`gorm:"column:updated_at;autoUpdateTime;not null" json:"updated_at"\`
\tUserID string \`gorm:"column:user_id;not null" json:"user_id"\`
\tUser User
\tComments []Comment \`gorm:"foreignKey:PostID"\`
\tLikes []Like \`gorm:"foreignKey:PostID"\`
}

type Follow struct {
\tFollowerID string \`gorm:"column:follower_id;primaryKey" json:"follower_id"\`
\tFollowingID string \`gorm:"column:following_id;primaryKey" json:"following_id"\`
\tCreatedAt time.Time \`gorm:"column:created_at;autoCreateTime;not null" json:"created_at"\`
\tFollower User \`gorm:"foreignKey:FollowerID"\`
\tFollowing User \`gorm:"foreignKey:FollowingID"\`
}

type Like struct {
\tUserID string \`gorm:"column:user_id;primaryKey" json:"user_id"\`
\tPostID string \`gorm:"column:post_id;primaryKey" json:"post_id"\`
\tCreatedAt time.Time \`gorm:"column:created_at;autoCreateTime;not null" json:"created_at"\`
\tUser User
\tPost Post
}

type Comment struct {
\tID string \`gorm:"column:id;primaryKey;type:char(36)" json:"id"\`
\tBody string \`gorm:"column:body;not null" json:"body"\`
\tCreatedAt time.Time \`gorm:"column:created_at;autoCreateTime;not null" json:"created_at"\`
\tUpdatedAt time.Time \`gorm:"column:updated_at;autoUpdateTime;not null" json:"updated_at"\`
\tUserID string \`gorm:"column:user_id;index:idx_user_id;not null" json:"user_id"\`
\tPostID string \`gorm:"column:post_id;index:idx_post_id;not null" json:"post_id"\`
\tUser User
\tPost Post
}

type Notification struct {
\tID string \`gorm:"column:id;primaryKey;type:char(36)" json:"id"\`
\tBody string \`gorm:"column:body;not null" json:"body"\`
\tUserID string \`gorm:"column:user_id;index:idx_user_id;not null" json:"user_id"\`
\tCreatedAt time.Time \`gorm:"column:created_at;autoCreateTime;not null" json:"created_at"\`
\tUser User
}
`)
  }, 60000)
})

describe('fixture: rbac', () => {
  afterAll(() => {
    fs.rmSync('../../fixtures/rbac/gorm', { recursive: true, force: true })
  })

  it('generates RBAC models with @@map, @db.VarChar, autoincrement, enum, composite PK', async () => {
    await promisify(exec)('npx prisma generate --schema=../../fixtures/rbac/schema.prisma')

    expect(fs.readFileSync('../../fixtures/rbac/gorm/models.go', 'utf-8')).toStrictEqual(
      `package model

import "time"

type Organization struct {
\tID int \`gorm:"column:id;primaryKey;autoIncrement" json:"id"\`
\tName string \`gorm:"column:name;type:varchar(200);not null" json:"name"\`
\tSlug string \`gorm:"column:slug;uniqueIndex;type:varchar(100);not null" json:"slug"\`
\tStatus string \`gorm:"column:status;default:ACTIVE;not null" json:"status"\`
\tCreatedAt time.Time \`gorm:"column:created_at;autoCreateTime;not null" json:"created_at"\`
\tUpdatedAt time.Time \`gorm:"column:updated_at;autoUpdateTime;not null" json:"updated_at"\`
\tUsers []User \`gorm:"foreignKey:OrganizationID"\`
}

func (Organization) TableName() string {
\treturn "organizations"
}

type User struct {
\tID int \`gorm:"column:id;primaryKey;autoIncrement" json:"id"\`
\tOrganizationID int \`gorm:"column:organization_id;index:idx_organization_id;not null" json:"organization_id"\`
\tEmail string \`gorm:"column:email;uniqueIndex;type:varchar(255);not null" json:"email"\`
\tName string \`gorm:"column:name;type:varchar(100);not null" json:"name"\`
\tCreatedAt time.Time \`gorm:"column:created_at;autoCreateTime;not null" json:"created_at"\`
\tUpdatedAt time.Time \`gorm:"column:updated_at;autoUpdateTime;not null" json:"updated_at"\`
\tOrganization Organization
\tUserRoles []UserRole \`gorm:"foreignKey:UserID"\`
\tAuditLogs []AuditLog \`gorm:"foreignKey:UserID"\`
}

func (User) TableName() string {
\treturn "users"
}

type Role struct {
\tID int \`gorm:"column:id;primaryKey;autoIncrement" json:"id"\`
\tName string \`gorm:"column:name;uniqueIndex;type:varchar(100);not null" json:"name"\`
\tDescription *string \`gorm:"column:description;type:varchar(500)" json:"description"\`
\tCreatedAt time.Time \`gorm:"column:created_at;autoCreateTime;not null" json:"created_at"\`
\tUpdatedAt time.Time \`gorm:"column:updated_at;autoUpdateTime;not null" json:"updated_at"\`
\tUserRoles []UserRole \`gorm:"foreignKey:RoleID"\`
\tRolePermissions []RolePermission \`gorm:"foreignKey:RoleID"\`
}

func (Role) TableName() string {
\treturn "roles"
}

type Permission struct {
\tID int \`gorm:"column:id;primaryKey;autoIncrement" json:"id"\`
\tResource string \`gorm:"column:resource;uniqueIndex:idx_resource_action_unique;type:varchar(100);not null" json:"resource"\`
\tAction string \`gorm:"column:action;uniqueIndex:idx_resource_action_unique;type:varchar(100);not null" json:"action"\`
\tDescription *string \`gorm:"column:description;type:varchar(500)" json:"description"\`
\tCreatedAt time.Time \`gorm:"column:created_at;autoCreateTime;not null" json:"created_at"\`
\tRolePermissions []RolePermission \`gorm:"foreignKey:PermissionID"\`
}

func (Permission) TableName() string {
\treturn "permissions"
}

type UserRole struct {
\tUserID int \`gorm:"column:user_id;primaryKey" json:"user_id"\`
\tRoleID int \`gorm:"column:role_id;primaryKey" json:"role_id"\`
\tAssignedAt time.Time \`gorm:"column:assigned_at;autoCreateTime;not null" json:"assigned_at"\`
\tUser User
\tRole Role
}

func (UserRole) TableName() string {
\treturn "user_roles"
}

type RolePermission struct {
\tRoleID int \`gorm:"column:role_id;primaryKey" json:"role_id"\`
\tPermissionID int \`gorm:"column:permission_id;primaryKey" json:"permission_id"\`
\tAssignedAt time.Time \`gorm:"column:assigned_at;autoCreateTime;not null" json:"assigned_at"\`
\tRole Role
\tPermission Permission
}

func (RolePermission) TableName() string {
\treturn "role_permissions"
}

type AuditLog struct {
\tID int \`gorm:"column:id;primaryKey;autoIncrement" json:"id"\`
\tUserID int \`gorm:"column:user_id;index:idx_user_id;not null" json:"user_id"\`
\tAction string \`gorm:"column:action;type:varchar(50);not null" json:"action"\`
\tResource string \`gorm:"column:resource;type:varchar(100);not null" json:"resource"\`
\tDetail *string \`gorm:"column:detail" json:"detail"\`
\tIPAddress *string \`gorm:"column:ip_address;type:varchar(45)" json:"ip_address"\`
\tCreatedAt time.Time \`gorm:"column:created_at;index:idx_created_at;autoCreateTime;not null" json:"created_at"\`
\tUser User
}

func (AuditLog) TableName() string {
\treturn "audit_logs"
}
`,
    )
  }, 60000)
})

describe('fixture: no-annotation (M2M implicit)', () => {
  afterAll(() => {
    fs.rmSync('../../fixtures/no-annotation/gorm', { recursive: true, force: true })
  })

  it('generates models with implicit M2M (Post <-> Tag), enum, one-to-one, @updatedAt', async () => {
    await promisify(exec)('npx prisma generate --schema=../../fixtures/no-annotation/schema.prisma')

    expect(
      fs.readFileSync('../../fixtures/no-annotation/gorm/models.go', 'utf-8'),
    ).toStrictEqual(`package model

import "time"

type User struct {
\tID string \`gorm:"column:id;primaryKey;type:char(36)" json:"id"\`
\tEmail string \`gorm:"column:email;uniqueIndex;not null" json:"email"\`
\tName *string \`gorm:"column:name" json:"name"\`
\tAge *int \`gorm:"column:age" json:"age"\`
\tIsActive bool \`gorm:"column:is_active;default:true;not null" json:"is_active"\`
\tRole string \`gorm:"column:role;default:MEMBER;not null" json:"role"\`
\tCreatedAt time.Time \`gorm:"column:created_at;autoCreateTime;not null" json:"created_at"\`
\tUpdatedAt time.Time \`gorm:"column:updated_at;autoUpdateTime;not null" json:"updated_at"\`
\tPosts []Post \`gorm:"foreignKey:AuthorID"\`
\tProfile Profile \`gorm:"foreignKey:UserID"\`
}

type Post struct {
\tID string \`gorm:"column:id;primaryKey;type:char(36)" json:"id"\`
\tTitle string \`gorm:"column:title;not null" json:"title"\`
\tContent string \`gorm:"column:content;not null" json:"content"\`
\tPublished bool \`gorm:"column:published;default:false;not null" json:"published"\`
\tCreatedAt time.Time \`gorm:"column:created_at;autoCreateTime;not null" json:"created_at"\`
\tUpdatedAt time.Time \`gorm:"column:updated_at;autoUpdateTime;not null" json:"updated_at"\`
\tAuthorID string \`gorm:"column:author_id;not null" json:"author_id"\`
\tAuthor User \`gorm:"foreignKey:AuthorID"\`
\tTags []Tag \`gorm:"many2many:_PostToTag;"\`
}

type Profile struct {
\tID string \`gorm:"column:id;primaryKey;type:char(36)" json:"id"\`
\tBio *string \`gorm:"column:bio" json:"bio"\`
\tAvatar *string \`gorm:"column:avatar" json:"avatar"\`
\tUserID string \`gorm:"column:user_id;uniqueIndex;not null" json:"user_id"\`
\tUser User
}

type Tag struct {
\tID string \`gorm:"column:id;primaryKey;type:char(36)" json:"id"\`
\tName string \`gorm:"column:name;uniqueIndex;not null" json:"name"\`
\tPosts []Post \`gorm:"many2many:_PostToTag;"\`
}
`)
  }, 60000)
})

describe('fixture: jwt-auth-pg', () => {
  afterAll(() => {
    fs.rmSync('../../fixtures/jwt-auth-pg/gorm', { recursive: true, force: true })
  })

  it('generates PostgreSQL models with @db.Uuid, @db.VarChar, @db.Decimal, @db.Timestamptz, @@map', async () => {
    await promisify(exec)('npx prisma generate --schema=../../fixtures/jwt-auth-pg/schema.prisma')

    expect(fs.readFileSync('../../fixtures/jwt-auth-pg/gorm/models.go', 'utf-8')).toStrictEqual(
      `package model

import "time"

type User struct {
\tID string \`gorm:"column:id;primaryKey;type:char(36)" json:"id"\`
\tEmail string \`gorm:"column:email;uniqueIndex;type:varchar(255);not null" json:"email"\`
\tPasswordHash *string \`gorm:"column:password_hash" json:"password_hash"\`
\tName string \`gorm:"column:name;type:varchar(100);not null" json:"name"\`
\tAvatarURL *string \`gorm:"column:avatar_url" json:"avatar_url"\`
\tRole string \`gorm:"column:role;default:USER;not null" json:"role"\`
\tCreditBalance float64 \`gorm:"column:credit_balance;type:decimal(10,2);default:0;not null" json:"credit_balance"\`
\tEmailVerified bool \`gorm:"column:email_verified;default:false;not null" json:"email_verified"\`
\tIsActive bool \`gorm:"column:is_active;default:true;not null" json:"is_active"\`
\tCreatedAt time.Time \`gorm:"column:created_at;type:timestamp;autoCreateTime;not null" json:"created_at"\`
\tUpdatedAt time.Time \`gorm:"column:updated_at;type:timestamp;autoUpdateTime;not null" json:"updated_at"\`
\tLastLoginAt *time.Time \`gorm:"column:last_login_at;type:timestamp" json:"last_login_at"\`
\tOauthAccounts []OAuthAccount \`gorm:"foreignKey:UserID"\`
\tRefreshTokens []RefreshToken \`gorm:"foreignKey:UserID"\`
\tEmailVerifications []EmailVerification \`gorm:"foreignKey:UserID"\`
\tPasswordResets []PasswordReset \`gorm:"foreignKey:UserID"\`
\tTwoFactorSetting TwoFactorSetting \`gorm:"foreignKey:UserID"\`
}

func (User) TableName() string {
\treturn "users"
}

type OAuthAccount struct {
\tID string \`gorm:"column:id;primaryKey;type:char(36)" json:"id"\`
\tUserID string \`gorm:"column:user_id;index:idx_user_id;type:char(36);not null" json:"user_id"\`
\tProvider string \`gorm:"column:provider;uniqueIndex:idx_provider_provider_account_id_unique;not null" json:"provider"\`
\tProviderAccountID string \`gorm:"column:provider_account_id;uniqueIndex:idx_provider_provider_account_id_unique;type:varchar(255);not null" json:"provider_account_id"\`
\tAccessToken *string \`gorm:"column:access_token" json:"access_token"\`
\tRefreshToken *string \`gorm:"column:refresh_token" json:"refresh_token"\`
\tExpiresAt *time.Time \`gorm:"column:expires_at;type:timestamp" json:"expires_at"\`
\tCreatedAt time.Time \`gorm:"column:created_at;type:timestamp;autoCreateTime;not null" json:"created_at"\`
\tUser User
}

func (OAuthAccount) TableName() string {
\treturn "oauth_accounts"
}

type TwoFactorSetting struct {
\tID string \`gorm:"column:id;primaryKey;type:char(36)" json:"id"\`
\tUserID string \`gorm:"column:user_id;uniqueIndex;type:char(36);not null" json:"user_id"\`
\tEnabled bool \`gorm:"column:enabled;default:false;not null" json:"enabled"\`
\tMethod *string \`gorm:"column:method" json:"method"\`
\tTotpSecret *string \`gorm:"column:totp_secret" json:"totp_secret"\`
\tPhoneNumber *string \`gorm:"column:phone_number;type:varchar(20)" json:"phone_number"\`
\tBackupCodes *string \`gorm:"column:backup_codes" json:"backup_codes"\`
\tVerifiedAt *time.Time \`gorm:"column:verified_at;type:timestamp" json:"verified_at"\`
\tCreatedAt time.Time \`gorm:"column:created_at;type:timestamp;autoCreateTime;not null" json:"created_at"\`
\tUpdatedAt time.Time \`gorm:"column:updated_at;type:timestamp;autoUpdateTime;not null" json:"updated_at"\`
\tUser User
}

func (TwoFactorSetting) TableName() string {
\treturn "two_factor_settings"
}

type RefreshToken struct {
\tID string \`gorm:"column:id;primaryKey" json:"id"\`
\tUserID string \`gorm:"column:user_id;index:idx_user_id;type:char(36);not null" json:"user_id"\`
\tTokenHash string \`gorm:"column:token_hash;uniqueIndex;not null" json:"token_hash"\`
\tDeviceInfo *string \`gorm:"column:device_info" json:"device_info"\`
\tIPAddress *string \`gorm:"column:ip_address;type:varchar(45)" json:"ip_address"\`
\tExpiresAt time.Time \`gorm:"column:expires_at;type:timestamp;not null" json:"expires_at"\`
\tCreatedAt time.Time \`gorm:"column:created_at;type:timestamp;autoCreateTime;not null" json:"created_at"\`
\tRevoked bool \`gorm:"column:revoked;default:false;not null" json:"revoked"\`
\tUser User
}

func (RefreshToken) TableName() string {
\treturn "refresh_tokens"
}

type EmailVerification struct {
\tID string \`gorm:"column:id;primaryKey;type:char(36)" json:"id"\`
\tUserID string \`gorm:"column:user_id;index:idx_user_id;type:char(36);not null" json:"user_id"\`
\tTokenHash string \`gorm:"column:token_hash;uniqueIndex;not null" json:"token_hash"\`
\tExpiresAt time.Time \`gorm:"column:expires_at;type:timestamp;not null" json:"expires_at"\`
\tCreatedAt time.Time \`gorm:"column:created_at;type:timestamp;autoCreateTime;not null" json:"created_at"\`
\tUser User
}

func (EmailVerification) TableName() string {
\treturn "email_verifications"
}

type PasswordReset struct {
\tID string \`gorm:"column:id;primaryKey;type:char(36)" json:"id"\`
\tUserID string \`gorm:"column:user_id;index:idx_user_id;type:char(36);not null" json:"user_id"\`
\tTokenHash string \`gorm:"column:token_hash;uniqueIndex;not null" json:"token_hash"\`
\tExpiresAt time.Time \`gorm:"column:expires_at;type:timestamp;not null" json:"expires_at"\`
\tUsed bool \`gorm:"column:used;default:false;not null" json:"used"\`
\tCreatedAt time.Time \`gorm:"column:created_at;type:timestamp;autoCreateTime;not null" json:"created_at"\`
\tUser User
}

func (PasswordReset) TableName() string {
\treturn "password_resets"
}
`,
    )
  }, 60000)
})
