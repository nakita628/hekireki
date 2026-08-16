use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[sea_orm(table_name = "tag")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    #[sea_orm(unique)]
    pub label: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl Related<super::post::Entity> for Entity {
    fn to() -> RelationDef {
        super::post_to_tag::Relation::Post.def()
    }
    fn via() -> Option<RelationDef> {
        Some(super::post_to_tag::Relation::Tag.def().rev())
    }
}

impl ActiveModelBehavior for ActiveModel {}