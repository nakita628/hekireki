//! A Prisma `DateTime` on SQLite, where the instant is text and SQLite compares it as text.
//! Prisma writes it in UTC with exactly three decimals (`2030-01-02T03:04:05.000+00:00`);
//! sqlx writes a `DateTimeUtc` with none on a whole second and with nanoseconds below a
//! millisecond, so a filter or a key on it would miss Prisma's rows. Filter with
//! `Column::At.eq(PrismaDateTime(instant))`: a bare `DateTimeUtc` is bound as sqlx writes it.
use sea_orm::entity::prelude::*;
use sea_orm::sea_query::{ArrayType, Nullable, ValueType, ValueTypeErr};
use sea_orm::{ColIdx, TryFromU64, TryGetError, TryGetable};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct PrismaDateTime(pub DateTimeUtc);

impl From<DateTimeUtc> for PrismaDateTime {
    fn from(instant: DateTimeUtc) -> Self {
        Self(instant)
    }
}

impl From<PrismaDateTime> for DateTimeUtc {
    fn from(value: PrismaDateTime) -> Self {
        value.0
    }
}

impl std::str::FromStr for PrismaDateTime {
    type Err = <DateTimeUtc as std::str::FromStr>::Err;

    fn from_str(text: &str) -> Result<Self, Self::Err> {
        text.parse().map(Self)
    }
}

impl std::fmt::Display for PrismaDateTime {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

impl From<PrismaDateTime> for Value {
    fn from(value: PrismaDateTime) -> Self {
        let text = value.0.format("%Y-%m-%dT%H:%M:%S%.3f+00:00").to_string();
        Value::String(Some(Box::new(text)))
    }
}

impl Nullable for PrismaDateTime {
    fn null() -> Value {
        Value::String(None)
    }
}

impl ValueType for PrismaDateTime {
    fn try_from(v: Value) -> Result<Self, ValueTypeErr> {
        match v {
            Value::String(Some(text)) => text.parse().map_err(|_| ValueTypeErr),
            _ => Err(ValueTypeErr),
        }
    }

    fn type_name() -> String {
        "PrismaDateTime".to_owned()
    }

    fn array_type() -> ArrayType {
        ArrayType::String
    }

    fn column_type() -> ColumnType {
        ColumnType::DateTime
    }
}

impl TryGetable for PrismaDateTime {
    fn try_get_by<I: ColIdx>(res: &QueryResult, index: I) -> Result<Self, TryGetError> {
        DateTimeUtc::try_get_by(res, index).map(Self)
    }
}

impl TryFromU64 for PrismaDateTime {
    fn try_from_u64(_: u64) -> Result<Self, DbErr> {
        Err(DbErr::ConvertFromU64("PrismaDateTime"))
    }
}
