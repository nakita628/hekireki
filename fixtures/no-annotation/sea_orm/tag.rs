use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "tag")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    #[sea_orm(unique)]
    pub name: String,
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