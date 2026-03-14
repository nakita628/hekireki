from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional
from datetime import datetime

from .base import Base


class TwoFactorSetting(Base):
    __tablename__ = "two_factor_setting"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    user_id: Mapped[str] = mapped_column(String, ForeignKey("user.id"), unique=True, nullable=False)

    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    method: Mapped[Optional[str]] = mapped_column(Enum("TOTP", "SMS", "EMAIL", name="two_factor_method"), nullable=True)

    totp_secret: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    phone_number: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    backup_codes: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, onupdate=func.now())

    user: Mapped["User"] = relationship("User", back_populates="two_factor_setting")
