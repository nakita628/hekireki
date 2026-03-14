from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional

from .base import Base


class Profile(Base):
    __tablename__ = "profile"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    bio: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    avatar: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    user_id: Mapped[str] = mapped_column(String, ForeignKey("user.id"), unique=True, nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="profile")
