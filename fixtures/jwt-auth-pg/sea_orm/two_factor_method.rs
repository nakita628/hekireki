use sea_orm::entity::prelude::*;

#[derive(Debug, Clone, PartialEq, EnumIter, DeriveActiveEnum)]
#[sea_orm(rs_type = "String", db_type = "String(StringLen::None)")]
pub enum TwoFactorMethod {
    #[sea_orm(string_value = "TOTP")]
    Totp,
    #[sea_orm(string_value = "SMS")]
    Sms,
    #[sea_orm(string_value = "EMAIL")]
    Email,
}
