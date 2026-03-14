from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime

from .base import Base


class Notification(Base):
    __tablename__ = "notification"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    body: Mapped[str] = mapped_column(String, nullable=False)

    user_id: Mapped[str] = mapped_column(String, ForeignKey("user.id"), nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="notifications")
