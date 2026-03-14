from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional
from datetime import datetime

from .base import Base


class LoginHistory(Base):
    __tablename__ = "login_histories"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)

    ip_address: Mapped[str] = mapped_column(String, nullable=False)

    user_agent: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    success: Mapped[bool] = mapped_column(Boolean, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="login_histories")
