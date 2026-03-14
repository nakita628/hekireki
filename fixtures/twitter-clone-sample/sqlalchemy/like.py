from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime

from .base import Base


class Like(Base):
    __tablename__ = "like"

    user_id: Mapped[str] = mapped_column(String, ForeignKey("user.id"), primary_key=True)

    post_id: Mapped[str] = mapped_column(String, ForeignKey("post.id"), primary_key=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="likes")

    post: Mapped["Post"] = relationship("Post", back_populates="likes")
