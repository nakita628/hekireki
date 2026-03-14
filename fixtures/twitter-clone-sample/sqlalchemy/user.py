from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional
from datetime import datetime

from .base import Base


class User(Base):
    __tablename__ = "user"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    name: Mapped[str] = mapped_column(String, nullable=False)

    username: Mapped[str] = mapped_column(String, unique=True, nullable=False)

    bio: Mapped[Optional[str]] = mapped_column(String, nullable=True, default="")

    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)

    email_verified: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    image: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    cover_image: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    profile_image: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    hashed_password: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, onupdate=func.now())

    has_notification: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, default=False)

    posts: Mapped[list["Post"]] = relationship("Post", back_populates="user")

    comments: Mapped[list["Comment"]] = relationship("Comment", back_populates="user")

    notifications: Mapped[list["Notification"]] = relationship("Notification", back_populates="user")

    followers: Mapped[list["Follow"]] = relationship("Follow", foreign_keys="Follow.following_id", back_populates="following")

    following: Mapped[list["Follow"]] = relationship("Follow", foreign_keys="Follow.follower_id", back_populates="follower")

    likes: Mapped[list["Like"]] = relationship("Like", back_populates="user")
