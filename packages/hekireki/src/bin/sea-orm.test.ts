import { exec } from 'node:child_process'
import fs from 'node:fs'
import { promisify } from 'node:util'

import { afterAll, afterEach, describe, expect, it } from 'vite-plus/test'

// Test run
// pnpm vitest run ./src/generator/sea-orm/index.test.ts

describe('prisma generate', () => {
  afterEach(() => {
    fs.rmSync('./prisma-sea-orm/sea_orm', { recursive: true, force: true })
    fs.rmSync('./prisma-sea-orm/schema.prisma', { force: true })
  })
  afterAll(() => {
    fs.rmSync('./prisma-sea-orm', { recursive: true, force: true })
  })

  it('hekireki-sea-orm basic model with UUID PK and relations', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator HekirekiSeaORM {
    provider = "hekireki-sea-orm"
    output   = "sea_orm"
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

    fs.mkdirSync('./prisma-sea-orm', { recursive: true })
    fs.writeFileSync('./prisma-sea-orm/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-sea-orm/schema.prisma')

    const userResult = fs.readFileSync('./prisma-sea-orm/sea_orm/user.rs', { encoding: 'utf-8' })
    expect(userResult).toStrictEqual(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "user")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub name: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::post::Entity")]
    Posts,
}

impl Related<super::post::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Posts.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}`)

    const postResult = fs.readFileSync('./prisma-sea-orm/sea_orm/post.rs', { encoding: 'utf-8' })
    expect(postResult).toStrictEqual(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "post")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub title: String,
    pub content: String,
    pub user_id: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::user::Entity",
        from = "Column::UserId",
        to = "super::user::Column::Id"
    )]
    User,
}

impl Related<super::user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::User.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}`)

    // Check mod.rs
    const modResult = fs.readFileSync('./prisma-sea-orm/sea_orm/mod.rs', { encoding: 'utf-8' })
    expect(modResult).toStrictEqual(`pub mod post;
pub mod prelude;
pub mod user;
`)

    // Check prelude.rs
    const preludeResult = fs.readFileSync('./prisma-sea-orm/sea_orm/prelude.rs', {
      encoding: 'utf-8',
    })
    expect(preludeResult).toStrictEqual(`pub use super::user::Entity as User;
pub use super::post::Entity as Post;
`)
  }, 30000)

  it('hekireki-sea-orm with has_one relation', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator HekirekiSeaORM {
    provider = "hekireki-sea-orm"
    output   = "sea_orm"
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

    fs.mkdirSync('./prisma-sea-orm', { recursive: true })
    fs.writeFileSync('./prisma-sea-orm/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-sea-orm/schema.prisma')

    const userResult = fs.readFileSync('./prisma-sea-orm/sea_orm/user.rs', { encoding: 'utf-8' })
    expect(userResult).toStrictEqual(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "user")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub name: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_one = "super::profile::Entity")]
    Profile,
}

impl Related<super::profile::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Profile.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}`)

    const profileResult = fs.readFileSync('./prisma-sea-orm/sea_orm/profile.rs', {
      encoding: 'utf-8',
    })
    expect(profileResult).toStrictEqual(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "profile")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub bio: String,
    #[sea_orm(unique)]
    pub user_id: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::user::Entity",
        from = "Column::UserId",
        to = "super::user::Column::Id"
    )]
    User,
}

impl Related<super::user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::User.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}`)
  }, 30000)

  it('hekireki-sea-orm with autoincrement PK', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "postgresql"
}

generator HekirekiSeaORM {
    provider = "hekireki-sea-orm"
    output   = "sea_orm"
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

    fs.mkdirSync('./prisma-sea-orm', { recursive: true })
    fs.writeFileSync('./prisma-sea-orm/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-sea-orm/schema.prisma')

    const userResult = fs.readFileSync('./prisma-sea-orm/sea_orm/user.rs', { encoding: 'utf-8' })
    expect(userResult).toStrictEqual(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "user")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub name: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::post::Entity")]
    Posts,
}

impl Related<super::post::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Posts.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}`)

    const postResult = fs.readFileSync('./prisma-sea-orm/sea_orm/post.rs', { encoding: 'utf-8' })
    expect(postResult).toStrictEqual(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "post")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub title: String,
    pub user_id: i32,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::user::Entity",
        from = "Column::UserId",
        to = "super::user::Column::Id"
    )]
    User,
}

impl Related<super::user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::User.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}`)
  }, 30000)

  it('hekireki-sea-orm with enum and nullable fields', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "postgresql"
}

