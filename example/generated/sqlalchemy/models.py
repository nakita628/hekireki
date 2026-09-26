from sqlalchemy import ARRAY, BigInteger, Column, Dialect, Enum, ForeignKey, Index, Integer, MetaData, Numeric, PrimaryKeyConstraint, SmallInteger, String, Table, Text, TypeDecorator, Uuid, text
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from typing import Any, Optional
from decimal import Decimal as DecimalType
from datetime import datetime, timezone
import uuid as uuid_mod
import uuid6


class UtcDateTime(TypeDecorator[datetime]):
    """A timestamp without time zone that holds UTC: an aware value is stored in UTC."""

    impl = TIMESTAMP
    cache_ok = True

    def process_bind_param(self, value: Optional[datetime], dialect: Dialect) -> Optional[datetime]:
        if value is None or value.tzinfo is None:
            return value
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value: Optional[datetime], dialect: Dialect) -> Optional[datetime]:
        return None if value is None else value.replace(tzinfo=timezone.utc)


class UtcDateTimeTz(TypeDecorator[datetime]):
    """A timestamptz: a naive value is UTC, not the session's zone, and reads are UTC."""

    impl = TIMESTAMP
    cache_ok = True

    def __init__(self, precision: Optional[int] = None) -> None:
        super().__init__(timezone=True, precision=precision)

    def process_bind_param(self, value: Optional[datetime], dialect: Dialect) -> Optional[datetime]:
        return value if value is None or value.tzinfo else value.replace(tzinfo=timezone.utc)

    def process_result_value(self, value: Optional[datetime], dialect: Dialect) -> Optional[datetime]:
        return None if value is None else value.astimezone(timezone.utc)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})
    type_annotation_map = {datetime: UtcDateTime(precision=3), str: Text}

post_to_tag = Table(
    "_PostToTag",
    Base.metadata,
    Column("A", Text, ForeignKey("posts.id", ondelete="CASCADE", onupdate="CASCADE", name="_PostToTag_A_fkey"), nullable=False),
    Column("B", Integer, ForeignKey("Tag.id", ondelete="CASCADE", onupdate="CASCADE", name="_PostToTag_B_fkey"), nullable=False),
    PrimaryKeyConstraint("A", "B", name="_PostToTag_AB_pkey"),
    Index("_PostToTag_B_index", "B"),
)

cast = Table(
    "_cast",
    Base.metadata,
    Column("A", Integer, ForeignKey("Actor.id", ondelete="CASCADE", onupdate="CASCADE", name="_cast_A_fkey"), nullable=False),
    Column("B", Integer, ForeignKey("Film.id", ondelete="CASCADE", onupdate="CASCADE", name="_cast_B_fkey"), nullable=False),
    PrimaryKeyConstraint("A", "B", name="_cast_AB_pkey"),
    Index("_cast_B_index", "B"),
)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(primary_key=True, default=lambda: str(uuid6.uuid7()))
    email: Mapped[str]
    name: Mapped[str]
    role: Mapped[str] = mapped_column(Enum("ADMIN", "EDITOR", "VIEWER", name="Role"), default="VIEWER", server_default=text("'VIEWER'"))
    interests: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=True, default=lambda: [], server_default=text("ARRAY[]::text[]"))
    created_at: Mapped[datetime] = mapped_column(default=utc_now, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)

    __table_args__ = (
        Index("users_email_key", "email", unique=True),
    )

    posts: Mapped[list["Post"]] = relationship(cascade="all, delete", passive_deletes=True, back_populates="author")
    comments: Mapped[list["Comment"]] = relationship(back_populates="author")
    orders: Mapped[list["Order"]] = relationship(passive_deletes="all", back_populates="user")
    followers: Mapped[list["Follow"]] = relationship(foreign_keys="Follow.following_id", cascade="all, delete", passive_deletes=True, back_populates="following")
    following: Mapped[list["Follow"]] = relationship(foreign_keys="Follow.follower_id", cascade="all, delete", passive_deletes=True, back_populates="follower")
    profile: Mapped[Optional["Profile"]] = relationship(cascade="all, delete", passive_deletes=True, back_populates="user")

class Profile(Base):
    __tablename__ = "Profile"

    id: Mapped[str] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE", onupdate="CASCADE", name="Profile_user_id_fkey"))
    bio: Mapped[Optional[str]]
    nickname: Mapped[str] = mapped_column(String(64), default="anonymous", server_default=text("'anonymous'"))
    age: Mapped[Optional[int]] = mapped_column(SmallInteger)
    balance: Mapped[DecimalType] = mapped_column(Numeric(precision=10, scale=2), default=DecimalType("0"), server_default=text("0"))
    verified: Mapped[bool] = mapped_column(default=False, server_default=text("false"))
    meta: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB(none_as_null=True))
    avatar: Mapped[Optional[bytes]]
    last_seen: Mapped[Optional[datetime]] = mapped_column(UtcDateTimeTz(precision=6))

    __table_args__ = (
        Index("Profile_user_id_key", "user_id", unique=True),
    )

    user: Mapped["User"] = relationship(back_populates="profile")

