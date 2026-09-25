//! The check, through the generated entities: `cargo run -- check` writes rows and reads them
//! back with SeaORM alone, `cargo run -- interop` reads the rows interop.ts wrote with Prisma
//! Client. Each check prints `ok: <name>`, or stops the run with what it saw. The database is
//! dev.db, or the one SEA_ORM_DATABASE names; the entities are those of the feature the crate is
//! built with (src/lib.rs).
#![deny(warnings)]
use std::fmt::Debug;

use chrono::{Duration, SubsecRound, TimeZone, Utc};
use sea_orm::entity::prelude::*;
use sea_orm::{
    ActiveValue, Database, DatabaseConnection, IntoActiveModel, Iterable, QueryOrder, Set,
};
use sea_orm_example::entities::{author, booking, clock, post, reading, setting};

// How a plain DateTime is held: on SQLite the PrismaDateTime written beside the entities, which
// binds the text Prisma writes; elsewhere chrono's NaiveDateTime, in UTC as Prisma reads it.
#[cfg(not(any(feature = "postgresql", feature = "mysql")))]
use sea_orm_example::entities::prisma_date_time::PrismaDateTime as Stamp;
#[cfg(not(any(feature = "postgresql", feature = "mysql")))]
fn stamp(instant: DateTimeUtc) -> Stamp {
    Stamp(instant)
}
#[cfg(not(any(feature = "postgresql", feature = "mysql")))]
fn instant(value: Stamp) -> DateTimeUtc {
    value.0
}

#[cfg(any(feature = "postgresql", feature = "mysql"))]
type Stamp = DateTime;
#[cfg(any(feature = "postgresql", feature = "mysql"))]
fn stamp(instant: DateTimeUtc) -> Stamp {
    instant.naive_utc()
}
#[cfg(any(feature = "postgresql", feature = "mysql"))]
fn instant(value: Stamp) -> DateTimeUtc {
    value.and_utc()
}

/// 2030-01-02T03:04:05.678Z, the instant interop.ts writes and expects.
fn at() -> DateTimeUtc {
    Utc.with_ymd_and_hms(2030, 1, 2, 3, 4, 5).unwrap() + Duration::milliseconds(678)
}

/// The same instant without its milliseconds: Prisma writes `.000`, sqlx on its own none.
fn whole() -> DateTimeUtc {
    Utc.with_ymd_and_hms(2030, 1, 2, 3, 4, 5).unwrap()
}

fn ensure(name: &str, ok: bool, saw: impl Debug) {
    if !ok {
        eprintln!("FAIL: {name}: {saw:?}");
        std::process::exit(1);
    }
    println!("ok: {name}");
}

/// Every native type Clock has, written from `at()` with an offset of +09:00 where the column
/// keeps one, so that a zone taken for UTC would show.
#[cfg(not(any(feature = "postgresql", feature = "mysql")))]
fn clock_row(label: &str) -> clock::ActiveModel {
    clock::ActiveModel {
        label: Set(label.into()),
        at: Set(Some(stamp(at()))),
        precise: Set(Some(stamp(at()))),
        seconds: Set(Some(stamp(whole()))),
        zoned: Set(Some(stamp(at()))),
        day: Set(Some(stamp(at()))),
        time: Set(Some(stamp(at()))),
        ..Default::default()
    }
}

#[cfg(feature = "postgresql")]
fn clock_row(label: &str) -> clock::ActiveModel {
    let tokyo = chrono::FixedOffset::east_opt(9 * 3600).unwrap();
    clock::ActiveModel {
        label: Set(label.into()),
        at: Set(Some(stamp(at()))),
        precise: Set(Some(stamp(at() + Duration::microseconds(901)))),
        seconds: Set(Some(stamp(whole()))),
        zoned: Set(Some(at().with_timezone(&tokyo))),
        day: Set(Some(at().date_naive())),
        time: Set(Some(at().time())),
        moments: Set(vec![stamp(at()), stamp(at() + Duration::days(1))]),
        ..Default::default()
    }
}

#[cfg(feature = "mysql")]
fn clock_row(label: &str) -> clock::ActiveModel {
    clock::ActiveModel {
        label: Set(label.into()),
        at: Set(Some(stamp(at()))),
        precise: Set(Some(stamp(at() + Duration::microseconds(901)))),
        seconds: Set(Some(stamp(whole()))),
        zoned: Set(Some(at())),
        day: Set(Some(at().date_naive())),
        time: Set(Some(at().time())),
        ..Default::default()
    }
}

/// The columns of `row` that differ from `want`, leaving out the ones `skip` names.
fn clock_differences(
    row: &clock::Model,
    want: &clock::ActiveModel,
    skip: &[&str],
) -> Vec<(String, Value, Value)> {
    clock::Column::iter()
        .filter(|col| !skip.contains(&col.as_str()))
        .filter_map(|col| {
            let wanted = match want.get(col) {
                ActiveValue::Set(value) | ActiveValue::Unchanged(value) => value,
                ActiveValue::NotSet => return None,
            };
            let got = row.get(col);
            (got != wanted).then(|| (col.as_str().to_owned(), wanted, got))
        })
        .collect()
}

