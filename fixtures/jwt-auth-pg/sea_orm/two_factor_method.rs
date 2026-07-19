use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]
#[sea_orm(rs_type = "String", db_type = "Enum", enum_name = "TwoFactorMethod")]
pub enum TwoFactorMethod {
    #[sea_orm(string_value = "TOTP")]
    Totp,
    #[sea_orm(string_value = "SMS")]
    Sms,
    #[sea_orm(string_value = "EMAIL")]
    Email,
}
