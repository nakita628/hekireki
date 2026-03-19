use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]
#[sea_orm(rs_type = "String", db_type = "String(StringLen::None)")]
pub enum Role {
    #[sea_orm(string_value = "ADMIN")]
    Admin,
    #[sea_orm(string_value = "MEMBER")]
    Member,
    #[sea_orm(string_value = "GUEST")]
    Guest,
}
