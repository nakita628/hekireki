from sqlalchemy import ARRAY, BigInteger, Column, DateTime, Enum, ForeignKey, Index, Integer, JSON, Numeric, SmallInteger, String, Table, Text, UniqueConstraint, Uuid, func, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from typing import Any, Optional
from decimal import Decimal as DecimalType
from datetime import datetime
import uuid as uuid_mod
import uuid6


class Base(DeclarativeBase):
    pass

post_to_tag = Table(
    "_PostToTag",
    Base.metadata,
    Column("A", String, ForeignKey("posts.id"), primary_key=True),
    Column("B", Integer, ForeignKey("tag.id"), primary_key=True),
)

cast = Table(
    "_cast",
    Base.metadata,
    Column("A", Integer, ForeignKey("actor.id"), primary_key=True),
    Column("B", Integer, ForeignKey("film.id"), primary_key=True),
)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(primary_key=True, default=lambda: str(uuid6.uuid7()))
    email: Mapped[str] = mapped_column(unique=True)
    name: Mapped[str]
    role: Mapped[str] = mapped_column(Enum("ADMIN", "EDITOR", "VIEWER", name="role"), default="VIEWER")
    interests: Mapped[list[str]] = mapped_column(ARRAY(String), default=lambda: [])
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(default=func.now(), onupdate=func.now())

    posts: Mapped[list["Post"]] = relationship(back_populates="author")
    comments: Mapped[list["Comment"]] = relationship(back_populates="author")
    orders: Mapped[list["Order"]] = relationship(back_populates="user")
    followers: Mapped[list["Follow"]] = relationship(foreign_keys="Follow.following_id", back_populates="following")
    following: Mapped[list["Follow"]] = relationship(foreign_keys="Follow.follower_id", back_populates="follower")
    profile: Mapped[Optional["Profile"]] = relationship(back_populates="user")

class Profile(Base):
    __tablename__ = "profile"

    id: Mapped[str] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    bio: Mapped[Optional[str]] = mapped_column(Text)
    nickname: Mapped[str] = mapped_column(String(64), default="anonymous")
    age: Mapped[Optional[int]] = mapped_column(SmallInteger)
    balance: Mapped[DecimalType] = mapped_column(Numeric(precision=10, scale=2), default=DecimalType("0"))
    verified: Mapped[bool] = mapped_column(default=False)
    meta: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON)
    avatar: Mapped[Optional[bytes]]
    last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    user: Mapped["User"] = relationship(back_populates="profile")

class Post(Base):
    __tablename__ = "posts"

    id: Mapped[str] = mapped_column(primary_key=True, default=lambda: str(uuid_mod.uuid4()))
    title: Mapped[str]
    content: Mapped[Optional[str]]
    visibility: Mapped[str] = mapped_column(Enum("public", "private", "link_only", name="visibility_level"), default="link_only")
    published: Mapped[bool] = mapped_column(default=False)
    view_count: Mapped[int] = mapped_column(default=0)
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        Index("idx_posts_author_id", "author_id"),
    )

    author: Mapped["User"] = relationship(back_populates="posts")
    comments: Mapped[list["Comment"]] = relationship(back_populates="post")
    tags: Mapped[list["Tag"]] = relationship(secondary=post_to_tag, back_populates="posts")

class Tag(Base):
    __tablename__ = "tag"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    label: Mapped[str] = mapped_column(unique=True)

    posts: Mapped[list["Post"]] = relationship(secondary=post_to_tag, back_populates="tags")

class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    body: Mapped[str]
    post_id: Mapped[str] = mapped_column(ForeignKey("posts.id", ondelete="CASCADE"))
    author_id: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        Index("idx_comments_post_id_created_at", "post_id", "created_at"),
    )

    post: Mapped["Post"] = relationship(back_populates="comments")
    author: Mapped[Optional["User"]] = relationship(back_populates="comments")

class Follow(Base):
    __tablename__ = "follows"

    follower_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    following_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    since: Mapped[datetime] = mapped_column(server_default=func.now())

    follower: Mapped["User"] = relationship(foreign_keys=[follower_id], back_populates="following")
    following: Mapped["User"] = relationship(foreign_keys=[following_id], back_populates="followers")

class Category(Base):
    __tablename__ = "category"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str]
    parent_id: Mapped[Optional[int]] = mapped_column(ForeignKey("category.id"))

    __table_args__ = (
        UniqueConstraint("parent_id", "name"),
    )

    parent: Mapped[Optional["Category"]] = relationship(remote_side=[id], back_populates="children")
    children: Mapped[list["Category"]] = relationship(back_populates="parent")

class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    total: Mapped[DecimalType] = mapped_column(Numeric(precision=12, scale=2))
    placed_at: Mapped[datetime] = mapped_column(server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="orders")
    items: Mapped[list["OrderItem"]] = relationship(back_populates="order")

class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    order_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("orders.id", ondelete="CASCADE"))
    sku: Mapped[str] = mapped_column(String(32))
    qty: Mapped[int] = mapped_column(default=1)
    price: Mapped[DecimalType] = mapped_column(Numeric(precision=12, scale=2))

    __table_args__ = (
        UniqueConstraint("order_id", "sku"),
    )

    order: Mapped["Order"] = relationship(back_populates="items")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid_mod.UUID] = mapped_column(Uuid, primary_key=True, server_default=text("gen_random_uuid()"))
    action: Mapped[str]
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=lambda: {})
    signature: Mapped[Optional[bytes]]
    logged_at: Mapped[datetime] = mapped_column(server_default=text("now()"))

class Actor(Base):
    __tablename__ = "actor"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str]

    films: Mapped[list["Film"]] = relationship(secondary=cast, back_populates="actors")

class Film(Base):
    __tablename__ = "film"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str]

    actors: Mapped[list["Actor"]] = relationship(secondary=cast, back_populates="films")
