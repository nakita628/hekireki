use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]
#[sea_orm(rs_type = "String", db_type = "String(StringLen::None)")]
pub enum TwoFactorMethod {
    #[sea_orm(string_value = "TOTP")]
    Totp,
    #[sea_orm(string_value = "SMS")]
    Sms,
    #[sea_orm(string_value = "EMAIL")]
    Email,
}