async fn check(db: &DatabaseConnection) -> Result<(), DbErr> {
    reading::Entity::delete_many().exec(db).await?;
    booking::Entity::delete_many().exec(db).await?;
    clock::Entity::delete_many().exec(db).await?;
    setting::Entity::delete_many().exec(db).await?;
    post::Entity::delete_many().exec(db).await?;
    author::Entity::delete_many().exec(db).await?;

    let before = Utc::now().trunc_subsecs(3);
    let author = author::ActiveModel {
        email: Set("sea-orm@example.com".into()),
        ..Default::default()
    }
    .insert(db)
    .await?;
    let created = instant(author.created_at);
    ensure(
        "now() and @updatedAt are filled on insert, in UTC with milliseconds",
        author.updated_at == author.created_at
            && created >= before
            && created <= Utc::now()
            && created.timestamp_subsec_nanos().is_multiple_of(1_000_000),
        (author.created_at, author.updated_at),
    );

    let post = |title: &str, published: Option<DateTimeUtc>| post::ActiveModel {
        author_id: Set(author.id),
        title: Set(title.into()),
        published_at: Set(published.map(stamp)),
        ..post::ActiveModel::new()
    };
    let sooner = post("sooner", Some(at())).insert(db).await?;
    post("later", Some(at() + Duration::hours(1)))
        .insert(db)
        .await?;
    post("unpublished", None).insert(db).await?;
    let released = Utc.with_ymd_and_hms(2020, 1, 1, 0, 0, 0).unwrap();
    ensure(
        "a uuid() key and the literal default are filled on insert",
        sooner.id.len() == 36 && sooner.released_at == stamp(released),
        (&sooner.id, sooner.released_at),
    );

    tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    let mut change = sooner.clone().into_active_model();
    change.title = Set("sooner!".into());
    let changed = change.update(db).await?;
    ensure(
        "an update bumps @updatedAt and keeps now()",
        changed.updated_at > sooner.updated_at && changed.created_at == sooner.created_at,
        (sooner.updated_at, changed.updated_at),
    );

    let theme = setting::ActiveModel {
        key: Set("theme".into()),
        value: Set("dark".into()),
        ..Default::default()
    }
    .insert(db)
    .await?;
    ensure(
        "every @updatedAt is filled on insert, the optional one too",
        theme.synced_at == theme.updated_at && theme.checked_at == Some(theme.updated_at),
        (theme.updated_at, theme.synced_at, theme.checked_at),
    );
    tokio::time::sleep(std::time::Duration::from_millis(20)).await;
    let mut change = theme.clone().into_active_model();
    change.value = Set("light".into());
    let changed = change.update(db).await?;
    ensure(
        "an update bumps every @updatedAt",
        changed.updated_at > theme.updated_at
            && changed.synced_at == changed.updated_at
            && changed.checked_at == Some(changed.updated_at),
        (changed.updated_at, changed.synced_at, changed.checked_at),
    );

    for (sensor, instant) in [("sea-orm", at()), ("sea-orm", whole())] {
        reading::ActiveModel {
            sensor: Set(sensor.into()),
            at: Set(stamp(instant)),
            value: Set(1.5),
        }
        .insert(db)
        .await?;
    }
    let by_ms = reading::Entity::find_by_id(("sea-orm".to_owned(), stamp(at())))
        .one(db)
        .await?;
    let by_second = reading::Entity::find_by_id(("sea-orm".to_owned(), stamp(whole())))
        .one(db)
        .await?;
    ensure(
        "a row is found by the DateTime in its @@id, to the millisecond and to the second",
        by_ms.is_some() && by_second.is_some(),
        (by_ms, by_second),
    );

    booking::ActiveModel {
        room: Set("a".into()),
        starts_at: Set(stamp(whole())),
        ..Default::default()
    }
    .insert(db)
    .await?;
    let found = booking::Entity::find()
        .filter(booking::Column::StartsAt.eq(stamp(whole())))
        .one(db)
        .await?;
    ensure(
        "a @unique DateTime is found by a whole second",
        found.as_ref().is_some_and(|b| b.room == "a"),
        found,
    );

    let titles = |rows: Vec<post::Model>| rows.into_iter().map(|p| p.title).collect::<Vec<_>>();
    let published = post::Entity::find()
        .filter(post::Column::PublishedAt.is_not_null())
        .order_by_asc(post::Column::PublishedAt)
        .all(db)
        .await?;
    let exact = post::Entity::find()
        .filter(post::Column::PublishedAt.eq(stamp(at())))
        .all(db)
        .await?;
    let (published, exact) = (titles(published), titles(exact));
    ensure(
        "an optional DateTime sorts in time order and is found by its instant",
        published == ["sooner!", "later"] && exact == ["sooner!"],
        (published, exact),
    );

    let want = clock_row("sea-orm");
    let written = want.clone().insert(db).await?;
    let read = clock::Entity::find_by_id(written.id)
        .one(db)
        .await?
        .unwrap();
    let age = Utc::now() - instant_of_created(&read);
    ensure(
        "every native type reads back as it was written",
        clock_differences(&read, &want, &["id"]).is_empty()
            && age >= Duration::zero()
            && age < Duration::seconds(60),
        (clock_differences(&read, &want, &["id"]), read.created_at),
    );
    Ok(())
}

