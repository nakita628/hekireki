from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime

from .base import Base


class Follow(Base):
    __tablename__ = "follow"

    follower_id: Mapped[str] = mapped_column(String, ForeignKey("user.id"), primary_key=True)

    following_id: Mapped[str] = mapped_column(String, ForeignKey("user.id"), primary_key=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    follower: Mapped["User"] = relationship("User", foreign_keys=[follower_id], back_populates="following")

    following: Mapped["User"] = relationship("User", foreign_keys=[following_id], back_populates="followers")
