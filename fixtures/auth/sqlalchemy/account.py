from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional

from .base import Base


class Account(Base):
    __tablename__ = "account"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    user_id: Mapped[str] = mapped_column(String, ForeignKey("user.id"), nullable=False)

    type: Mapped[str] = mapped_column(String, nullable=False)

    provider: Mapped[str] = mapped_column(String, nullable=False)

    provider_account_id: Mapped[str] = mapped_column(String, nullable=False)

    refresh_token: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    access_token: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    expires_at: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    token_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    scope: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    id_token: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    session_state: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="accounts")
