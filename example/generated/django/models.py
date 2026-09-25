import uuid
from datetime import datetime
from datetime import timezone as dt_timezone
from decimal import Decimal
from typing import Any, TypeVar

import uuid6
from django.conf import settings
from django.contrib.postgres.fields import ArrayField
from django.db import models
from django.db.backends.base.base import BaseDatabaseWrapper
from django.db.models.expressions import RawSQL
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


def uuid4_str() -> str:
    return str(uuid.uuid4())


def uuid7_str() -> str:
    return str(uuid6.uuid7())


class Role(models.TextChoices):
    ADMIN = "ADMIN"
    EDITOR = "EDITOR"
    VIEWER = "VIEWER"


class Visibility(models.TextChoices):
    PUBLIC = "public"
    PRIVATE = "private"
    LINK_ONLY = "link_only"


class User(models.Model):
    id = models.TextField(primary_key=True, default=uuid7_str)
    email = models.TextField(unique=True)
    name = models.TextField()
    role = models.TextField(choices=Role.choices, default=Role.VIEWER)
    interests = ArrayField(models.TextField(), default=list)
    created_at = UtcDateTimeField(default=timezone.now)
    updated_at = UtcDateTimeField(auto_now=True)
    objects = AutoNowQuerySet.as_manager()

    class Meta:
        db_table = "users"


class Profile(models.Model):
    id = models.TextField(primary_key=True, default=None)
    user = models.OneToOneField("User", on_delete=models.CASCADE, related_name="profile")
    bio = models.TextField(null=True)
    nickname = models.CharField(max_length=64, default="anonymous")
    age = models.SmallIntegerField(null=True)
    balance = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("0"))
    verified = models.BooleanField(default=False)
    meta = models.JSONField(null=True)
    avatar = models.BinaryField(null=True)
    last_seen = models.DateTimeField(null=True)

    class Meta:
        db_table = "Profile"


class Post(models.Model):
    id = models.TextField(primary_key=True, default=uuid4_str)
    title = models.TextField()
    content = models.TextField(null=True)
    visibility = models.TextField(choices=Visibility.choices, default=Visibility.LINK_ONLY)
    published = models.BooleanField(default=False)
    view_count = models.IntegerField(default=0)
    author = models.ForeignKey("User", on_delete=models.CASCADE, related_name="posts", db_index=False)
    tags: "models.ManyToManyField[Tag, PostToTag]" = models.ManyToManyField("Tag", through="PostToTag", related_name="posts")
    created_at = UtcDateTimeField(default=timezone.now)

    class Meta:
        db_table = "posts"
        indexes = [
            models.Index(fields=["author"]),
        ]


class Tag(models.Model):
    id = models.AutoField(primary_key=True)
    label = models.TextField(unique=True)

    class Meta:
        db_table = "Tag"


class Comment(models.Model):
    id = models.AutoField(primary_key=True)
    body = models.TextField()
    post = models.ForeignKey("Post", on_delete=models.CASCADE, related_name="comments", db_index=False)
    author = models.ForeignKey("User", on_delete=models.SET_NULL, related_name="comments", null=True, db_index=False)
    created_at = UtcDateTimeField(default=timezone.now)

    class Meta:
        db_table = "comments"
        indexes = [
            models.Index(fields=["post", "created_at"]),
        ]


class Follow(models.Model):
    pk = models.CompositePrimaryKey("follower_id", "following_id")
    follower = models.ForeignKey("User", on_delete=models.CASCADE, related_name="following", db_index=False)
    following = models.ForeignKey("User", on_delete=models.CASCADE, related_name="followers", db_index=False)
    since = UtcDateTimeField(default=timezone.now)

    class Meta:
        db_table = "follows"


class Category(models.Model):
    id = models.AutoField(primary_key=True)
    name = models.TextField()
    parent = models.ForeignKey("self", on_delete=models.SET_NULL, related_name="children", null=True, db_index=False)

    class Meta:
        db_table = "Category"
        constraints = [
            models.UniqueConstraint(fields=["parent", "name"], name="Category_parent_id_name_key"),
        ]


class Order(models.Model):
    id = models.BigAutoField(primary_key=True)
    user = models.ForeignKey("User", on_delete=models.RESTRICT, related_name="orders", db_index=False)
    total = models.DecimalField(max_digits=12, decimal_places=2)
    placed_at = UtcDateTimeField(default=timezone.now)

    class Meta:
        db_table = "orders"


class OrderItem(models.Model):
    id = models.BigAutoField(primary_key=True)
    order = models.ForeignKey("Order", on_delete=models.CASCADE, related_name="items", db_index=False)
    sku = models.CharField(max_length=32)
    qty = models.IntegerField(default=1)
    price = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        db_table = "order_items"
        constraints = [
            models.UniqueConstraint(fields=["order", "sku"], name="order_items_order_id_sku_key"),
        ]


class AuditLog(models.Model):
    id = models.UUIDField(primary_key=True, db_default=RawSQL("gen_random_uuid()", []))
    action = models.TextField()
    payload = models.JSONField(default=dict)
    signature = models.BinaryField(null=True)
    logged_at = UtcDateTimeField(db_default=RawSQL("now()", []))

    class Meta:
        db_table = "audit_logs"


class Actor(models.Model):
    id = models.AutoField(primary_key=True)
    name = models.TextField()
    films: "models.ManyToManyField[Film, Cast]" = models.ManyToManyField("Film", through="Cast", related_name="actors")

    class Meta:
        db_table = "Actor"


class Film(models.Model):
    id = models.AutoField(primary_key=True)
    title = models.TextField()

    class Meta:
        db_table = "Film"


class PostToTag(models.Model):
    pk = models.CompositePrimaryKey("a_id", "b_id")
    a = models.ForeignKey("Post", on_delete=models.CASCADE, related_name="+", db_column="A", db_index=False)
    b = models.ForeignKey("Tag", on_delete=models.CASCADE, related_name="+", db_column="B", db_index=False)

    class Meta:
        db_table = "_PostToTag"
        indexes = [
            models.Index(fields=["b"]),
        ]


class Cast(models.Model):
    pk = models.CompositePrimaryKey("a_id", "b_id")
    a = models.ForeignKey("Actor", on_delete=models.CASCADE, related_name="+", db_column="A", db_index=False)
    b = models.ForeignKey("Film", on_delete=models.CASCADE, related_name="+", db_column="B", db_index=False)

    class Meta:
        db_table = "_cast"
        indexes = [
            models.Index(fields=["b"]),
        ]
