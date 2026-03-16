from sqlalchemy import Enum, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from typing import Optional
from datetime import datetime


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "user"

    id: Mapped[str] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(unique=True)
    password_hash: Mapped[Optional[str]]
    name: Mapped[str]
    avatar_url: Mapped[Optional[str]]
    role: Mapped[str] = mapped_column(Enum("ADMIN", "USER", "GUEST", name="role"), default="USER")
    email_verified: Mapped[bool] = mapped_column(default=False)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(onupdate=func.now())
    last_login_at: Mapped[Optional[datetime]]

    oauth_accounts: Mapped[list["OAuthAccount"]] = relationship(back_populates="user")
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(back_populates="user")
    email_verifications: Mapped[list["EmailVerification"]] = relationship(back_populates="user")
    password_resets: Mapped[list["PasswordReset"]] = relationship(back_populates="user")
    two_factor_setting: Mapped["TwoFactorSetting"] = relationship(back_populates="user", uselist=False)

class OAuthAccount(Base):
    __tablename__ = "oauth_account"

    id: Mapped[str] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"))
    provider: Mapped[str] = mapped_column(Enum("GOOGLE", "GITHUB", "FACEBOOK", "TWITTER", "APPLE", name="oauth_provider"))
    provider_account_id: Mapped[str]
    access_token: Mapped[Optional[str]]
    refresh_token: Mapped[Optional[str]]
    expires_at: Mapped[Optional[datetime]]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        UniqueConstraint("provider", "provider_account_id"),
    )

    user: Mapped["User"] = relationship(back_populates="oauth_accounts")

class TwoFactorSetting(Base):
    __tablename__ = "two_factor_setting"

    id: Mapped[str] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"), unique=True)
    enabled: Mapped[bool] = mapped_column(default=False)
    method: Mapped[Optional[str]] = mapped_column(Enum("TOTP", "SMS", "EMAIL", name="two_factor_method"))
    totp_secret: Mapped[Optional[str]]
    phone_number: Mapped[Optional[str]]
    backup_codes: Mapped[Optional[str]]
    verified_at: Mapped[Optional[datetime]]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(onupdate=func.now())

    user: Mapped["User"] = relationship(back_populates="two_factor_setting")

class RefreshToken(Base):
    __tablename__ = "refresh_token"

    id: Mapped[str] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"))
    token_hash: Mapped[str] = mapped_column(unique=True)
    device_info: Mapped[Optional[str]]
    ip_address: Mapped[Optional[str]]
    expires_at: Mapped[datetime]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    revoked: Mapped[bool] = mapped_column(default=False)

    user: Mapped["User"] = relationship(back_populates="refresh_tokens")

class EmailVerification(Base):
    __tablename__ = "email_verification"

    id: Mapped[str] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"))
    token_hash: Mapped[str] = mapped_column(unique=True)
    expires_at: Mapped[datetime]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="email_verifications")

class PasswordReset(Base):
    __tablename__ = "password_reset"

    id: Mapped[str] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"))
    token_hash: Mapped[str] = mapped_column(unique=True)
    expires_at: Mapped[datetime]
    used: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="password_resets")
