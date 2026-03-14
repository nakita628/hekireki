from sqlalchemy import Boolean, DateTime, Enum, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional
from datetime import datetime

from .base import Base


class User(Base):
    __tablename__ = "user"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)

    name: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    age: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    role: Mapped[str] = mapped_column(Enum("ADMIN", "MEMBER", "GUEST", name="role"), nullable=False, default="MEMBER")

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, onupdate=func.now())

    posts: Mapped[list["Post"]] = relationship("Post", back_populates="author")

    profile: Mapped["Profile"] = relationship("Profile", back_populates="user", uselist=False)
