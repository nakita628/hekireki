"""Pins semantic invariants in the type system so mypy --strict catches a
regression that would otherwise type-check: a scalar list must stay list[str]
(not collapse to str) and a JSON column must stay dict[str, Any] (not bare
dict)."""

from typing import Any

from models import Account


def _smoke(a: Account) -> None:
    tags: list[str] = a.tags
    data: dict[str, Any] = a.data
    _ = (tags, data)
