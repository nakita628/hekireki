use sea_orm::entity::prelude::*;
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

impl ActiveModelBehavior for ActiveModel {}