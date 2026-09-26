from datetime import datetime
from datetime import timezone as dt_timezone
from typing import Any, TypeVar

from django.conf import settings
from django.db import models
from django.db.backends.base.base import BaseDatabaseWrapper
from django.utils import timezone


class UtcDateTimeField(models.DateTimeField):  # type: ignore[type-arg]
    """A timestamp without a zone holding UTC, as ISO 8601 text on SQLite."""

    def get_db_prep_value(self, value: Any, connection: BaseDatabaseWrapper, prepared: bool = False) -> Any:
        if not prepared:
            value = self.get_prep_value(value)
        if not isinstance(value, datetime):
            return super().get_db_prep_value(value, connection, prepared=True)
        if timezone.is_naive(value):
            value = timezone.make_aware(value, timezone.get_default_timezone())
        value = value.astimezone(dt_timezone.utc)
        if connection.vendor == "sqlite":
            return value.isoformat(timespec="milliseconds")
        return connection.ops.adapt_datetimefield_value(value.replace(tzinfo=None))

    def from_db_value(self, value: datetime | None, expression: Any, connection: BaseDatabaseWrapper) -> datetime | None:
        if value is None:
            return None
        if timezone.is_naive(value):
            value = value.replace(tzinfo=dt_timezone.utc)
        return value if settings.USE_TZ else timezone.make_naive(value, timezone.get_default_timezone())


_M = TypeVar("_M", bound=models.Model)


class AutoNowQuerySet(models.QuerySet[_M]):
    """update(), and bulk_update() through it, set the auto_now fields as save() does."""

    def update(self, **kwargs: Any) -> int:
        for field in self.model._meta.concrete_fields:
            if getattr(field, "auto_now", False):
                kwargs.setdefault(field.name, getattr(field, "stamp", timezone.now)())
        return super().update(**kwargs)


class Status(models.TextChoices):
    DRAFT = "draft"
    PUBLISHED = "published"


class Author(models.Model):
    id = models.AutoField(primary_key=True)
    email = models.TextField(unique=True)
    created_at = UtcDateTimeField(default=timezone.now)
    updated_at = UtcDateTimeField(auto_now=True)
    objects = AutoNowQuerySet.as_manager()

    class Meta:
        db_table = "authors"


class Post(models.Model):
    id = models.AutoField(primary_key=True)
    title = models.TextField()
    status = models.TextField(choices=Status.choices, default=Status.DRAFT)
    author = models.ForeignKey("Author", on_delete=models.CASCADE, related_name="posts", db_index=False)
    published_at = UtcDateTimeField(null=True)
    embargo = UtcDateTimeField(default=datetime.fromisoformat("2020-01-01T00:00:00+00:00"))
    created_at = UtcDateTimeField(default=timezone.now)
    updated_at = UtcDateTimeField(auto_now=True)
    indexed_at = UtcDateTimeField(auto_now=True)
    tags: "models.ManyToManyField[Tag, PostToTag]" = models.ManyToManyField("Tag", through="PostToTag", related_name="posts")
    objects = AutoNowQuerySet.as_manager()

    class Meta:
        db_table = "posts"
        indexes = [
            models.Index(fields=["published_at"]),
        ]


class Tag(models.Model):
    id = models.AutoField(primary_key=True)
    name = models.TextField(unique=True)

    class Meta:
        db_table = "tags"


class Visit(models.Model):
    pk = models.CompositePrimaryKey("path", "at")
    path = models.TextField()
    at = UtcDateTimeField()
    note = models.TextField(null=True)

    class Meta:
        db_table = "visits"


class Clock(models.Model):
    id = models.AutoField(primary_key=True)
    label = models.TextField(unique=True)
    at = UtcDateTimeField(null=True)
    precise = UtcDateTimeField(null=True)
    seconds = UtcDateTimeField(null=True)
    zoned = UtcDateTimeField(null=True)
    day = UtcDateTimeField(null=True)
    time = UtcDateTimeField(null=True)
    zoned_time = UtcDateTimeField(null=True)
    created_at = UtcDateTimeField(default=timezone.now)

    class Meta:
        db_table = "clocks"


class PostToTag(models.Model):
    pk = models.CompositePrimaryKey("a_id", "b_id")
    a = models.ForeignKey("Post", on_delete=models.CASCADE, related_name="+", db_column="A", db_index=False)
    b = models.ForeignKey("Tag", on_delete=models.CASCADE, related_name="+", db_column="B", db_index=False)

    class Meta:
        db_table = "_PostToTag"
        indexes = [
            models.Index(fields=["b"]),
        ]
