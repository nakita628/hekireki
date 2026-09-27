from pydantic import BaseModel, ConfigDict, EmailStr, JsonValue, StringConstraints, UUID4, UUID7
from typing import Annotated, Literal
from decimal import Decimal
from datetime import datetime
from uuid import UUID


class User(BaseModel):
    id: UUID7
    email: EmailStr
    name: Annotated[str, StringConstraints(min_length=1, max_length=50)]
    role: Literal["ADMIN", "EDITOR", "VIEWER"]
    interests: list[str]
    createdAt: datetime
    updatedAt: datetime


class Profile(BaseModel):
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
    id: UUID4
    title: Annotated[str, StringConstraints(min_length=1, max_length=100)]
    content: str | None = None
    visibility: Literal["PUBLIC", "PRIVATE", "LINK_ONLY"]
    published: bool
    viewCount: int
    authorId: str
    createdAt: datetime


class Tag(BaseModel):
    id: int
    label: str


class Comment(BaseModel):
    id: int
    body: str
    postId: str
    authorId: str | None = None
    createdAt: datetime


class Follow(BaseModel):
    followerId: str
    followingId: str
    since: datetime


class Category(BaseModel):
    id: int
    name: str
    parentId: int | None = None


class Order(BaseModel):
    id: int
    userId: str
    total: Decimal
    placedAt: datetime


class OrderItem(BaseModel):
    id: int
    orderId: int
    sku: str
    qty: int
    price: Decimal


class AuditLog(BaseModel):
    id: UUID
    action: str
    payload: JsonValue
    signature: bytes | None = None
    loggedAt: datetime


class Actor(BaseModel):
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
