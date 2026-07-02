from sqlalchemy import ForeignKey, Index, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from typing import Optional
from datetime import datetime


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "user"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]
    username: Mapped[str] = mapped_column(unique=True)
    bio: Mapped[Optional[str]] = mapped_column(default="")
    email: Mapped[str] = mapped_column(unique=True)
    email_verified: Mapped[Optional[datetime]]
    image: Mapped[Optional[str]]
    cover_image: Mapped[Optional[str]]
    profile_image: Mapped[Optional[str]]
    hashed_password: Mapped[Optional[str]]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(onupdate=func.now())
    has_notification: Mapped[Optional[bool]] = mapped_column(default=False)

    posts: Mapped[list["Post"]] = relationship(back_populates="user")
    comments: Mapped[list["Comment"]] = relationship(back_populates="user")
    notifications: Mapped[list["Notification"]] = relationship(back_populates="user")
    followers: Mapped[list["Follow"]] = relationship(foreign_keys="Follow.following_id", back_populates="following")
    following: Mapped[list["Follow"]] = relationship(foreign_keys="Follow.follower_id", back_populates="follower")
    likes: Mapped[list["Like"]] = relationship(back_populates="user")

class Post(Base):
    __tablename__ = "post"

    id: Mapped[str] = mapped_column(primary_key=True)
    body: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(onupdate=func.now())
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"))

    user: Mapped["User"] = relationship(back_populates="posts")
    comments: Mapped[list["Comment"]] = relationship(back_populates="post")
    likes: Mapped[list["Like"]] = relationship(back_populates="post")

class Follow(Base):
    __tablename__ = "follow"

    follower_id: Mapped[str] = mapped_column(ForeignKey("user.id"), primary_key=True)
    following_id: Mapped[str] = mapped_column(ForeignKey("user.id"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    follower: Mapped["User"] = relationship(foreign_keys=[follower_id], back_populates="following")
    following: Mapped["User"] = relationship(foreign_keys=[following_id], back_populates="followers")

class Like(Base):
    __tablename__ = "like"

    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"), primary_key=True)
    post_id: Mapped[str] = mapped_column(ForeignKey("post.id"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="likes")
    post: Mapped["Post"] = relationship(back_populates="likes")

class Comment(Base):
    __tablename__ = "comment"

    id: Mapped[str] = mapped_column(primary_key=True)
    body: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(onupdate=func.now())
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"))
    post_id: Mapped[str] = mapped_column(ForeignKey("post.id"))

    __table_args__ = (
        Index("idx_user_id", "user_id"),
        Index("idx_post_id", "post_id"),
    )

    user: Mapped["User"] = relationship(back_populates="comments")
    post: Mapped["Post"] = relationship(back_populates="comments")

class Notification(Base):
    __tablename__ = "notification"

    id: Mapped[str] = mapped_column(primary_key=True)
    body: Mapped[str]
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        Index("idx_user_id", "user_id"),
    )

    user: Mapped["User"] = relationship(back_populates="notifications")