generator HekirekiSeaORM {
    provider = "hekireki-sea-orm"
    output   = "sea_orm"
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

    fs.mkdirSync('./prisma-sea-orm', { recursive: true })
    fs.writeFileSync('./prisma-sea-orm/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-sea-orm/schema.prisma')

    // Check enum file
    const roleResult = fs.readFileSync('./prisma-sea-orm/sea_orm/role.rs', { encoding: 'utf-8' })
    expect(roleResult).toStrictEqual(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]
#[sea_orm(rs_type = "String", db_type = "String(StringLen::None)")]
pub enum Role {
    #[sea_orm(string_value = "ADMIN")]
    Admin,
    #[sea_orm(string_value = "USER")]
    User,
    #[sea_orm(string_value = "MODERATOR")]
    Moderator,
}
`)

    const userResult = fs.readFileSync('./prisma-sea-orm/sea_orm/user.rs', { encoding: 'utf-8' })
    expect(userResult).toStrictEqual(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "user")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub name: String,
    pub bio: Option<String>,
    #[sea_orm(default_value = "USER")]
    pub role: Role,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::post::Entity")]
    Posts,
}

impl Related<super::post::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Posts.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}`)
  }, 30000)

  it('hekireki-sea-orm with composite primary key', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator HekirekiSeaORM {
    provider = "hekireki-sea-orm"
    output   = "sea_orm"
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

    fs.mkdirSync('./prisma-sea-orm', { recursive: true })
    fs.writeFileSync('./prisma-sea-orm/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-sea-orm/schema.prisma')

    const likeResult = fs.readFileSync('./prisma-sea-orm/sea_orm/like.rs', { encoding: 'utf-8' })
    expect(likeResult).toStrictEqual(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "like")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub user_id: String,
    #[sea_orm(primary_key, auto_increment = false)]
    pub post_id: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::user::Entity",
        from = "Column::UserId",
        to = "super::user::Column::Id"
    )]
    User,
    #[sea_orm(
        belongs_to = "super::post::Entity",
        from = "Column::PostId",
        to = "super::post::Column::Id"
    )]
    Post,
}

impl Related<super::user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::User.def()
    }
}

impl Related<super::post::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Post.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}`)
  }, 30000)

  it('hekireki-sea-orm with many-to-many relation', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "postgresql"
}

generator HekirekiSeaORM {
    provider = "hekireki-sea-orm"
    output   = "sea_orm"
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

    fs.mkdirSync('./prisma-sea-orm', { recursive: true })
    fs.writeFileSync('./prisma-sea-orm/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-sea-orm/schema.prisma')

    const postResult = fs.readFileSync('./prisma-sea-orm/sea_orm/post.rs', { encoding: 'utf-8' })
    expect(postResult).toStrictEqual(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "post")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub title: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl Related<super::tag::Entity> for Entity {
    fn to() -> RelationDef {
        super::post_to_tag::Relation::Tag.def()
    }
    fn via() -> Option<RelationDef> {
        Some(super::post_to_tag::Relation::Post.def().rev())
    }
}

impl ActiveModelBehavior for ActiveModel {}`)

    const tagResult = fs.readFileSync('./prisma-sea-orm/sea_orm/tag.rs', { encoding: 'utf-8' })
    expect(tagResult).toStrictEqual(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "tag")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub name: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl Related<super::post::Entity> for Entity {
    fn to() -> RelationDef {
        super::post_to_tag::Relation::Post.def()
    }
    fn via() -> Option<RelationDef> {
        Some(super::post_to_tag::Relation::Tag.def().rev())
    }
}

impl ActiveModelBehavior for ActiveModel {}`)

    // Check junction table
    const junctionResult = fs.readFileSync('./prisma-sea-orm/sea_orm/post_to_tag.rs', {
      encoding: 'utf-8',
    })
    expect(junctionResult).toStrictEqual(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "_PostToTag")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub post_id: String,
    #[sea_orm(primary_key, auto_increment = false)]
    pub tag_id: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::post::Entity",
        from = "Column::PostId",
        to = "super::post::Column::Id"
    )]
    Post,
    #[sea_orm(
        belongs_to = "super::tag::Entity",
        from = "Column::TagId",
        to = "super::tag::Column::Id"
    )]
    Tag,
}

impl ActiveModelBehavior for ActiveModel {}`)

    // Check mod.rs includes junction table
    const modResult = fs.readFileSync('./prisma-sea-orm/sea_orm/mod.rs', { encoding: 'utf-8' })
    expect(modResult).toContain('pub mod post_to_tag;')
  }, 30000)

  it('hekireki-sea-orm with defaults and boolean fields', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "postgresql"
}

