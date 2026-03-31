use sea_orm::entity::prelude::*;
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

impl ActiveModelBehavior for ActiveModel {}