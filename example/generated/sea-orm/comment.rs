use chrono::SubsecRound;
use sea_orm::entity::prelude::*;
use sea_orm::Set;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[sea_orm(table_name = "comments")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub body: String,
    pub post_id: String,
    pub author_id: Option<String>,
    pub created_at: DateTime,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::post::Entity",
        from = "Column::PostId",
        to = "super::post::Column::Id",
        on_delete = "Cascade"
    )]
    Post,
    #[sea_orm(
        belongs_to = "super::user::Entity",
        from = "Column::AuthorId",
        to = "super::user::Column::Id",
        on_delete = "SetNull"
    )]
    Author,
}

impl Related<super::post::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Post.def()
    }
}

impl Related<super::user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Author.def()
    }
}

#[async_trait::async_trait]
impl ActiveModelBehavior for ActiveModel {
    async fn before_save<C>(mut self, _db: &C, insert: bool) -> Result<Self, DbErr>
    where
        C: ConnectionTrait,
    {
        let now = chrono::Utc::now().trunc_subsecs(3);
        if insert && self.created_at.is_not_set() {
            self.created_at = Set(now.naive_utc());
        }
        Ok(self)
    }
}
