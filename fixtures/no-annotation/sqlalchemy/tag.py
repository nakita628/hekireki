from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class Tag(Base):
    __tablename__ = "tag"

    id: Mapped[str] = mapped_column(String, primary_key=True)

    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
