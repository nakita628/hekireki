use sea_orm::entity::prelude::*;
use sea_orm::Set;
use serde::{Deserialize, Serialize};
use super::oauth_provider::OAuthProvider;

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

impl ActiveModelBehavior for ActiveModel {
    fn new() -> Self {
        Self {
            id: Set(uuid::Uuid::new_v4().to_string()),
            ..ActiveModelTrait::default()
        }
    }
}