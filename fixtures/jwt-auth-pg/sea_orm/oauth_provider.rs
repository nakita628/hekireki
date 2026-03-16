use sea_orm::entity::prelude::*;

#[derive(Debug, Clone, PartialEq, EnumIter, DeriveActiveEnum)]
#[sea_orm(rs_type = "String", db_type = "String(StringLen::None)")]
pub enum OAuthProvider {
    #[sea_orm(string_value = "GOOGLE")]
    Google,
    #[sea_orm(string_value = "GITHUB")]
    Github,
    #[sea_orm(string_value = "FACEBOOK")]
    Facebook,
    #[sea_orm(string_value = "TWITTER")]
    Twitter,
    #[sea_orm(string_value = "APPLE")]
    Apple,
}
