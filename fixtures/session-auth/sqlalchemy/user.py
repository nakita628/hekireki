from sqlalchemy import Boolean, DateTime, Enum, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime

from .base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)

    password_hash: Mapped[str] = mapped_column(String, nullable=False)

    name: Mapped[str] = mapped_column(String, nullable=False)

    role: Mapped[str] = mapped_column(Enum("ADMIN", "USER", name="role"), nullable=False, default="USER")

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, onupdate=func.now())

    sessions: Mapped[list["Session"]] = relationship("Session", back_populates="user")

    login_histories: Mapped[list["LoginHistory"]] = relationship("LoginHistory", back_populates="user")

    password_histories: Mapped[list["PasswordHistory"]] = relationship("PasswordHistory", back_populates="user")
