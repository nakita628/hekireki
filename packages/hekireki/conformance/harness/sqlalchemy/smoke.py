"""Pins semantic invariants in the type system so mypy --strict catches a
regression that would otherwise type-check: a scalar list must stay list[str]
(not collapse to str), a JSON column must stay dict[str, Any] (not bare dict),
and a `?` scalar must stay Optional."""

from typing import Any, Optional

from models import Account, Profile


def _smoke(a: Account, p: Profile) -> None:
    tags: list[str] = a.tags
    data: dict[str, Any] = a.data
    bio: Optional[str] = p.bio
    age: Optional[int] = p.age
    _ = (tags, data, bio, age)
