"""Pins semantic invariants in the type system so mypy --strict catches a
regression that would otherwise type-check: a scalar list must stay list[str]
(not collapse to str), a JSON column must stay dict[str, Any] (not bare dict),
and a `?` scalar must stay Optional.

Run as a script it also exercises the mapper at runtime — import, mapper
configuration, PostgreSQL DDL compilation, and real INSERTs on SQLite — the
half mypy cannot see (a bare Mapped[dict[str, Any]] only fails when the mapper
resolves it; a missing @updatedAt insert default only fails on INSERT)."""

from typing import Any, Optional

from sqlalchemy import ARRAY, create_engine
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session, configure_mappers
from sqlalchemy.schema import CreateIndex, CreateTable

from models import Account, Base, Category, Profile


def _smoke(a: Account, p: Profile) -> None:
    tags: list[str] = a.tags
    data: dict[str, Any] = a.data
    bio: Optional[str] = p.bio
    age: Optional[int] = p.age
    parent: Optional[Category] = Category().parent
    _ = (tags, data, bio, age, parent)


def _runtime_smoke() -> None:
    configure_mappers()

    pg_dialect = postgresql.dialect()  # type: ignore[no-untyped-call]
    for table in Base.metadata.sorted_tables:
        str(CreateTable(table).compile(dialect=pg_dialect))
        for index in table.indexes:
            str(CreateIndex(index).compile(dialect=pg_dialect))

    # ARRAY is PostgreSQL-only; every other table runs against in-memory SQLite
    # so INSERTs exercise the client-side defaults (@updatedAt, uuid, ulid).
    engine = create_engine("sqlite://")
    sqlite_tables = [
        t
        for t in Base.metadata.sorted_tables
        if not any(isinstance(c.type, ARRAY) for c in t.columns)
    ]
    Base.metadata.create_all(engine, tables=sqlite_tables)
    with Session(engine) as session:
        session.add(Profile(id="p1", account_id="a1", meta={"k": "v"}))
        session.add(Category(name="root"))
        session.commit()
        assert session.get(Profile, "p1") is not None

    print("ok: sqlalchemy runtime smoke (mappers, pg ddl, sqlite insert)")


if __name__ == "__main__":
    _runtime_smoke()
