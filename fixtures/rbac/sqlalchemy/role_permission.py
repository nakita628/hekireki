from sqlalchemy import DateTime, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime

from .base import Base


class RolePermission(Base):
    __tablename__ = "role_permissions"

    role_id: Mapped[int] = mapped_column(Integer, ForeignKey("roles.id"), primary_key=True)

    permission_id: Mapped[int] = mapped_column(Integer, ForeignKey("permissions.id"), primary_key=True)

    assigned_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    role: Mapped["Role"] = relationship("Role", back_populates="role_permissions")

    permission: Mapped["Permission"] = relationship("Permission", back_populates="role_permissions")
