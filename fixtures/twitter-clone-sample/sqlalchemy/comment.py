from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime

from .base import Base


class Comment(Base):
    __tablename__ = "comment"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    body: Mapped[str] = mapped_column(String, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, onupdate=func.now())

    user_id: Mapped[str] = mapped_column(String, ForeignKey("user.id"), nullable=False)

    post_id: Mapped[str] = mapped_column(String, ForeignKey("post.id"), nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="comments")

    post: Mapped["Post"] = relationship("Post", back_populates="comments")
