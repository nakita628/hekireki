from sqlalchemy import Boolean, DateTime, Enum, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional
from decimal import Decimal as DecimalType
from datetime import datetime

from .base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)

    password_hash: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    name: Mapped[str] = mapped_column(String, nullable=False)

    avatar_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    role: Mapped[str] = mapped_column(Enum("ADMIN", "USER", "GUEST", name="role"), nullable=False, default="USER")

    credit_balance: Mapped[DecimalType] = mapped_column(Numeric, nullable=False, default=0)

    email_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, onupdate=func.now())

    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    oauth_accounts: Mapped[list["OAuthAccount"]] = relationship("OAuthAccount", back_populates="user")

    refresh_tokens: Mapped[list["RefreshToken"]] = relationship("RefreshToken", back_populates="user")

    email_verifications: Mapped[list["EmailVerification"]] = relationship("EmailVerification", back_populates="user")

    password_resets: Mapped[list["PasswordReset"]] = relationship("PasswordReset", back_populates="user")

    two_factor_setting: Mapped["TwoFactorSetting"] = relationship("TwoFactorSetting", back_populates="user", uselist=False)
