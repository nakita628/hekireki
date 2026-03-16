from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime

from .base import Base


class PasswordResetToken(Base):
    __tablename__ = "password_reset_token"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    email: Mapped[str] = mapped_column(String, nullable=False)

    token: Mapped[str] = mapped_column(String, unique=True, nullable=False)

    expires: Mapped[datetime] = mapped_column(DateTime, nullable=False)
