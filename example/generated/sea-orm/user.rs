use sea_orm::entity::prelude::*;
use sea_orm::Set;
use serde::{Deserialize, Serialize};
use super::role::Role;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[sea_orm(table_name = "users")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    #[sea_orm(unique)]
    pub email: String,
    pub name: String,
    #[sea_orm(default_value = "VIEWER")]
    pub role: Role,
    pub interests: Vec<String>,
    pub created_at: DateTime,
    pub updated_at: DateTime,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::post::Entity")]
    Posts,
    #[sea_orm(has_many = "super::comment::Entity")]
    Comments,
    #[sea_orm(has_many = "super::order::Entity")]
    Orders,
    #[sea_orm(
        has_many = "super::follow::Entity",
        from = "Column::Id",
        to = "super::follow::Column::FollowingId"
    )]
    Followers,
    #[sea_orm(
        has_many = "super::follow::Entity",
        from = "Column::Id",
        to = "super::follow::Column::FollowerId"
    )]
    Following,
    #[sea_orm(has_one = "super::profile::Entity")]
    Profile,
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

impl Related<super::order::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Orders.def()
    }
}

impl Related<super::follow::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Followers.def()
    }
}

impl Related<super::profile::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Profile.def()
    }
}

impl ActiveModelBehavior for ActiveModel {
    fn new() -> Self {
        Self {
            id: Set(uuid::Uuid::now_v7().to_string()),
            ..ActiveModelTrait::default()
        }
    }
}