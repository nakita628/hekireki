from sqlalchemy import BigInteger, Column, Enum, ForeignKey, Index, Integer, JSON, String, Table, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from typing import Any, Optional
from decimal import Decimal as DecimalType
from datetime import datetime
import uuid as uuid_mod


class Base(DeclarativeBase):
    pass

follows = Table(
    "_Follows",
    Base.metadata,
    Column("A", Integer, ForeignKey("accounts.id", ondelete="CASCADE", onupdate="CASCADE"), primary_key=True),
    Column("B", Integer, ForeignKey("accounts.id", ondelete="CASCADE", onupdate="CASCADE"), primary_key=True),
    Index("_Follows_B_index", "B"),
)

category_to_product = Table(
    "_CategoryToProduct",
    Base.metadata,
    Column("A", Integer, ForeignKey("categories.id", ondelete="CASCADE", onupdate="CASCADE"), primary_key=True),
    Column("B", String, ForeignKey("products.id", ondelete="CASCADE", onupdate="CASCADE"), primary_key=True),
    Index("_CategoryToProduct_B_index", "B"),
)


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(unique=True)
    role: Mapped[str] = mapped_column(Enum("MEMBER", "admin", "owner", name="role"), default="MEMBER")
    metadata_: Mapped[Optional[dict[str, Any]]] = mapped_column("metadata", JSON(none_as_null=True))
    registry_: Mapped[Optional[str]] = mapped_column("registry")
    class_: Mapped[Optional[str]] = mapped_column("class")
    locale: Mapped[str] = mapped_column(default="en")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(default=func.now(), onupdate=func.now())
    manager_id: Mapped[Optional[int]] = mapped_column(ForeignKey("accounts.id", ondelete="SET NULL", onupdate="CASCADE"))

    manager: Mapped[Optional["Account"]] = relationship(remote_side=[id], back_populates="reports")
    reports: Mapped[list["Account"]] = relationship(back_populates="manager")
    orders: Mapped[list["Order"]] = relationship(passive_deletes="all", back_populates="account")
    searches: Mapped[list["Search"]] = relationship(cascade="all, delete", passive_deletes=True, back_populates="account")
    sent: Mapped[list["Transfer"]] = relationship(foreign_keys="Transfer.from_id", passive_deletes="all", back_populates="from_")
    received: Mapped[list["Transfer"]] = relationship(foreign_keys="Transfer.to_id", passive_deletes="all", back_populates="to")
    profile: Mapped[Optional["Profile"]] = relationship(cascade="all, delete", passive_deletes=True, back_populates="account")
    following: Mapped[list["Account"]] = relationship(secondary=follows, primaryjoin=lambda: Account.id == follows.c.B, secondaryjoin=lambda: Account.id == follows.c.A, back_populates="followers")
    followers: Mapped[list["Account"]] = relationship(secondary=follows, primaryjoin=lambda: Account.id == follows.c.A, secondaryjoin=lambda: Account.id == follows.c.B, back_populates="following")

class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[str] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE", onupdate="CASCADE"), unique=True)
    bio: Mapped[Optional[str]]
    avatar: Mapped[Optional[bytes]]

    account: Mapped["Account"] = relationship(back_populates="profile")

class Product(Base):
    __tablename__ = "products"

    id: Mapped[str] = mapped_column(primary_key=True, default=lambda: str(uuid_mod.uuid4()))
    sku: Mapped[str] = mapped_column(unique=True)
    name: Mapped[str]
    price: Mapped[DecimalType]
    weight: Mapped[Optional[float]]
    stock: Mapped[int] = mapped_column(default=0)
    views: Mapped[int] = mapped_column(BigInteger, default=0)
    active: Mapped[bool] = mapped_column(default=True)
    attributes: Mapped[dict[str, Any]] = mapped_column(JSON)
    thumbnail: Mapped[Optional[bytes]]
    released_at: Mapped[Optional[datetime]]
    type: Mapped[str] = mapped_column(default="physical")

    __table_args__ = (
        Index("products_name_idx", "name"),
    )

    lines: Mapped[list["OrderLine"]] = relationship(passive_deletes="all", back_populates="product")
    categories: Mapped[list["Category"]] = relationship(secondary=category_to_product, back_populates="products")

class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str]
    parent_id: Mapped[Optional[int]] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE", onupdate="CASCADE"))

    __table_args__ = (
        UniqueConstraint("parent_id", "name"),
    )

    parent: Mapped[Optional["Category"]] = relationship(remote_side=[id], back_populates="children")
    children: Mapped[list["Category"]] = relationship(cascade="all, delete", passive_deletes=True, back_populates="parent")
    products: Mapped[list["Product"]] = relationship(secondary=category_to_product, back_populates="categories")

class Order(Base):
    __tablename__ = "Order"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    status: Mapped[str] = mapped_column(Enum("pending", "paid", "cancelled", name="order_status"), default="pending")
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT", onupdate="CASCADE"))
    note: Mapped[Optional[str]]
    placed_at: Mapped[datetime] = mapped_column(server_default=func.now())

    __table_args__ = (
        Index("orders_by_account", "account_id", "status"),
    )

    account: Mapped["Account"] = relationship(back_populates="orders")
    lines: Mapped[list["OrderLine"]] = relationship(cascade="all, delete", passive_deletes=True, back_populates="order")

class OrderLine(Base):
    __tablename__ = "order_lines"

    order_id: Mapped[int] = mapped_column(ForeignKey("Order.id", ondelete="CASCADE", onupdate="CASCADE"), primary_key=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT", onupdate="CASCADE"), primary_key=True)
    quantity: Mapped[int] = mapped_column(default=1)
    unit_price: Mapped[DecimalType]

    order: Mapped["Order"] = relationship(back_populates="lines")
    product: Mapped["Product"] = relationship(back_populates="lines")

class Search(Base):
    __tablename__ = "searches"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    query: Mapped[str]
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE", onupdate="CASCADE"))

    __table_args__ = (
        UniqueConstraint("account_id", "query"),
    )

    account: Mapped["Account"] = relationship(back_populates="searches")

class Transfer(Base):
    __tablename__ = "transfers"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    amount: Mapped[DecimalType]
    from_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="NO ACTION", onupdate="CASCADE"))
    to_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="SET DEFAULT", onupdate="CASCADE"), default=1)

    from_: Mapped["Account"] = relationship(foreign_keys=[from_id], back_populates="sent")
    to: Mapped["Account"] = relationship(foreign_keys=[to_id], back_populates="received")
