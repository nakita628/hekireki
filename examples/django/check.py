"""The generated models against the real Django ORM, on the tables `prisma db push` made from
schema.prisma: no Django migration runs. Every DateTime of the schema is written and read back as
Prisma Client would have it, in UTC with milliseconds, while TIME_ZONE is not UTC. The rows it
leaves are what interop.ts reads through Prisma Client. Each check prints one `ok:` line, or stops
the run with what it saw instead."""

import os
import sys
from collections.abc import Callable
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import django

# The models of the run: app/ here, or the one provider.ts generated for another database.
sys.path.insert(0, os.environ.get("DJANGO_APP_DIR", str(Path(__file__).resolve().parent)))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "settings")
django.setup()

from django.conf import settings  # noqa: E402
from django.db import connection  # noqa: E402

from app.models import Author, Clock, Post, Status, Tag, Visit  # noqa: E402

UTC = timezone.utc
LOCAL = ZoneInfo(settings.TIME_ZONE)
# An instant with milliseconds, as a JavaScript Date holds one, and one with microseconds.
AT = datetime(2030, 1, 2, 3, 4, 5, 678000, tzinfo=UTC)
AT6 = AT.replace(microsecond=678901)
SECONDS = AT.replace(microsecond=0)


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


def raw(sql: str) -> list[tuple[Any, ...]]:
    with connection.cursor() as cursor:
        cursor.execute(sql)
        return list(cursor.fetchall())


def near_now(value: datetime) -> bool:
    return abs(value - datetime.now(UTC)) < timedelta(minutes=2)


def internal_type(name: str) -> str:
    return str(Clock._meta.get_field(name).get_internal_type())


# Every run starts from empty tables; interop.ts and interop.py add to what this leaves.
Tag.objects.all().delete()
Author.objects.all().delete()
Visit.objects.all().delete()
Clock.objects.all().delete()


@check("now() and @updatedAt are filled on create, as instants in UTC")
def _() -> str | None:
    author = Author.objects.create(email="django@example.com")
    author.refresh_from_db()
    return first(
        expect(author.created_at.utcoffset(), timedelta(0), "created_at is aware, in UTC"),
        expect(near_now(author.created_at), True, f"created_at is now: {author.created_at}"),
        expect(near_now(author.updated_at), True, f"updated_at is now: {author.updated_at}"),
    )


@check("a DateTime literal default, and every @updatedAt bumped by save() and update()")
def _() -> str | None:
    author = Author.objects.get(email="django@example.com")
    post = Post.objects.create(title="Hello", author=author)
    post.refresh_from_db()
    created, updated = post.created_at, post.updated_at
    post.title = "Hello again"
    post.save()
    post.refresh_from_db()
    saved = post.updated_at
    # Prisma's updateMany sets @updatedAt too; a QuerySet.update() does here, through the manager.
    Post.objects.filter(pk=post.pk).update(status=Status.PUBLISHED)
    post.refresh_from_db()
    return first(
        expect(post.embargo, datetime(2020, 1, 1, tzinfo=UTC), "embargo"),
        expect(post.status, Status.PUBLISHED, "status"),
        expect(post.created_at, created, "created_at left alone"),
        expect(saved > updated, True, f"save() bumps updated_at: {updated} -> {saved}"),
        expect(post.updated_at > saved, True, f"update() bumps updated_at: {post.updated_at}"),
        expect(post.indexed_at, post.updated_at, "the second @updatedAt with the first"),
    )


@check("an optional DateTime: found by the instant in any zone, sorted with NULL")
def _() -> str | None:
    author = Author.objects.get(email="django@example.com")
    for title, at in (("later", AT + timedelta(days=1)), ("draft", None), ("sooner", AT)):
        # A Tokyo wall clock and its UTC instant are one value.
        Post.objects.create(title=title, author=author, published_at=at and at.astimezone(LOCAL))
    found = Post.objects.filter(published_at=AT).values_list("title", flat=True)
    ordered = Post.objects.filter(published_at__isnull=False).order_by("published_at")
    # sqlite3 parses a DATETIME column on its way out; the cast keeps the text as it is stored.
    column = "CAST(published_at AS TEXT)" if connection.vendor == "sqlite" else "published_at"
    stored = raw(f"SELECT {column} FROM posts WHERE title = 'sooner'")[0][0]
    return first(
        expect(list(found), ["sooner"], "filter(published_at=AT)"),
        expect([p.title for p in ordered], ["sooner", "later"], "order_by"),
        expect(Post.objects.filter(published_at__isnull=True).count(), 2, "NULL"),
        # ISO 8601 text on SQLite, a timestamp without a zone elsewhere: UTC's wall clock.
        expect(
            stored,
            "2030-01-02T03:04:05.678+00:00"
            if connection.vendor == "sqlite"
            else AT.replace(tzinfo=None),
            "the column holds UTC, as Prisma writes it",
        ),
    )


@check("a DateTime in a composite key finds its row by the instant")
def _() -> str | None:
    Visit.objects.create(path="/django", at=AT.astimezone(LOCAL), note="by Django")
    visit = Visit.objects.get(pk=("/django", AT))
    return first(
        expect(visit.note, "by Django", "note"),
        expect(visit.at, AT, "at"),
        expect(Visit.objects.filter(at__gt=AT - timedelta(milliseconds=1)).count(), 1, "range"),
    )


# What each native type of Clock holds of AT: on SQLite every one is the plain DateTime.
WANT: dict[str, object] = {
    "at": AT,
    # Prisma keeps milliseconds on SQLite, where the column is text; a TIMESTAMP(6) keeps AT6.
    "precise": AT if connection.vendor == "sqlite" else AT6,
    "seconds": SECONDS,
    "zoned": AT,
    "day": date(2030, 1, 2) if internal_type("day") == "DateField" else AT,
    "time": time(3, 4, 5, 678000) if internal_type("time") == "TimeField" else AT,
    "zoned_time": time(3, 4, 5, 678000) if internal_type("zoned_time") == "TimeField" else AT,
    **({"moments": [AT, AT + timedelta(seconds=1)]} if connection.vendor == "postgresql" else {}),
}


@check("every native type a DateTime can have reads back as it was written")
def _() -> str | None:
    values: dict[str, object] = {**WANT, "precise": AT6, "at": AT.astimezone(LOCAL)}
    Clock.objects.create(label="django", **values)
    clock = Clock.objects.get(label="django")
    got = {name: getattr(clock, name) for name in WANT}
    # PostgreSQL gives a timetz back with its offset, which is UTC's.
    if isinstance(got["zoned_time"], time):
        got["zoned_time"] = got["zoned_time"].replace(tzinfo=None)
    return first(
        expect(got, WANT, "values"),
        expect(near_now(clock.created_at), True, f"created_at is now: {clock.created_at}"),
        expect(Clock.objects.filter(at=AT, seconds=SECONDS, zoned=AT).count(), 1, "filter"),
    )
