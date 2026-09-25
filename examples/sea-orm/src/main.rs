#![deny(warnings)]
use sea_orm_example::entities::*;
use sea_orm::*;

#[tokio::main]
async fn main() -> Result<(), DbErr> {
    let db = Database::connect("sqlite://dev.db").await?;
    let at = chrono::NaiveDate::from_ymd_opt(2030, 1, 1).unwrap().and_hms_milli_opt(9, 0, 0, 0).unwrap();
    let author = author::ActiveModel { email: Set("a@x".into()), created_at: Set(at), updated_at: Set(at), ..Default::default() }.insert(&db).await?;
    let now = chrono::Utc::now().naive_utc();
    let r = post::ActiveModel { author_id: Set(author.id), title: Set("t".into()), published_at: Set(Some(now)), created_at: Set(at), updated_at: Set(at), released_at: Set(at), ..ActiveModelBehavior::new() }.insert(&db).await;
    println!("insert with every date given: {:?}", r.is_ok());
    let r2 = post::ActiveModel { author_id: Set(author.id), title: Set("no dates".into()), ..ActiveModelBehavior::new() }.insert(&db).await;
    println!("insert leaving now()/@updatedAt/literal default to the model: {:?}", r2.err());
    let rows = db.query_all(Statement::from_string(DbBackend::Sqlite, "select title, published_at, released_at, createdAt, updatedAt from posts")).await?;
    for row in rows { println!("{:?} {:?} {:?} {:?} {:?}", row.try_get::<String>("", "title")?, row.try_get::<Option<String>>("", "published_at")?, row.try_get::<String>("", "released_at")?, row.try_get::<String>("", "createdAt")?, row.try_get::<String>("", "updatedAt")?); }
    // A row as Prisma writes it, found by the same instant through a filter.
    db.execute_unprepared("insert into readings (sensor, at, value) values ('p', '2030-01-01T09:00:00.000+00:00', 1)").await?;
    let found = reading::Entity::find().filter(reading::Column::At.eq(at)).one(&db).await?;
    println!("Prisma's row found by Column::At.eq(09:00): {:?}", found.is_some());
    let got = reading::Entity::find().one(&db).await?;
    println!("Prisma's row read back: {:?}", got.map(|m| m.at));
    db.execute_unprepared("insert into readings (sensor, at, value) values ('ms', '1893488400000', 1), ('int', 1893488400000, 1), ('tokyo', '2030-01-01T18:00:00+09:00', 1), ('day', '2030-01-01', 1)").await?;
    for s in ["ms", "int", "tokyo", "day"] {
        println!("{s}: {:?}", reading::Entity::find().filter(reading::Column::Sensor.eq(s)).one(&db).await.map(|m| m.map(|m| m.at)));
    }
    Ok(())
}