generator HekirekiSeaORM {
    provider = "hekireki-sea-orm"
    output   = "sea_orm"
}

model Agent {
    id       String  @id @default(uuid())
    codeName String
    active   Boolean @default(true)
    priority Int     @default(1)
}
`

    fs.mkdirSync('./prisma-sea-orm', { recursive: true })
    fs.writeFileSync('./prisma-sea-orm/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-sea-orm/schema.prisma')

    const result = fs.readFileSync('./prisma-sea-orm/sea_orm/agent.rs', { encoding: 'utf-8' })
    expect(result).toStrictEqual(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "agent")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub code_name: String,
    #[sea_orm(default_value = true)]
    pub active: bool,
    #[sea_orm(default_value = 1)]
    pub priority: i32,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}`)
  }, 30000)

  it('hekireki-sea-orm with renameAll = camelCase', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "sqlite"
}

generator HekirekiSeaORM {
    provider   = "hekireki-sea-orm"
    output     = "sea_orm"
    renameAll  = "camelCase"
}

enum Role {
    ADMIN
    USER
}

model User {
    id       String @id @default(uuid())
    userName String
    role     Role   @default(USER)
    posts    Post[]
}

model Post {
    id      String @id @default(uuid())
    title   String
    userId  String
    user    User   @relation(fields: [userId], references: [id])
}
`

    fs.mkdirSync('./prisma-sea-orm', { recursive: true })
    fs.writeFileSync('./prisma-sea-orm/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-sea-orm/schema.prisma')

    const userResult = fs.readFileSync('./prisma-sea-orm/sea_orm/user.rs', { encoding: 'utf-8' })
    expect(userResult).toStrictEqual(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[sea_orm(table_name = "user")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub user_name: String,
    #[sea_orm(default_value = "USER")]
    pub role: Role,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::post::Entity")]
    Posts,
}

impl Related<super::post::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Posts.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}`)

    const postResult = fs.readFileSync('./prisma-sea-orm/sea_orm/post.rs', { encoding: 'utf-8' })
    expect(postResult).toContain('#[serde(rename_all = "camelCase")]')

    // Check enum also gets rename_all
    const roleResult = fs.readFileSync('./prisma-sea-orm/sea_orm/role.rs', { encoding: 'utf-8' })
    expect(roleResult).toContain('#[serde(rename_all = "camelCase")]')
    expect(roleResult).toContain(
      '#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]',
    )
  }, 30000)

  it('hekireki-sea-orm with timestamps (createdAt + updatedAt)', async () => {
    const prisma = `generator client {
    provider = "prisma-client-js"
}

datasource db {
    provider = "postgresql"
}

generator HekirekiSeaORM {
    provider = "hekireki-sea-orm"
    output   = "sea_orm"
}

model User {
    id        String   @id @default(uuid())
    name      String
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
}
`

    fs.mkdirSync('./prisma-sea-orm', { recursive: true })
    fs.writeFileSync('./prisma-sea-orm/schema.prisma', prisma, { encoding: 'utf-8' })
    await promisify(exec)('npx prisma generate --schema=./prisma-sea-orm/schema.prisma')

    const result = fs.readFileSync('./prisma-sea-orm/sea_orm/user.rs', { encoding: 'utf-8' })
    expect(result).toStrictEqual(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "user")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub name: String,
    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}`)
  }, 30000)
})

// ============================================================================
// Fixture-based integration tests — strict toStrictEqual matching
// ============================================================================

describe('fixture: twitter-clone-sample', () => {
  afterAll(() => {
    fs.rmSync('../../fixtures/twitter-clone-sample/sea_orm', { recursive: true, force: true })
  })

  it('generates all entities with self-ref, composite PK, timestamps', async () => {
    await promisify(exec)(
      'npx prisma generate --schema=../../fixtures/twitter-clone-sample/schema.prisma',
    )

    expect(fs.readFileSync('../../fixtures/twitter-clone-sample/sea_orm/user.rs', 'utf-8'))
      .toStrictEqual(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "user")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub name: String,
    #[sea_orm(unique)]
    pub username: String,
    #[sea_orm(default_value = "")]
    pub bio: Option<String>,
    #[sea_orm(unique)]
    pub email: String,
    pub email_verified: Option<DateTimeUtc>,
    pub image: Option<String>,
    pub cover_image: Option<String>,
    pub profile_image: Option<String>,
    pub hashed_password: Option<String>,
    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
    #[sea_orm(default_value = false)]
    pub has_notification: Option<bool>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::post::Entity")]
    Posts,
    #[sea_orm(has_many = "super::comment::Entity")]
    Comments,
    #[sea_orm(has_many = "super::notification::Entity")]
    Notifications,
    #[sea_orm(has_many = "super::follow::Entity")]
    Followers,
    #[sea_orm(has_many = "super::follow::Entity")]
    Following,
    #[sea_orm(has_many = "super::like::Entity")]
    Likes,
}

impl Related<super::post::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Posts.def()
    }
}

impl Related<super::comment::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Comments.def()
    }
}

impl Related<super::notification::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Notifications.def()
    }
}

impl Related<super::follow::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Followers.def()
    }
}

impl Related<super::follow::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Following.def()
    }
}

impl Related<super::like::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Likes.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}`)

    expect(fs.readFileSync('../../fixtures/twitter-clone-sample/sea_orm/follow.rs', 'utf-8'))
      .toStrictEqual(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "follow")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub follower_id: String,
    #[sea_orm(primary_key, auto_increment = false)]
    pub following_id: String,
    pub created_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::user::Entity",
        from = "Column::FollowerId",
        to = "super::user::Column::Id"
    )]
    Follower,
    #[sea_orm(
        belongs_to = "super::user::Entity",
        from = "Column::FollowingId",
        to = "super::user::Column::Id"
    )]
    Following,
}

