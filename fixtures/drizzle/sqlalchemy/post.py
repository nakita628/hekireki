from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime

from .base import Base


class Post(Base):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    title: Mapped[str] = mapped_column(String, nullable=False)

    slug: Mapped[str] = mapped_column(String, unique=True, nullable=False)

    content: Mapped[str] = mapped_column(String, nullable=False)

    status: Mapped[str] = mapped_column(Enum("DRAFT", "PUBLISHED", "ARCHIVED", name="post_status"), nullable=False, default="DRAFT")

    views: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    author_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, onupdate=func.now())

    author: Mapped["User"] = relationship("User", back_populates="posts")

    comments: Mapped[list["Comment"]] = relationship("Comment", back_populates="post")

    post_tags: Mapped[list["PostTag"]] = relationship("PostTag", back_populates="post")
