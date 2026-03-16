from sqlalchemy import Column, Enum, ForeignKey, String, Table, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from typing import Optional
from datetime import datetime


class Base(DeclarativeBase):
    pass

post_to_tag = Table(
    "_PostToTag",
    Base.metadata,
    Column("A", String, ForeignKey("post.id"), primary_key=True),
    Column("B", String, ForeignKey("tag.id"), primary_key=True),
)


class User(Base):
    __tablename__ = "user"

    id: Mapped[str] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(unique=True)
    name: Mapped[Optional[str]]
    age: Mapped[Optional[int]]
    is_active: Mapped[bool] = mapped_column(default=True)
    role: Mapped[str] = mapped_column(Enum("ADMIN", "MEMBER", "GUEST", name="role"), default="MEMBER")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(onupdate=func.now())

    posts: Mapped[list["Post"]] = relationship(back_populates="author")
    profile: Mapped["Profile"] = relationship(back_populates="user", uselist=False)

class Post(Base):
    __tablename__ = "post"

    id: Mapped[str] = mapped_column(primary_key=True)
    title: Mapped[str]
    content: Mapped[str]
    published: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(onupdate=func.now())
    author_id: Mapped[str] = mapped_column(ForeignKey("user.id"))

    author: Mapped["User"] = relationship(back_populates="posts")
    tags: Mapped[list["Tag"]] = relationship(secondary=post_to_tag, back_populates="posts")

class Profile(Base):
    __tablename__ = "profile"

    id: Mapped[str] = mapped_column(primary_key=True)
    bio: Mapped[Optional[str]]
    avatar: Mapped[Optional[str]]
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"), unique=True)

    user: Mapped["User"] = relationship(back_populates="profile")

class Tag(Base):
    __tablename__ = "tag"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True)

    posts: Mapped[list["Post"]] = relationship(secondary=post_to_tag, back_populates="tags")
