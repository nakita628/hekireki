from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime

from .base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    organization_id: Mapped[int] = mapped_column(Integer, ForeignKey("organizations.id"), nullable=False)

    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)

    name: Mapped[str] = mapped_column(String, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, onupdate=func.now())

    organization: Mapped["Organization"] = relationship("Organization", back_populates="users")

    user_roles: Mapped[list["UserRole"]] = relationship("UserRole", back_populates="user")

    audit_logs: Mapped[list["AuditLog"]] = relationship("AuditLog", back_populates="user")