class Post(Base):
    __tablename__ = "posts"

    id: Mapped[str] = mapped_column(primary_key=True, default=lambda: str(uuid_mod.uuid4()))
    title: Mapped[str]
    content: Mapped[Optional[str]]
    visibility: Mapped[str] = mapped_column(Enum("public", "private", "link_only", name="visibility_level"), default="link_only", server_default=text("'link_only'"))
    published: Mapped[bool] = mapped_column(default=False, server_default=text("false"))
    view_count: Mapped[int] = mapped_column(default=0, server_default=text("0"))
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE", onupdate="CASCADE", name="posts_author_id_fkey"))
    created_at: Mapped[datetime] = mapped_column(default=utc_now, server_default=text("CURRENT_TIMESTAMP"))

    __table_args__ = (
        Index("posts_author_id_idx", "author_id"),
    )

    author: Mapped["User"] = relationship(back_populates="posts")
    comments: Mapped[list["Comment"]] = relationship(cascade="all, delete", passive_deletes=True, back_populates="post")
    tags: Mapped[list["Tag"]] = relationship(secondary=post_to_tag, back_populates="posts")

class Tag(Base):
    __tablename__ = "Tag"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    label: Mapped[str]

    __table_args__ = (
        Index("Tag_label_key", "label", unique=True),
    )

    posts: Mapped[list["Post"]] = relationship(secondary=post_to_tag, back_populates="tags")

class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    body: Mapped[str]
    post_id: Mapped[str] = mapped_column(ForeignKey("posts.id", ondelete="CASCADE", onupdate="CASCADE", name="comments_post_id_fkey"))
    author_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL", onupdate="CASCADE", name="comments_author_id_fkey"))
    created_at: Mapped[datetime] = mapped_column(default=utc_now, server_default=text("CURRENT_TIMESTAMP"))

    __table_args__ = (
        Index("comments_post_id_created_at_idx", "post_id", "created_at"),
    )

    post: Mapped["Post"] = relationship(back_populates="comments")
    author: Mapped[Optional["User"]] = relationship(back_populates="comments")

class Follow(Base):
    __tablename__ = "follows"

    follower_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE", onupdate="CASCADE", name="follows_follower_id_fkey"), primary_key=True)
    following_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE", onupdate="CASCADE", name="follows_following_id_fkey"), primary_key=True)
    since: Mapped[datetime] = mapped_column(default=utc_now, server_default=text("CURRENT_TIMESTAMP"))

    follower: Mapped["User"] = relationship(foreign_keys=[follower_id], back_populates="following")
    following: Mapped["User"] = relationship(foreign_keys=[following_id], back_populates="followers")

class Category(Base):
    __tablename__ = "Category"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str]
    parent_id: Mapped[Optional[int]] = mapped_column(ForeignKey("Category.id", ondelete="SET NULL", onupdate="CASCADE", name="Category_parent_id_fkey"))

    __table_args__ = (
        Index("Category_parent_id_name_key", "parent_id", "name", unique=True),
    )

    parent: Mapped[Optional["Category"]] = relationship(remote_side=[id], back_populates="children")
    children: Mapped[list["Category"]] = relationship(back_populates="parent")

class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT", onupdate="CASCADE", name="orders_user_id_fkey"))
    total: Mapped[DecimalType] = mapped_column(Numeric(precision=12, scale=2))
    placed_at: Mapped[datetime] = mapped_column(default=utc_now, server_default=text("CURRENT_TIMESTAMP"))

    user: Mapped["User"] = relationship(back_populates="orders")
    items: Mapped[list["OrderItem"]] = relationship(cascade="all, delete", passive_deletes=True, back_populates="order")

class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("orders.id", ondelete="CASCADE", onupdate="CASCADE", name="order_items_order_id_fkey"))
    sku: Mapped[str] = mapped_column(String(32))
    qty: Mapped[int] = mapped_column(default=1, server_default=text("1"))
    price: Mapped[DecimalType] = mapped_column(Numeric(precision=12, scale=2))

    __table_args__ = (
        Index("order_items_order_id_sku_key", "order_id", "sku", unique=True),
    )

    order: Mapped["Order"] = relationship(back_populates="items")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid_mod.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    action: Mapped[str]
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, default=lambda: {}, server_default=text("'{}'"))
    signature: Mapped[Optional[bytes]]
    logged_at: Mapped[datetime] = mapped_column(server_default=text("now()"))

class Actor(Base):
    __tablename__ = "Actor"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str]

    films: Mapped[list["Film"]] = relationship(secondary=cast, back_populates="actors")

class Film(Base):
    __tablename__ = "Film"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str]

    actors: Mapped[list["Actor"]] = relationship(secondary=cast, back_populates="films")
