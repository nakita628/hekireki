"""What interop.ts wrote with Prisma Client, read and found through the generated models: every
DateTime is the instant Prisma wrote, whatever TIME_ZONE is. Each check prints one `ok:` line, or
stops the run with what it saw instead."""

import os
import sys
from collections.abc import Callable
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

import django

sys.path.insert(0, os.environ.get("DJANGO_APP_DIR", str(Path(__file__).resolve().parent)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "settings")
django.setup()

from django.db import connection  # noqa: E402

from app.models import Clock, Post, Visit  # noqa: E402

UTC = timezone.utc
BY_PRISMA = datetime(2031, 5, 6, 7, 8, 9, 123000, tzinfo=UTC)


def check(name: str) -> Callable[[Callable[[], str | None]], None]:
    def run(body: Callable[[], str | None]) -> None:
        problem = body()
        if problem is not None:
            raise SystemExit(f"{name}: {problem}")
        print(f"ok: {name}")

    return run


def expect(got: object, want: object, label: str) -> str | None:
    return None if got == want else f"{label}: expected {want!r}, got {got!r}"


def first(*problems: str | None) -> str | None:
    return next((p for p in problems if p is not None), None)


def internal_type(name: str) -> str:
    return str(Clock._meta.get_field(name).get_internal_type())


@check("Django reads the DateTimes Prisma wrote")
def _() -> str | None:
    post = Post.objects.get(title="by Prisma")
    age = datetime.now(UTC) - post.created_at
    return first(
        expect(post.published_at, BY_PRISMA, "an optional DateTime"),
        expect(timedelta(0) <= age < timedelta(minutes=2), True, f"now(): {post.created_at}"),
        expect(post.updated_at, post.indexed_at, "both @updatedAt, as Prisma set them"),
        expect(post.embargo, datetime(2020, 1, 1, tzinfo=UTC), "the literal default"),
    )


@check("Django finds what Prisma wrote by the instant, and sorts it with its own")
def _() -> str | None:
    published = Post.objects.filter(published_at__isnull=False).order_by("-published_at")
    return first(
        expect(Visit.objects.get(pk=("/prisma", BY_PRISMA)).note, "by Prisma", "@@id"),
        expect(Post.objects.get(published_at=BY_PRISMA).title, "by Prisma", "filter"),
        expect([p.title for p in published][:2], ["by Prisma", "later"], "order_by"),
        expect(Clock.objects.filter(at=BY_PRISMA, zoned=BY_PRISMA).count(), 1, "native types"),
    )


@check("Django reads each native type Prisma wrote")
def _() -> str | None:
    clock = Clock.objects.get(label="prisma")
    zoned_time = clock.zoned_time
    # PostgreSQL gives a timetz back with its offset, which is UTC's.
    if isinstance(zoned_time, time):
        zoned_time = zoned_time.replace(tzinfo=None)
    wall = time(7, 8, 9, 123000)
    return first(
        expect(clock.at, BY_PRISMA, "at"),
        expect(clock.precise, BY_PRISMA, "precise"),
        expect(clock.seconds, BY_PRISMA.replace(microsecond=0), "seconds"),
        expect(clock.zoned, BY_PRISMA, "zoned"),
        expect(clock.day, date(2031, 5, 6) if internal_type("day") == "DateField" else BY_PRISMA, "day"),
        expect(clock.time, wall if internal_type("time") == "TimeField" else BY_PRISMA, "time"),
        expect(zoned_time, wall if internal_type("zoned_time") == "TimeField" else BY_PRISMA, "zoned_time"),
        expect(getattr(clock, "moments", [BY_PRISMA]), [BY_PRISMA], "moments")
        if connection.vendor == "postgresql"
        else None,
    )
