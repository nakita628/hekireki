import type { DMMF } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
import { describe, expect, it } from 'vite-plus/test'

import { PRISMA_DATE_TIME_RS } from '../helper/sea-orm.js'
import { prismaBlocks, viewNames } from '../prisma/schema-text.js'
import { seaOrmFiles } from './sea-orm.js'

/** The datamodel `getDMMF` parsed, or its parse error thrown. */
function datamodelOf(result: ReturnType<typeof getDMMF>) {
  if ('type' in result) throw new Error(result.error.message)
  return result.datamodel
}

function makeField(overrides: Partial<DMMF.Field> & { name: string; type: string }): DMMF.Field {
  return {
    kind: 'scalar',
    isList: false,
    isRequired: true,
    isUnique: false,
    isId: false,
    isReadOnly: false,
    isGenerated: false,
    isUpdatedAt: false,
    hasDefaultValue: false,
    ...overrides,
  }
}

function makeModel(overrides: Partial<DMMF.Model> & { name: string }): DMMF.Model {
  return {
    dbName: null,
    fields: [],
    uniqueFields: [],
    uniqueIndexes: [],
    primaryKey: null,
    isGenerated: false,
    schema: null,
    ...overrides,
  }
}

const enums: DMMF.DatamodelEnum[] = [
  {
    name: 'Role',
    values: [
      { name: 'USER', dbName: null },
      { name: 'ADMIN', dbName: null },
    ],
    dbName: null,
  },
]

const models = [
  makeModel({
    name: 'User',
    documentation: 'A person.',
    fields: [
      makeField({ name: 'id', type: 'Int', isId: true, documentation: 'Primary key.' }),
      makeField({ name: 'name', type: 'String' }),
      makeField({ name: 'role', type: 'Role', kind: 'enum' }),
      makeField({
        name: 'posts',
        type: 'BlogPost',
        kind: 'object',
        isList: true,
        isRequired: false,
        relationName: 'BlogPostToUser',
      }),
    ],
  }),
  makeModel({
    name: 'BlogPost',
    fields: [
      makeField({ name: 'id', type: 'Int', isId: true }),
      makeField({ name: 'title', type: 'String' }),
      makeField({ name: 'authorId', type: 'Int', isReadOnly: true }),
      makeField({
        name: 'author',
        type: 'User',
        kind: 'object',
        relationName: 'BlogPostToUser',
        relationFromFields: ['authorId'],
        relationToFields: ['id'],
      }),
    ],
  }),
]

const bare = [
  makeModel({ name: 'Bare', fields: [makeField({ name: 'id', type: 'Int', isId: true })] }),
]

describe('seaOrmFiles', () => {
  it('writes the enums, the entities, and a prelude and mod.rs that list them in order', () => {
    expect(seaOrmFiles(models, enums, { renameAll: 'camelCase' })).toStrictEqual([
      {
        fileName: 'role.rs',
        code: `use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[sea_orm(rs_type = "String", db_type = "Enum", enum_name = "Role")]
pub enum Role {
    #[sea_orm(string_value = "USER")]
    User,
    #[sea_orm(string_value = "ADMIN")]
    Admin,
}
`,
      },
      {
        fileName: 'user.rs',
        code: `use super::role::Role;
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// A person.
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[sea_orm(table_name = "User")]
pub struct Model {
    /// Primary key.
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: i32,
    pub name: String,
    pub role: Role,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::blog_post::Entity")]
    Posts,
}

impl Related<super::blog_post::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Posts.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
`,
      },
      {
        fileName: 'blog_post.rs',
        code: `use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[sea_orm(table_name = "BlogPost")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: i32,
    pub title: String,
    #[sea_orm(column_name = "authorId")]
    pub author_id: i32,
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

impl ActiveModelBehavior for ActiveModel {}
`,
      },
      {
        fileName: 'prelude.rs',
        code: `pub use super::blog_post::Entity as BlogPost;
pub use super::user::Entity as User;
`,
      },
      {
        fileName: 'mod.rs',
        code: `pub mod blog_post;
pub mod prelude;
pub mod role;
pub mod user;
`,
      },
    ])
  })

  it('drops the serde rename attribute when no casing is asked for', () => {
    expect(seaOrmFiles(bare, [])).toStrictEqual([
      {
        fileName: 'bare.rs',
        code: `use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "Bare")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: i32,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
`,
      },
      {
        fileName: 'prelude.rs',
        code: `pub use super::bare::Entity as Bare;
`,
      },
      {
        fileName: 'mod.rs',
        code: `pub mod bare;
pub mod prelude;
`,
      },
    ])
  })

  it('writes prisma_date_time.rs beside the entities for a DateTime on SQLite', () => {
    const stamped = [
      makeModel({
        name: 'Event',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'at', type: 'DateTime' }),
        ],
      }),
    ]
    const files = seaOrmFiles(stamped, [], {}, 'sqlite')
    expect(files.map((file) => file.fileName)).toStrictEqual([
      'event.rs',
      'prisma_date_time.rs',
      'prelude.rs',
      'mod.rs',
    ])
    expect(files.find((file) => file.fileName === 'prisma_date_time.rs')?.code).toBe(
      PRISMA_DATE_TIME_RS,
    )
    expect(files.at(-1)?.code).toBe(`pub mod event;
pub mod prelude;
pub mod prisma_date_time;
`)
    expect(seaOrmFiles(stamped, [], {}, 'postgresql').map((file) => file.fileName)).toStrictEqual([
      'event.rs',
      'prelude.rs',
      'mod.rs',
    ])
  })

  it('still writes the prelude and mod.rs for a schema without models', () => {
    expect(seaOrmFiles([], [])).toStrictEqual([
      {
        fileName: 'prelude.rs',
        code: `
`,
      },
      {
        fileName: 'mod.rs',
        code: `pub mod prelude;
`,
      },
    ])
  })
})

