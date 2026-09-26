#![deny(warnings)]
// The entities `prisma generate` wrote for the provider the crate is built for: src/entities from
// schema.prisma on SQLite, the ones provider.ts generates under .provider/ on the others.
#[cfg_attr(
    feature = "postgresql",
    path = "../.provider/postgresql/src/entities/mod.rs"
)]
#[cfg_attr(feature = "mysql", path = "../.provider/mysql/src/entities/mod.rs")]
pub mod entities;