impl Related<super::user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Follower.def()
    }
}

impl Related<super::user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Following.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}`)

    expect(fs.readFileSync('../../fixtures/twitter-clone-sample/sea_orm/mod.rs', 'utf-8'))
      .toStrictEqual(`pub mod comment;
pub mod follow;
pub mod like;
pub mod notification;
pub mod post;
pub mod prelude;
pub mod user;
`)
  }, 60000)
})

describe('fixture: rbac', () => {
  afterAll(() => {
    fs.rmSync('../../fixtures/rbac/sea_orm', { recursive: true, force: true })
  })

  it('generates RBAC entities with @@map, @db.VarChar, autoincrement, enum, composite PK', async () => {
    await promisify(exec)('npx prisma generate --schema=../../fixtures/rbac/schema.prisma')

    expect(fs.readFileSync('../../fixtures/rbac/sea_orm/organization.rs', 'utf-8'))
      .toStrictEqual(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "organizations")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    #[sea_orm(column_type = "String(StringLen::N(200))")]
    pub name: String,
    #[sea_orm(unique)]
    #[sea_orm(column_type = "String(StringLen::N(100))")]
    pub slug: String,
    #[sea_orm(default_value = "ACTIVE")]
    pub status: OrgStatus,
    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::user::Entity")]
    Users,
}

impl Related<super::user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Users.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}`)

    expect(fs.readFileSync('../../fixtures/rbac/sea_orm/user_role.rs', 'utf-8'))
      .toStrictEqual(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "user_roles")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub user_id: i32,
    #[sea_orm(primary_key, auto_increment = false)]
    pub role_id: i32,
    pub assigned_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::user::Entity",
        from = "Column::UserId",
        to = "super::user::Column::Id"
    )]
    User,
    #[sea_orm(
        belongs_to = "super::role::Entity",
        from = "Column::RoleId",
        to = "super::role::Column::Id"
    )]
    Role,
}

impl Related<super::user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::User.def()
    }
}

impl Related<super::role::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Role.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}`)

    expect(fs.readFileSync('../../fixtures/rbac/sea_orm/audit_log.rs', 'utf-8'))
      .toStrictEqual(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "audit_logs")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub user_id: i32,
    #[sea_orm(column_type = "String(StringLen::N(50))")]
    pub action: String,
    #[sea_orm(column_type = "String(StringLen::N(100))")]
    pub resource: String,
    pub detail: Option<String>,
    #[sea_orm(column_type = "String(StringLen::N(45))")]
    pub ip_address: Option<String>,
    pub created_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::user::Entity",
        from = "Column::UserId",
        to = "super::user::Column::Id"
    )]
    User,
}

impl Related<super::user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::User.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}`)

    expect(fs.readFileSync('../../fixtures/rbac/sea_orm/org_status.rs', 'utf-8'))
      .toStrictEqual(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]
