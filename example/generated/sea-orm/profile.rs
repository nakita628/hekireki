use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[sea_orm(table_name = "profile")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    #[sea_orm(unique)]
    pub user_id: String,
    #[sea_orm(column_type = "Text")]
    pub bio: Option<String>,
    #[sea_orm(column_type = "String(StringLen::N(64))", default_value = "anonymous")]
    pub nickname: String,
    #[sea_orm(column_type = "SmallInteger")]
    pub age: Option<i32>,
    #[sea_orm(column_type = "Decimal(Some((10, 2)))", default_value = 0)]
    pub balance: Decimal,
    #[sea_orm(default_value = false)]
    pub verified: bool,
    pub meta: Option<Json>,
    pub avatar: Option<Vec<u8>>,
    #[sea_orm(column_type = "TimestampWithTimeZone")]
    pub last_seen: Option<DateTimeWithTimeZone>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::user::Entity",
        from = "Column::UserId",
        to = "super::user::Column::Id",
        on_delete = "Cascade"
    )]
    User,
}

impl Related<super::user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::User.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}