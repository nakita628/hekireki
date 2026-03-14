from sqlalchemy import DateTime, Enum, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional
from datetime import datetime

from .base import Base


class OAuthAccount(Base):
    __tablename__ = "oauth_accounts"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)

    provider: Mapped[str] = mapped_column(Enum("GOOGLE", "GITHUB", "FACEBOOK", "TWITTER", "APPLE", name="oauth_provider"), nullable=False)

    provider_account_id: Mapped[str] = mapped_column(String, nullable=False)

    access_token: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    refresh_token: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="oauth_accounts")
