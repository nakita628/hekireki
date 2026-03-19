use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "post")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    pub title: String,
    pub content: String,
    #[sea_orm(default_value = false)]
    pub published: bool,
    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
    pub author_id: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::user::Entity",
        from = "Column::AuthorId",
        to = "super::user::Column::Id"
    )]
    Author,
}

impl Related<super::user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Author.def()
    }
}

impl Related<super::tag::Entity> for Entity {
    fn to() -> RelationDef {
        super::post_to_tag::Relation::Tag.def()
    }
    fn via() -> Option<RelationDef> {
        Some(super::post_to_tag::Relation::Post.def().rev())
    }
}

impl ActiveModelBehavior for ActiveModel {}