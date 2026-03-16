from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class TwoFactorConfirmation(Base):
    __tablename__ = "two_factor_confirmation"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    user_id: Mapped[str] = mapped_column(String, ForeignKey("user.id"), unique=True, nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="two_factor_confirmation")
