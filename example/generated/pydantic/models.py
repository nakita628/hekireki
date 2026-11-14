from pydantic import BaseModel, ConfigDict, EmailStr, JsonValue, StringConstraints, UUID4, UUID7
from typing import Annotated, Literal
from decimal import Decimal
from datetime import datetime
from uuid import UUID


class User(BaseModel):
    """Application user. Fully annotated for every validator generator,
    with a UUIDv7 primary key, enum default, scalar list, @map columns,
    @updatedAt, and relations of every cardinality.
    """

    id: UUID7
    """Primary key (UUIDv7)"""
    email: EmailStr
    """Unique login email"""
    name: Annotated[str, StringConstraints(min_length=1, max_length=50)]
    """Display name"""
    role: Literal["ADMIN", "EDITOR", "VIEWER"]
    interests: list[str]
    createdAt: datetime
    updatedAt: datetime


class Profile(BaseModel):
    """One-to-one relation with native @db.* types, literal defaults,
    and optional scalars of every flavour. ConfigDict passthrough: the
    Pydantic model rejects unknown keys (extra='forbid').
    """

    model_config = ConfigDict(extra='forbid')

    id: str
    userId: str
    bio: str | None = None
    nickname: str
    age: int | None = None
    balance: Decimal
    verified: bool
    meta: JsonValue | None = None
    avatar: bytes | None = None
    lastSeen: datetime | None = None


class Post(BaseModel):
    """@@map + @map column names, FK with a referential action,
    mapped-enum default, and an implicit many-to-many to Tag.
    """

    id: UUID4
    """Primary key"""
    title: Annotated[str, StringConstraints(min_length=1, max_length=100)]
    """Article title"""
    content: str | None = None
    visibility: Literal["PUBLIC", "PRIVATE", "LINK_ONLY"]
    published: bool
    viewCount: int
    authorId: str
    createdAt: datetime


class Tag(BaseModel):
    """Implicit many-to-many partner of Post (join table `_PostToTag`)."""

    id: int
    label: str


class Comment(BaseModel):
    """Two foreign keys with different referential actions
    (Cascade vs SetNull) and a composite index.
    """

    id: int
    body: str
    postId: str
    authorId: str | None = None
    createdAt: datetime


class Follow(BaseModel):
    """Composite primary key + two named relations to the same model."""

    followerId: str
    followingId: str
    since: datetime


class Category(BaseModel):
    """Self-relation (adjacency-list tree) with a composite unique."""

    id: int
    name: str
    parentId: int | None = None


class Order(BaseModel):
    """BigInt autoincrement primary key (bigserial) and money as Decimal."""

    id: int
    userId: str
    total: Decimal
    placedAt: datetime


class OrderItem(BaseModel):
    """Child of Order with a composite unique constraint."""

    id: int
    orderId: int
    sku: str
    qty: int
    price: Decimal


class AuditLog(BaseModel):
    """DB-side generated defaults (dbgenerated) plus Json / Bytes payloads."""

    id: UUID
    action: str
    payload: JsonValue
    signature: bytes | None = None
    loggedAt: datetime


class Actor(BaseModel):
    """Named implicit many-to-many: the join table is `_cast`,
    not `_ActorToFilm`.
    """

    id: int
    name: str


class Film(BaseModel):
    id: int
    title: str


class UserRelations(User):
    profile: Profile
    posts: list[Post]
    comments: list[Comment]
    orders: list[Order]
    followers: list[Follow]
    following: list[Follow]


class ProfileRelations(Profile):
    user: User


class PostRelations(Post):
    author: User
    tags: list[Tag]
    comments: list[Comment]


class TagRelations(Tag):
    posts: list[Post]


class CommentRelations(Comment):
    post: Post
    author: User


class FollowRelations(Follow):
    follower: User
    following: User


class CategoryRelations(Category):
    parent: Category
    children: list[Category]


class OrderRelations(Order):
    user: User
    items: list[OrderItem]


class OrderItemRelations(OrderItem):
    order: Order


class ActorRelations(Actor):
    films: list[Film]


class FilmRelations(Film):
    actors: list[Actor]
