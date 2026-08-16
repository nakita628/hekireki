use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[sea_orm(table_name = "follows")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub follower_id: String,
    #[sea_orm(primary_key, auto_increment = false)]
    pub following_id: String,
    pub since: DateTime,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::user::Entity",
        from = "Column::FollowerId",
        to = "super::user::Column::Id",
        on_delete = "Cascade"
    )]
    Follower,
    #[sea_orm(
        belongs_to = "super::user::Entity",
        from = "Column::FollowingId",
        to = "super::user::Column::Id",
        on_delete = "Cascade"
    )]
    Following,
}

impl Related<super::user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Follower.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}