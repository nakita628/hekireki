// The entities of the same schema on SQLite and on MySQL, which test/lang/setup.ts writes into
// sqlite/ and mysql/: `cargo check` builds them beside src/entities, the PostgreSQL ones.
pub mod mysql;
pub mod sqlite;
