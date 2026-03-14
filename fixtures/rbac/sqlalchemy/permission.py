from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional
from datetime import datetime

from .base import Base


class Permission(Base):
    __tablename__ = "permissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    resource: Mapped[str] = mapped_column(String, nullable=False)

    action: Mapped[str] = mapped_column(String, nullable=False)

    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    role_permissions: Mapped[list["RolePermission"]] = relationship("RolePermission", back_populates="permission")
