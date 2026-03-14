from sqlalchemy import DateTime, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime

from .base import Base


class UserRole(Base):
    __tablename__ = "user_roles"

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), primary_key=True)

    role_id: Mapped[int] = mapped_column(Integer, ForeignKey("roles.id"), primary_key=True)

    assigned_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    user: Mapped["User"] = relationship("User", back_populates="user_roles")

    role: Mapped["Role"] = relationship("Role", back_populates="user_roles")