#[sea_orm(rs_type = "String", db_type = "String(StringLen::None)")]
pub enum OrgStatus {
    #[sea_orm(string_value = "ACTIVE")]
    Active,
    #[sea_orm(string_value = "INACTIVE")]
    Inactive,
    #[sea_orm(string_value = "SUSPENDED")]
    Suspended,
}
`)
  }, 60000)
})

describe('fixture: no-annotation (M2M implicit)', () => {
  afterAll(() => {
    fs.rmSync('../../fixtures/no-annotation/sea_orm', { recursive: true, force: true })
  })

  it('generates entities with implicit M2M (Post <-> Tag), enum, one-to-one', async () => {
    await promisify(exec)('npx prisma generate --schema=../../fixtures/no-annotation/schema.prisma')

    expect(fs.readFileSync('../../fixtures/no-annotation/sea_orm/user.rs', 'utf-8'))
      .toStrictEqual(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "user")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    #[sea_orm(unique)]
    pub email: String,
    pub name: Option<String>,
    pub age: Option<i32>,
    #[sea_orm(default_value = true)]
    pub is_active: bool,
    #[sea_orm(default_value = "MEMBER")]
    pub role: Role,
    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::post::Entity")]
    Posts,
    #[sea_orm(has_one = "super::profile::Entity")]
    Profile,
}

impl Related<super::post::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Posts.def()
    }
}

impl Related<super::profile::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Profile.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}`)

    expect(fs.readFileSync('../../fixtures/no-annotation/sea_orm/post.rs', 'utf-8'))
      .toStrictEqual(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "post")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub title: String,
    pub content: String,
    #[sea_orm(default_value = false)]
    pub published: bool,
    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
    pub author_id: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::user::Entity",
        from = "Column::AuthorId",
        to = "super::user::Column::Id"
    )]
    Author,
}

impl Related<super::user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Author.def()
    }
}

impl Related<super::tag::Entity> for Entity {
    fn to() -> RelationDef {
        super::post_to_tag::Relation::Tag.def()
    }
    fn via() -> Option<RelationDef> {
        Some(super::post_to_tag::Relation::Post.def().rev())
    }
}

impl ActiveModelBehavior for ActiveModel {}`)

    expect(fs.readFileSync('../../fixtures/no-annotation/sea_orm/tag.rs', 'utf-8'))
      .toStrictEqual(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "tag")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    #[sea_orm(unique)]
    pub name: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl Related<super::post::Entity> for Entity {
    fn to() -> RelationDef {
        super::post_to_tag::Relation::Post.def()
    }
    fn via() -> Option<RelationDef> {
        Some(super::post_to_tag::Relation::Tag.def().rev())
    }
}

impl ActiveModelBehavior for ActiveModel {}`)

    expect(fs.readFileSync('../../fixtures/no-annotation/sea_orm/post_to_tag.rs', 'utf-8'))
      .toStrictEqual(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "_PostToTag")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub post_id: String,
    #[sea_orm(primary_key, auto_increment = false)]
    pub tag_id: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::post::Entity",
        from = "Column::PostId",
        to = "super::post::Column::Id"
    )]
    Post,
    #[sea_orm(
        belongs_to = "super::tag::Entity",
        from = "Column::TagId",
        to = "super::tag::Column::Id"
    )]
    Tag,
}

impl ActiveModelBehavior for ActiveModel {}`)

    expect(fs.readFileSync('../../fixtures/no-annotation/sea_orm/mod.rs', 'utf-8'))
      .toStrictEqual(`pub mod post;
