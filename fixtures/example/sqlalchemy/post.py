from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Post(Base):
    __tablename__ = "post"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    title: Mapped[str] = mapped_column(String, nullable=False)

    content: Mapped[str] = mapped_column(String, nullable=False)

    user_id: Mapped[str] = mapped_column(String, ForeignKey("user.id"), nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="posts")
