from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime

from .base import Base


class Post(Base):
    __tablename__ = "post"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    title: Mapped[str] = mapped_column(String, nullable=False)

    content: Mapped[str] = mapped_column(String, nullable=False)

    published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, onupdate=func.now())

    author_id: Mapped[str] = mapped_column(String, ForeignKey("user.id"), nullable=False)

    author: Mapped["User"] = relationship("User", back_populates="posts")