pub mod post_to_tag;
pub mod prelude;
pub mod profile;
pub mod role;
pub mod tag;
pub mod user;
`)
  }, 60000)
})

describe('fixture: jwt-auth-pg', () => {
  afterAll(() => {
    fs.rmSync('../../fixtures/jwt-auth-pg/sea_orm', { recursive: true, force: true })
  })

  it('generates PostgreSQL entities with @db.Uuid, @db.VarChar, @db.Decimal, @db.Timestamptz, @@map', async () => {
    await promisify(exec)('npx prisma generate --schema=../../fixtures/jwt-auth-pg/schema.prisma')

    expect(fs.readFileSync('../../fixtures/jwt-auth-pg/sea_orm/user.rs', 'utf-8'))
      .toStrictEqual(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "users")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    #[sea_orm(column_type = "Uuid")]
    pub id: String,
    #[sea_orm(unique)]
    #[sea_orm(column_type = "String(StringLen::N(255))")]
    pub email: String,
    pub password_hash: Option<String>,
    #[sea_orm(column_type = "String(StringLen::N(100))")]
    pub name: String,
    pub avatar_url: Option<String>,
    #[sea_orm(default_value = "USER")]
    pub role: Role,
    #[sea_orm(column_type = "Decimal(Some((10, 2)))", default_value = 0)]
    pub credit_balance: Decimal,
    #[sea_orm(default_value = false)]
    pub email_verified: bool,
    #[sea_orm(default_value = true)]
    pub is_active: bool,
    #[sea_orm(column_type = "TimestampWithTimeZone")]
    pub created_at: DateTimeUtc,
    #[sea_orm(column_type = "TimestampWithTimeZone")]
    pub updated_at: DateTimeUtc,
    #[sea_orm(column_type = "TimestampWithTimeZone")]
    pub last_login_at: Option<DateTimeUtc>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::oauth_account::Entity")]
    OauthAccounts,
    #[sea_orm(has_many = "super::refresh_token::Entity")]
    RefreshTokens,
    #[sea_orm(has_many = "super::email_verification::Entity")]
    EmailVerifications,
    #[sea_orm(has_many = "super::password_reset::Entity")]
    PasswordResets,
    #[sea_orm(has_one = "super::two_factor_setting::Entity")]
    TwoFactorSetting,
}

impl Related<super::oauth_account::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::OauthAccounts.def()
    }
}

impl Related<super::refresh_token::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::RefreshTokens.def()
    }
}

impl Related<super::email_verification::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::EmailVerifications.def()
    }
}

impl Related<super::password_reset::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::PasswordResets.def()
    }
}

impl Related<super::two_factor_setting::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::TwoFactorSetting.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}`)

    expect(fs.readFileSync('../../fixtures/jwt-auth-pg/sea_orm/oauth_account.rs', 'utf-8'))
      .toStrictEqual(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "oauth_accounts")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    #[sea_orm(column_type = "Uuid")]
    pub id: String,
    #[sea_orm(column_type = "Uuid")]
    pub user_id: String,
    pub provider: OAuthProvider,
    #[sea_orm(column_type = "String(StringLen::N(255))")]
    pub provider_account_id: String,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    #[sea_orm(column_type = "TimestampWithTimeZone")]
    pub expires_at: Option<DateTimeUtc>,
    #[sea_orm(column_type = "TimestampWithTimeZone")]
    pub created_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::user::Entity",
        from = "Column::UserId",
        to = "super::user::Column::Id"
    )]
    User,
}

impl Related<super::user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::User.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}`)

    expect(fs.readFileSync('../../fixtures/jwt-auth-pg/sea_orm/two_factor_setting.rs', 'utf-8'))
      .toStrictEqual(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "two_factor_settings")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    #[sea_orm(column_type = "Uuid")]
    pub id: String,
    #[sea_orm(unique)]
    #[sea_orm(column_type = "Uuid")]
    pub user_id: String,
    #[sea_orm(default_value = false)]
    pub enabled: bool,
    pub method: Option<TwoFactorMethod>,
    pub totp_secret: Option<String>,
    #[sea_orm(column_type = "String(StringLen::N(20))")]
    pub phone_number: Option<String>,
    pub backup_codes: Option<String>,
    #[sea_orm(column_type = "TimestampWithTimeZone")]
    pub verified_at: Option<DateTimeUtc>,
    #[sea_orm(column_type = "TimestampWithTimeZone")]
    pub created_at: DateTimeUtc,
    #[sea_orm(column_type = "TimestampWithTimeZone")]
    pub updated_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::user::Entity",
        from = "Column::UserId",
        to = "super::user::Column::Id"
    )]
    User,
}

impl Related<super::user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::User.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}`)

    expect(fs.readFileSync('../../fixtures/jwt-auth-pg/sea_orm/role.rs', 'utf-8'))
      .toStrictEqual(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]
#[sea_orm(rs_type = "String", db_type = "String(StringLen::None)")]
pub enum Role {
    #[sea_orm(string_value = "ADMIN")]
    Admin,
    #[sea_orm(string_value = "USER")]
    User,
    #[sea_orm(string_value = "GUEST")]
    Guest,
}
`)

    expect(fs.readFileSync('../../fixtures/jwt-auth-pg/sea_orm/mod.rs', 'utf-8'))
      .toStrictEqual(`pub mod email_verification;
pub mod oauth_account;
pub mod oauth_provider;
pub mod password_reset;
pub mod prelude;
pub mod refresh_token;
pub mod role;
pub mod two_factor_method;
pub mod two_factor_setting;
pub mod user;
`)
  }, 60000)
})
