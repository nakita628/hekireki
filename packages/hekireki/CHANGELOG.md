# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.8.7] - 2026-06-29

### Fixed

Generated foreign-language code now compiles for several schema shapes that
previously produced invalid or semantically wrong output. **Regenerate if your
schema uses self-relations, scalar lists, reserved-word fields, or `Json`.**

- **GORM**: a self-relation (e.g. an adjacency-list tree) emitted the parent as a
  value type, which Go rejects as an `invalid recursive type`; it is now a
  pointer (`*Model`).
- **GORM / SQLAlchemy / Sea-ORM**: a scalar list (`String[]`) collapsed to a
  scalar (`string` / `str` / `String`), silently dropping the array. It is now a
  proper collection (`[]T` with a JSON serializer / `Mapped[list[T]]` with
  `ARRAY` / `Vec<T>`). Sea-ORM `Vec<T>` columns require the `postgres-array`
  feature on the consumer's `sea-orm` dependency.
- **Sea-ORM**: field names that are Rust keywords (`type`, `match`, `fn`, …)
  produced a syntax error; they are now raw identifiers (`r#type`), with
  `self`/`Self`/`crate`/`super` renamed and the column preserved via
  `column_name`.
- **SQLAlchemy**: field names that are Python keywords (`async`, `yield`, …)
  produced a syntax error; the attribute is renamed (`async_`) with the column
  preserved as the first positional argument to `mapped_column`.
- **SQLAlchemy**: `Json` fields were typed as bare `dict`, which fails
  `mypy --strict`; they are now `dict[str, Any]`.
- **SQLAlchemy**: a self-relation generated a `back_populates` self-loop and
  omitted `remote_side`, failing mapper configuration at runtime; the inverse
  side is now resolved correctly and `remote_side` is emitted.

### Known limitations

- **Ecto**: field names that are Elixir keywords (`end`, `def`, `fn`, `when`) are
  still emitted verbatim. Escaping them is tracked separately.
