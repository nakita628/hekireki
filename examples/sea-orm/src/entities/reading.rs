use super::prisma_date_time::PrismaDateTime;
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

/// A DateTime in a composite primary key: a row is found by the instant it names.
#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "readings")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub sensor: String,
    #[sea_orm(primary_key, auto_increment = false)]
    pub at: PrismaDateTime,
    pub value: f64,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