// Clock's createdAt is a Timestamptz on PostgreSQL and a TIMESTAMP on MySQL.
#[cfg(not(any(feature = "postgresql", feature = "mysql")))]
fn instant_of_created(row: &clock::Model) -> DateTimeUtc {
    instant(row.created_at)
}
#[cfg(feature = "postgresql")]
fn instant_of_created(row: &clock::Model) -> DateTimeUtc {
    row.created_at.to_utc()
}
#[cfg(feature = "mysql")]
fn instant_of_created(row: &clock::Model) -> DateTimeUtc {
    row.created_at
}

async fn interop(db: &DatabaseConnection) -> Result<(), DbErr> {
    let author = author::Entity::find()
        .filter(author::Column::Email.eq("prisma@example.com"))
        .one(db)
        .await?
        .unwrap();
    let age = Utc::now() - instant(author.created_at);
    ensure(
        "Prisma's now() and @updatedAt read as the instant it wrote",
        author.updated_at == author.created_at
            && age >= Duration::zero()
            && age < Duration::seconds(60),
        (author.created_at, age),
    );

    let by_prisma = post::Entity::find()
        .filter(post::Column::Title.eq("by prisma"))
        .one(db)
        .await?
        .unwrap();
    ensure(
        "Prisma's DateTime and literal default read as the instants it wrote",
        by_prisma.published_at == Some(stamp(at()))
            && by_prisma.released_at == stamp(Utc.with_ymd_and_hms(2020, 1, 1, 0, 0, 0).unwrap()),
        (by_prisma.published_at, by_prisma.released_at),
    );
    let published = post::Entity::find()
        .filter(post::Column::PublishedAt.is_not_null())
        .order_by_asc(post::Column::PublishedAt)
        .order_by_asc(post::Column::Title)
        .all(db)
        .await?;
    let exact = post::Entity::find()
        .filter(post::Column::PublishedAt.eq(stamp(at())))
        .order_by_asc(post::Column::Title)
        .all(db)
        .await?;
    let published: Vec<_> = published.into_iter().map(|p| p.title).collect();
    let exact: Vec<_> = exact.into_iter().map(|p| p.title).collect();
    ensure(
        "the rows of both sort in time order and are found by one instant",
        published == ["earliest", "by prisma", "sooner!", "later"]
            && exact == ["by prisma", "sooner!"],
        (published, exact),
    );

    let theme = setting::Entity::find_by_id("prisma")
        .one(db)
        .await?
        .unwrap();
    ensure(
        "Prisma's @updatedAt, the optional one too",
        theme.synced_at == theme.updated_at && theme.checked_at == Some(theme.updated_at),
        (theme.updated_at, theme.synced_at, theme.checked_at),
    );

    let by_ms = reading::Entity::find_by_id(("prisma".to_owned(), stamp(at())))
        .one(db)
        .await?;
    let by_second = reading::Entity::find_by_id(("prisma".to_owned(), stamp(whole())))
        .one(db)
        .await?;
    ensure(
        "Prisma's rows are found by the DateTime in their @@id",
        by_ms.is_some() && by_second.is_some(),
        (by_ms, by_second),
    );
    let later = whole() + Duration::hours(1);
    let found = booking::Entity::find()
        .filter(booking::Column::StartsAt.eq(stamp(later)))
        .one(db)
        .await?;
    ensure(
        "Prisma's @unique DateTime is found by a whole second",
        found.as_ref().is_some_and(|b| b.room == "b"),
        found,
    );

    // Prisma writes milliseconds; the microseconds of SeaORM's `precise` are its own.
    let prisma = clock::Entity::find()
        .filter(clock::Column::Label.eq("prisma"))
        .one(db)
        .await?
        .unwrap();
    let ours = clock::Entity::find()
        .filter(clock::Column::Label.eq("sea-orm"))
        .one(db)
        .await?
        .unwrap();
    let mut want = ours.into_active_model();
    want.precise = Set(Some(stamp(at())));
    let skip = ["id", "label", "created_at"];
    let differences = clock_differences(&prisma, &want, &skip);
    ensure(
        "Prisma's native types read as SeaORM's own",
        differences.is_empty(),
        differences,
    );
    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), DbErr> {
    let url = std::env::var("SEA_ORM_DATABASE").unwrap_or_else(|_| "sqlite://dev.db".into());
    let db = Database::connect(url).await?;
    match std::env::args().nth(1).as_deref() {
        Some("check") => check(&db).await,
        Some("interop") => interop(&db).await,
        _ => {
            eprintln!("usage: cargo run -- check|interop");
            std::process::exit(2);
        }
    }
}
