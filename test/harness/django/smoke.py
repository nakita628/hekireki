"""Pins semantic invariants in the type system so mypy --strict catches a
regression that would otherwise type-check: an optional scalar must stay
`| None`, a self-relation must resolve to the model class, and an enum column
must stay a str-valued choices field.

Run as a script it also exercises the parts mypy cannot see: the system-check
framework (field-name rules, choices, composite keys, related_name clashes),
migration serialization (a lambda default or an unserializable db_default only
fails here), offline PostgreSQL DDL compilation, model instantiation, which
fires every client-side default (uuid4/uuid7/ulid string generators), and
query compilation, which is the only check that resolves the joins."""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "settings")

import django

django.setup()

import uuid

from app.models import (
    Account,
    Board,
    Category,
    Claim,
    Event,
    Inventory,
    Monarch,
    Post,
    Profile,
    Tag,
    Ticket,
    Torture,
)


def _static_smoke(account: Account, profile: Profile) -> None:
    bio: str | None = profile.bio
    age: int | None = profile.age
    parent: Category | None = Category().parent
    successor: Monarch | None = Monarch().successor
    status: str = account.status
    _ = (bio, age, parent, successor, status)


def _runtime_smoke() -> None:
    from django.apps import apps
    from django.core.checks import run_checks
    from django.db import connection
    from django.db.migrations.autodetector import MigrationAutodetector
    from django.db.migrations.loader import MigrationLoader
    from django.db.migrations.state import ProjectState
    from django.db.migrations.writer import MigrationWriter

    # Warnings count too: the ones that apply here (a unique ForeignKey that
    # should be a OneToOneField, a nullable ManyToManyField, a symmetrical
    # self-relation that silently drops related_name) each mean the generated
    # model says something other than the Prisma schema does.
    assert run_checks() == []

    # Rendering the autodetected initial migration runs the migration
    # serializer over every field: this is what rejects a lambda default or an
    # expression without deconstruct() support. The app needs a migrations
    # package for the autodetector to consider it at all — without one this
    # loop is empty and proves nothing, so the assertions guard that first.
    loader = MigrationLoader(None, ignore_no_migrations=True)
    autodetector = MigrationAutodetector(loader.project_state(), ProjectState.from_apps(apps))
    changes = autodetector.changes(graph=loader.graph)
    assert "app" in changes, "autodetector saw no models: is app/migrations/__init__.py missing?"
    for migration in changes["app"]:
        assert len(MigrationWriter(migration).as_string()) > 0

    # collect_sql compiles the full PostgreSQL DDL without a live server.
    with connection.schema_editor(collect_sql=True, atomic=False) as editor:
        for model in apps.get_app_config("app").get_models():
            editor.create_model(model)
    assert len(editor.collected_sql) > 0

    # Instantiation applies every client-side default.
    for model in apps.get_app_config("app").get_models():
        model()

    uuid.UUID(Account().id)
    assert uuid.UUID(Event().id).version == 7
    assert len(Ticket().id) == 26


def _default_value_smoke() -> None:
    """Instantiation applies every `default=`, so this reads back the value the
    generated source only spells out. The golden masters pin the text of the
    default; what it evaluates to in Python is checked here."""

    # An enum default carries the mapped database value, not the Prisma name.
    assert Board().visibility == "link_only"

    torture = Torture()
    assert torture.quoted == 'it\'s a "quote" and a \\ backslash'
    assert torture.unicode == "日本語と🔥絵文字"
    assert torture.empty == ""
    # Beyond Number.MAX_SAFE_INTEGER: the literal must survive as an int.
    assert torture.big_pos == 9007199254740993
    assert torture.big_neg == -9007199254740993
    assert torture.json_obj == {"a": 1, "b": [True, None, "x"]}
    assert torture.json_arr == []
    assert torture.json_str == "quoted"
    # USE_TZ is on, so a naive default would warn and compare wrongly.
    assert torture.born.tzinfo is not None

    inventory = Inventory()
    assert inventory.tags == []
    assert inventory.codes == [1, 2, 3]
    assert inventory.labels == ["a", "b"]

    # The point of emitting a function rather than a literal: two instances must
    # not share one mutable default.
    first = Inventory()
    first.codes.append(99)
    assert Inventory().codes == [1, 2, 3]
    assert Torture().json_obj is not Torture().json_obj


def _query_smoke() -> None:
    """Compiling a QuerySet to SQL resolves the relations end to end, which
    neither the system checks nor the DDL reach: a related_name pointing at the
    wrong field, a through model whose columns do not match the join table, or a
    to_field aimed at the primary key instead of the referenced unique column
    all produce a wrong join here while passing everything above."""

    # Forward and reverse traversal across a ForeignKey and a OneToOneField.
    assert '"post"."author_id" = "accounts"."id"' in str(
        Post.objects.select_related("author").filter(author__status="ACTIVE").query
    )
    assert '"profile"."account_id"' in str(Account.objects.filter(profile__verified=True).query)

    # The many-to-many joins through Prisma's own table and its "A"/"B" columns,
    # in both directions.
    post_to_tag = str(Post.objects.filter(tags__label="a").query)
    assert 'INNER JOIN "_PostToTag" ON ("post"."id" = "_PostToTag"."A")' in post_to_tag
    assert 'INNER JOIN "tag" ON ("_PostToTag"."B" = "tag"."id")' in post_to_tag
    tag_to_post = str(Tag.objects.filter(posts__title="x").query)
    assert 'INNER JOIN "_PostToTag" ON ("tag"."id" = "_PostToTag"."B")' in tag_to_post

    # Two relations to the same model must not collapse into one join.
    followers = str(Account.objects.filter(followers__follower__id="1").query)
    assert '"follow"."following_id"' in followers
    assert '"follow"."follower_id"' in followers

    # Self-relations join the table to an alias of itself.
    assert 'INNER JOIN "category" T2' in str(Category.objects.filter(children__name="x").query)
    assert 'INNER JOIN "monarch" T2' in str(Monarch.objects.filter(predecessor__name="x").query)

    # A foreign key aimed at a unique column that is not the primary key.
    assert 'INNER JOIN "handle" ON ("claim"."slug" = "handle"."slug")' in str(
        Claim.objects.select_related("handle").query
    )


if __name__ == "__main__":
    _runtime_smoke()
    _default_value_smoke()
    _query_smoke()
    print("django smoke OK")
