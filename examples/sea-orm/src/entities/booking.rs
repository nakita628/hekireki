use super::prisma_date_time::PrismaDateTime;
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "bookings")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub room: String,
    #[sea_orm(unique)]
    pub starts_at: PrismaDateTime,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
