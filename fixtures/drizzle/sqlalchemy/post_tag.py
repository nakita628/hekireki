from sqlalchemy import DateTime, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime

from .base import Base


class PostTag(Base):
    __tablename__ = "post_tags"

    post_id: Mapped[int] = mapped_column(Integer, ForeignKey("posts.id"), primary_key=True)

    tag_id: Mapped[int] = mapped_column(Integer, ForeignKey("tags.id"), primary_key=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())

    post: Mapped["Post"] = relationship("Post", back_populates="post_tags")

    tag: Mapped["Tag"] = relationship("Tag", back_populates="post_tags")
