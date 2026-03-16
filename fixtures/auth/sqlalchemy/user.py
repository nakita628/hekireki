from sqlalchemy import Boolean, DateTime, Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional
from datetime import datetime

from .base import Base


class User(Base):
    __tablename__ = "user"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    name: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    email: Mapped[Optional[str]] = mapped_column(String, unique=True, nullable=True)

    email_verified: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    image: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    password: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    role: Mapped[str] = mapped_column(Enum("ADMIN", "USER", name="user_role"), nullable=False, default="USER")

    is_two_factor_enabled: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, default=False)

    accounts: Mapped[list["Account"]] = relationship("Account", back_populates="user")

    two_factor_confirmation: Mapped["TwoFactorConfirmation"] = relationship("TwoFactorConfirmation", back_populates="user", uselist=False)
