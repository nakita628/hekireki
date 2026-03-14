from sqlalchemy import Boolean, DateTime, Enum, Integer, JSON, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional
from decimal import Decimal as DecimalType
from datetime import datetime

from .base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)

    name: Mapped[str] = mapped_column(String, nullable=False)

    bio: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    avatar_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    role: Mapped[str] = mapped_column(Enum("ADMIN", "USER", "GUEST", name="role"), nullable=False, default="USER")

    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    score: Mapped[DecimalType] = mapped_column(Numeric, nullable=False, default=0)

    tags: Mapped[str] = mapped_column(String, nullable=False)

    metadata: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, onupdate=func.now())

    posts: Mapped[list["Post"]] = relationship("Post", back_populates="author")

    comments: Mapped[list["Comment"]] = relationship("Comment", back_populates="author")

    profile: Mapped["Profile"] = relationship("Profile", back_populates="user", uselist=False)
