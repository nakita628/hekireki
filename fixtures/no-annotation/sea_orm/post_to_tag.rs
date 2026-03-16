use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "_PostToTag")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub post_id: String,
    #[sea_orm(primary_key, auto_increment = false)]
    pub tag_id: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::post::Entity",
        from = "Column::PostId",
        to = "super::post::Column::Id"
    )]
    Post,
    #[sea_orm(
        belongs_to = "super::tag::Entity",
        from = "Column::TagId",
        to = "super::tag::Column::Id"
    )]
    Tag,
}

impl ActiveModelBehavior for ActiveModel {}