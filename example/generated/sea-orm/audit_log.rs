use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// DB-side generated defaults (dbgenerated) plus Json / Bytes payloads.
#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[sea_orm(table_name = "audit_logs")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    #[sea_orm(column_type = "Text")]
    pub action: String,
    #[sea_orm(column_type = "JsonBinary", default_value = "{}")]
    pub payload: Json,
    pub signature: Option<Vec<u8>>,
    #[sea_orm(column_type = "custom(\"timestamp(3)\")")]
    pub logged_at: DateTime,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
