from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional
from datetime import datetime

from .base import Base


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)

    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, onupdate=func.now())

    user_roles: Mapped[list["UserRole"]] = relationship("UserRole", back_populates="role")

    role_permissions: Mapped[list["RolePermission"]] = relationship("RolePermission", back_populates="role")
