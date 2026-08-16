use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[sea_orm(table_name = "film")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub title: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl Related<super::actor::Entity> for Entity {
    fn to() -> RelationDef {
        super::cast::Relation::Actor.def()
    }
    fn via() -> Option<RelationDef> {
        Some(super::cast::Relation::Film.def().rev())
    }
}

impl ActiveModelBehavior for ActiveModel {}