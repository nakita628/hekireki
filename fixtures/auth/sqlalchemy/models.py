from sqlalchemy import Enum, ForeignKey, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from typing import Optional
from datetime import datetime


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "user"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[Optional[str]]
    email: Mapped[Optional[str]] = mapped_column(unique=True)
    email_verified: Mapped[Optional[datetime]]
    image: Mapped[Optional[str]]
    password: Mapped[Optional[str]]
    role: Mapped[str] = mapped_column(Enum("ADMIN", "USER", name="user_role"), default="USER")
    is_two_factor_enabled: Mapped[Optional[bool]] = mapped_column(default=False)

    accounts: Mapped[list["Account"]] = relationship(back_populates="user")
    two_factor_confirmation: Mapped["TwoFactorConfirmation"] = relationship(back_populates="user", uselist=False)

class Account(Base):
    __tablename__ = "account"

    id: Mapped[str] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"))
    type: Mapped[str]
    provider: Mapped[str]
    provider_account_id: Mapped[str]
    refresh_token: Mapped[Optional[str]]
    access_token: Mapped[Optional[str]]
    expires_at: Mapped[Optional[int]]
    token_type: Mapped[Optional[str]]
    scope: Mapped[Optional[str]]
    id_token: Mapped[Optional[str]]
    session_state: Mapped[Optional[str]]

    __table_args__ = (
        UniqueConstraint("provider", "provider_account_id"),
    )

    user: Mapped["User"] = relationship(back_populates="accounts")

class VerificationToken(Base):
    __tablename__ = "verification_token"

    id: Mapped[str] = mapped_column(primary_key=True)
    email: Mapped[str]
    token: Mapped[str] = mapped_column(unique=True)
    expires: Mapped[datetime]

    __table_args__ = (
        UniqueConstraint("email", "token"),
    )

class PasswordResetToken(Base):
    __tablename__ = "password_reset_token"

    id: Mapped[str] = mapped_column(primary_key=True)
    email: Mapped[str]
    token: Mapped[str] = mapped_column(unique=True)
    expires: Mapped[datetime]

    __table_args__ = (
        UniqueConstraint("email", "token"),
    )

class TwoFactorToken(Base):
    __tablename__ = "two_factor_token"

    id: Mapped[str] = mapped_column(primary_key=True)
    email: Mapped[str]
    token: Mapped[str] = mapped_column(unique=True)
    expires: Mapped[datetime]

    __table_args__ = (
        UniqueConstraint("email", "token"),
    )

class TwoFactorConfirmation(Base):
    __tablename__ = "two_factor_confirmation"

    id: Mapped[str] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"), unique=True)

    __table_args__ = (
        UniqueConstraint("user_id"),
    )

    user: Mapped["User"] = relationship(back_populates="two_factor_confirmation")