describe('doc comments', () => {
  it('writes the prose of /// comments as Rust doc comments on the enum, the model and its fields', () => {
    const dmmf = getDMMF({
      datamodel: [
        [
          'schema.prisma',
          `datasource db {
  provider = "postgresql"
}
/// A person.
///
/// Second paragraph */ with \\\\ backslash.
model User {
  /// The key.
  id        Int      @id
  /// @z.string()
  name      String
  /// When they joined.
  /// Two lines.
  createdAt DateTime @default(now())
  /// Their posts.
  posts     Post[]
  tone      Tone
}
model Post {
  id       Int  @id
  /// Who wrote it.
  authorId Int
  /// The author.
  author   User @relation(fields: [authorId], references: [id])
}
/// How loud.
enum Tone {
  CALM
}
`,
        ],
      ],
    })
    const { models: documented, enums: documentedEnums } = datamodelOf(dmmf)
    const files = seaOrmFiles(documented, documentedEnums)
    expect(files.find((file) => file.fileName === 'tone.rs')?.code)
      .toBe(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// How loud.
#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]
#[sea_orm(rs_type = "String", db_type = "Enum", enum_name = "Tone")]
pub enum Tone {
    #[sea_orm(string_value = "CALM")]
    Calm,
}
`)
    expect(files.find((file) => file.fileName === 'user.rs')?.code).toBe(`use super::tone::Tone;
use chrono::SubsecRound;
use sea_orm::entity::prelude::*;
use sea_orm::Set;
use serde::{Deserialize, Serialize};

/// A person.
///
/// Second paragraph */ with \\\\ backslash.
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "User")]
pub struct Model {
    /// The key.
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: i32,
    pub name: String,
    /// When they joined.
    /// Two lines.
    #[sea_orm(column_name = "createdAt")]
    pub created_at: DateTime,
    pub tone: Tone,
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

#[async_trait::async_trait]
impl ActiveModelBehavior for ActiveModel {
    async fn before_save<C>(mut self, _db: &C, insert: bool) -> Result<Self, DbErr>
    where
        C: ConnectionTrait,
    {
        let now = chrono::Utc::now().trunc_subsecs(3);
        if insert && self.created_at.is_not_set() {
            self.created_at = Set(now.naive_utc());
        }
        Ok(self)
    }
}
`)
  })
})

describe('views', () => {
  // Prisma Migrate never creates a view, and SeaORM has no way for an
  // entity to say it is one, so the entity says it itself.
  it('says on the entity of a view that it is not to be created as a table', () => {
    const schema = `datasource db {
  provider = "postgresql"
}

generator client {
  provider        = "prisma-client"
  previewFeatures = ["views"]
}

model User {
  id   Int       @id
  stat UserStat?
}

/// What each user has written.
view UserStat {
  userId Int  @unique
  posts  Int
  user   User @relation(fields: [userId], references: [id])
}
`
    const { models: viewModels, enums: viewEnums } = datamodelOf(
      getDMMF({ datamodel: [['schema.prisma', schema]] }),
    )
    const files = seaOrmFiles(
      viewModels,
      viewEnums,
      {},
      'postgresql',
      viewNames(prismaBlocks(schema)),
    )

    expect(files.find((file) => file.fileName === 'user_stat.rs')?.code)
      .toBe(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// What each user has written.
///
/// A database view: read it, do not write to it, and do not pass it to
/// \`Schema::create_table_from_entity\`, which would create a table of that name.
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "UserStat")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    #[sea_orm(unique)]
    #[sea_orm(column_name = "userId")]
    pub user_id: i32,
    pub posts: i32,
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

impl ActiveModelBehavior for ActiveModel {}
`)
  })
})

describe('a relation to a view', () => {
  // SeaORM 1.1 writes a foreign key for every belongs_to, which the database refuses to make to
  // a view, and a relation has no way to opt out of it.
  it('says on the entity of a model that points at a view that its table is not to be created from it', () => {
    const schema = `datasource db {
  provider = "postgresql"
}

generator client {
  provider        = "prisma-client"
  previewFeatures = ["views"]
}

view UserStat {
  userId Int     @unique
  posts  Int
  badges Badge[]
}

model Badge {
  id     Int      @id
  statId Int
  stat   UserStat @relation(fields: [statId], references: [userId])
}
`
    const { models: viewModels, enums: viewEnums } = datamodelOf(
      getDMMF({ datamodel: [['schema.prisma', schema]] }),
    )
    const files = seaOrmFiles(
      viewModels,
      viewEnums,
      {},
      'postgresql',
      viewNames(prismaBlocks(schema)),
    )

    expect(files.find((file) => file.fileName === 'badge.rs')?.code)
      .toBe(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// It points at the Prisma view \`UserStat\`, which no foreign key can reference.
/// Do not create its table with \`Schema::create_table_from_entity\`, which would write one.
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "Badge")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: i32,
    #[sea_orm(column_name = "statId")]
    pub stat_id: i32,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::user_stat::Entity",
        from = "Column::StatId",
        to = "super::user_stat::Column::UserId"
    )]
    Stat,
}

impl Related<super::user_stat::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Stat.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
`)
  })
})
