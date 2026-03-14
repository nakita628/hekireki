from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime

from .base import Base


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    body: Mapped[str] = mapped_column(String, nullable=False)

    post_id: Mapped[int] = mapped_column(Integer, ForeignKey("posts.id"), nullable=False)

    author_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    post: Mapped["Post"] = relationship("Post", back_populates="comments")

    author: Mapped["User"] = relationship("User", back_populates="comments")
