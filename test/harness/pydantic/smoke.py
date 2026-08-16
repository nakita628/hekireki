"""Pins semantic invariants in the type system so mypy --strict catches a
regression that would otherwise type-check: a scalar list must stay list[str]
(not collapse to str), a Json column must stay JsonValue, an enum must stay a
Literal of its Prisma-level value names, and a `?` scalar must stay `| None`.

Run as a script it also exercises validation at runtime — the half mypy cannot
see: lax coercion (str → datetime/Decimal/UUID), @p.strictObject rejecting
unknown keys (extra="forbid"), @p.looseObject keeping them (extra="allow"),
the extra="ignore" default dropping them, Python-keyword columns validating
under their real names via Field(alias=...), and optional None defaults."""

from datetime import date, datetime, time, timezone
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import JsonValue, ValidationError

from models import Account, Board, Keyword, Locked, NativeGrid, Open, Profile, Tag


def _smoke(a: Account, p: Profile, b: Board, g: NativeGrid) -> None:
    tags: list[str] = a.tags
    data: JsonValue = a.data
    status: Literal["ACTIVE", "INACTIVE", "PENDING_REVIEW"] = a.status
    bio: str | None = p.bio
    age: int | None = p.age
    audiences: list[Literal["PUBLIC", "PRIVATE", "LINK_ONLY"]] = b.audiences
    ident: UUID = g.id
    day: date = g.day
    clock: time = g.clock
    _ = (tags, data, status, bio, age, audiences, ident, day, clock)


def _runtime_smoke() -> None:
    # The typed constructor validates every scalar shape; lax str → datetime
    # coercion is exercised through model_validate (whose input is Any) below.
    account = Account(
        id="a1",
        bigNum=10,
        price=Decimal("9.99"),
        data={"k": [1, "x", None]},
        raw=b"\x00",
        ratio=0.5,
        flag=True,
        count=3,
        createdAt=datetime(2026, 1, 1, tzinfo=timezone.utc),
        status="ACTIVE",
        tags=["a", "b"],
    )
    assert account.createdAt.year == 2026

    # extra="ignore" (default): unknown keys are dropped.
    ignored = Tag.model_validate({"id": "t1", "label": "x", "unknown": 1})
    assert not hasattr(ignored, "unknown")

    # @p.strictObject → extra="forbid": unknown keys are rejected.
    try:
        Locked.model_validate({"id": 1, "name": "n", "unknown": 1})
        raise AssertionError("extra key accepted by strictObject model")
    except ValidationError:
        pass

    # @p.looseObject → extra="allow": unknown keys are kept.
    opened = Open.model_validate({"id": 1, "name": "n", "unknown": 1})
    assert opened.model_extra == {"unknown": 1}

    # @p. field annotation: StringConstraints(min_length=1) rejects "".
    try:
        Locked.model_validate({"id": 1, "name": ""})
        raise AssertionError("min_length constraint not enforced")
    except ValidationError:
        pass

    # Python-keyword columns validate under their real names via alias.
    keyword = Keyword.model_validate(
        {"id": "k1", "type": "t", "match": "m", "async": "a", "yield": "y", "self": "s"}
    )
    assert keyword.async_ == "a"
    assert keyword.yield_ == "y"

    # Optional fields default to None.
    profile = Profile.model_validate(
        {
            "id": "p1",
            "accountId": "a1",
            "nickname": "nick",
            "score": 0.5,
            "balance": "0.00",
            "verified": False,
            "updatedAt": "2026-01-01T00:00:00Z",
        }
    )
    assert profile.bio is None
    assert profile.mood is None

    # Native @db.* refinements coerce str → UUID / date / time.
    grid = NativeGrid.model_validate(
        {
            "id": "0d5e9a9c-6a3e-4b7e-9e5a-1f2b3c4d5e6f",
            "code": "abc",
            "label": "l",
            "tiny": 1,
            "ordinary": 2,
            "ident": 3,
            "single": 1.0,
            "double": 2.0,
            "wealth": "1.00",
            "exact": "2.00",
            "blobby": b"",
            "doc": {"a": 1},
            "plain": [1, 2],
            "day": "2026-01-02",
            "clock": "12:34:56",
            "stamp": "2026-01-01T00:00:00",
            "zoned": "2026-01-01T00:00:00Z",
            "address": "127.0.0.1",
            "mask": "10101010",
            "varMask": "1",
            "markup": "<a/>",
            "bigCount": 9007199254740993,
            "flagged": True,
        }
    )
    assert grid.day.month == 1
    assert grid.clock.minute == 34


if __name__ == "__main__":
    _runtime_smoke()
    print("pydantic smoke ok")
