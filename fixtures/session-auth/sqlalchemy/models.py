from sqlalchemy import Enum, ForeignKey, Index, String, Uuid, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from typing import Optional
from datetime import datetime
import uuid as uuid_mod


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid_mod.UUID] = mapped_column(Uuid, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str]
    name: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(Enum("ADMIN", "USER", name="role"), default="USER")
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(onupdate=func.now())

    sessions: Mapped[list["Session"]] = relationship(back_populates="user")
    login_histories: Mapped[list["LoginHistory"]] = relationship(back_populates="user")
    password_histories: Mapped[list["PasswordHistory"]] = relationship(back_populates="user")

class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid_mod.UUID] = mapped_column(Uuid, primary_key=True)
    token: Mapped[str] = mapped_column(String(255), unique=True)
    user_id: Mapped[uuid_mod.UUID] = mapped_column(Uuid, ForeignKey("users.id"))
    expires_at: Mapped[datetime]
    ip_address: Mapped[Optional[str]] = mapped_column(String(45))
    user_agent: Mapped[Optional[str]]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        Index("idx_user_id", "user_id"),
        Index("idx_expires_at", "expires_at"),
    )

    user: Mapped["User"] = relationship(back_populates="sessions")

class LoginHistory(Base):
    __tablename__ = "login_histories"

    id: Mapped[uuid_mod.UUID] = mapped_column(Uuid, primary_key=True)
    user_id: Mapped[uuid_mod.UUID] = mapped_column(Uuid, ForeignKey("users.id"))
    ip_address: Mapped[str] = mapped_column(String(45))
    user_agent: Mapped[Optional[str]]
    success: Mapped[bool]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        Index("idx_user_id", "user_id"),
        Index("idx_created_at", "created_at"),
    )

    user: Mapped["User"] = relationship(back_populates="login_histories")

class PasswordHistory(Base):
    __tablename__ = "password_histories"

    id: Mapped[uuid_mod.UUID] = mapped_column(Uuid, primary_key=True)
    user_id: Mapped[uuid_mod.UUID] = mapped_column(Uuid, ForeignKey("users.id"))
    password_hash: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        Index("idx_user_id", "user_id"),
    )

    user: Mapped["User"] = relationship(back_populates="password_histories")
