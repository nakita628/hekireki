use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]
#[sea_orm(rs_type = "String", db_type = "String(StringLen::None)")]
pub enum OrgStatus {
    #[sea_orm(string_value = "ACTIVE")]
    Active,
    #[sea_orm(string_value = "INACTIVE")]
    Inactive,
    #[sea_orm(string_value = "SUSPENDED")]
    Suspended,
}
