use chrono::SubsecRound;
use sea_orm::entity::prelude::*;
use sea_orm::Set;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[sea_orm(table_name = "orders")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i64,
    pub user_id: String,
    #[sea_orm(column_type = "Decimal(Some((12, 2)))")]
    pub total: Decimal,
    pub placed_at: DateTime,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::user::Entity",
        from = "Column::UserId",
        to = "super::user::Column::Id"
    )]
    User,
    #[sea_orm(has_many = "super::order_item::Entity")]
    Items,
}

impl Related<super::user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::User.def()
    }
}

impl Related<super::order_item::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Items.def()
    }
}

#[async_trait::async_trait]
impl ActiveModelBehavior for ActiveModel {
    async fn before_save<C>(mut self, _db: &C, insert: bool) -> Result<Self, DbErr>
    where
        C: ConnectionTrait,
    {
        let now = chrono::Utc::now().trunc_subsecs(3);
        if insert && self.placed_at.is_not_set() {
            self.placed_at = Set(now.naive_utc());
        }
        Ok(self)
    }
}
