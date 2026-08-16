"""Pins semantic invariants in the type system so mypy --strict catches a
regression that would otherwise type-check: a scalar list must stay list[str]
(not collapse to str), a JSON column must stay dict[str, Any] (not bare dict),
and a `?` scalar must stay Optional.

Run as a script it also exercises the mapper at runtime — import, mapper
configuration, PostgreSQL DDL compilation, and real INSERTs on SQLite — the
half mypy cannot see (a bare Mapped[dict[str, Any]] only fails when the mapper
resolves it; a missing @updatedAt insert default only fails on INSERT)."""

from typing import Any, Optional

from sqlalchemy import ARRAY, Table, create_engine
from sqlalchemy.sql.elements import TextClause
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session, configure_mappers
from sqlalchemy.schema import CreateIndex, CreateTable

from models import Account, Base, Board, Category, Profile, Torture


def _smoke(a: Account, p: Profile, b: Board) -> None:
    tags: list[str] = a.tags
    data: dict[str, Any] = a.data
    bio: Optional[str] = p.bio
    age: Optional[int] = p.age
    parent: Optional[Category] = Category().parent
    visibility: str = b.visibility
    audiences: list[str] = b.audiences
    _ = (tags, data, bio, age, parent, visibility, audiences)


def _runtime_smoke() -> None:
    configure_mappers()

    pg_dialect = postgresql.dialect()  # type: ignore[no-untyped-call]
    for table in Base.metadata.sorted_tables:
        str(CreateTable(table).compile(dialect=pg_dialect))
        for index in table.indexes:
            str(CreateIndex(index).compile(dialect=pg_dialect))

    # ARRAY and raw-DDL server defaults (dbgenerated: gen_random_uuid(),
    # interval arithmetic) are PostgreSQL-only; every other table runs against
    # in-memory SQLite so INSERTs exercise the client-side defaults
    # (@updatedAt, uuid, ulid).
    engine = create_engine("sqlite://")

    def _sqlite_compatible(t: Table) -> bool:
        if any(isinstance(c.type, ARRAY) for c in t.columns):
            return False
        return not any(
            c.server_default is not None
            and isinstance(getattr(c.server_default, "arg", None), TextClause)
            for c in t.columns
        )

    sqlite_tables = [t for t in Base.metadata.sorted_tables if _sqlite_compatible(t)]
    Base.metadata.create_all(engine, tables=sqlite_tables)
    with Session(engine) as session:
        session.add(Profile(id="p1", account_id="a1", meta={"k": "v"}))
        session.add(Category(name="root"))
        # Literal-default torture: the client-side defaults must round-trip
        # byte-exact (escaping) and type-exact (BigInt as int, Json as dict).
        torture = Torture()
        session.add(torture)
        session.commit()
        assert session.get(Profile, "p1") is not None
        assert torture.quoted == 'it\'s a "quote" and a \\ backslash'
        assert torture.unicode == "日本語と🔥絵文字"
        assert torture.big_pos == 9007199254740993
        assert torture.json_obj == {"a": 1, "b": [True, None, "x"]}

    # Board carries an ARRAY column, so its enum-default mapping is asserted
    # at the column level instead of via a SQLite INSERT.
    visibility_default = Board.__table__.c.visibility.default
    assert visibility_default is not None and visibility_default.arg == "link_only"

    print("ok: sqlalchemy runtime smoke (mappers, pg ddl, sqlite insert)")


if __name__ == "__main__":
    _runtime_smoke()
