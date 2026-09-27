use super::prisma_date_time::PrismaDateTime;
use chrono::SubsecRound;
use sea_orm::entity::prelude::*;
use sea_orm::Set;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "clocks")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    #[sea_orm(unique)]
    pub label: String,
    pub at: Option<PrismaDateTime>,
    pub precise: Option<PrismaDateTime>,
    pub seconds: Option<PrismaDateTime>,
    pub zoned: Option<PrismaDateTime>,
    pub day: Option<PrismaDateTime>,
    pub time: Option<PrismaDateTime>,
    pub created_at: PrismaDateTime,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

#[async_trait::async_trait]
impl ActiveModelBehavior for ActiveModel {
    async fn before_save<C>(mut self, _db: &C, insert: bool) -> Result<Self, DbErr>
    where
        C: ConnectionTrait,
    {
        let now = chrono::Utc::now().trunc_subsecs(3);
        if insert && self.created_at.is_not_set() {
            self.created_at = Set(now.into());
        }
        Ok(self)
    }
}
