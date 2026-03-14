from sqlalchemy import DateTime, Enum, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime

from .base import Base


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    name: Mapped[str] = mapped_column(String, nullable=False)

    slug: Mapped[str] = mapped_column(String, unique=True, nullable=False)

    status: Mapped[str] = mapped_column(Enum("ACTIVE", "INACTIVE", "SUSPENDED", name="org_status"), nullable=False, default="ACTIVE")

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, onupdate=func.now())

    users: Mapped[list["User"]] = relationship("User", back_populates="organization")
