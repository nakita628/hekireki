use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[sea_orm(table_name = "actor")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub name: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl Related<super::film::Entity> for Entity {
    fn to() -> RelationDef {
        super::cast::Relation::Film.def()
    }
    fn via() -> Option<RelationDef> {
        Some(super::cast::Relation::Actor.def().rev())
    }
}

impl ActiveModelBehavior for ActiveModel {}