import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import { seaOrmFiles } from './sea-orm.js'

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
  it('writes the enums, the entities, the prelude and a mod.rs that lists them in order', () => {
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
        code: `use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};
use super::role::Role;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[sea_orm(table_name = "user")]
pub struct Model {
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

impl ActiveModelBehavior for ActiveModel {}`,
      },
      {
        fileName: 'blog_post.rs',
        code: `use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[sea_orm(table_name = "blog_post")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: i32,
    pub title: String,
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

impl ActiveModelBehavior for ActiveModel {}`,
      },
      {
        fileName: 'prelude.rs',
        code: `pub use super::user::Entity as User;
pub use super::blog_post::Entity as BlogPost;
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
#[sea_orm(table_name = "bare")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: i32,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}`,
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
