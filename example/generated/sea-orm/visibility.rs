use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// Enum with @map on every value and @@map on the enum itself:
/// the database stores the mapped values ("link_only"), while
/// generators receive the Prisma-level names ("LINK_ONLY").
#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[sea_orm(rs_type = "String", db_type = "Enum", enum_name = "visibility_level")]
pub enum Visibility {
    #[sea_orm(string_value = "public")]
    Public,
    #[sea_orm(string_value = "private")]
    Private,
    #[sea_orm(string_value = "link_only")]
    LinkOnly,
}
