import { Type } from '@sinclair/typebox'

export const UserSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  username: Type.String(),
  bio: Type.Optional(Type.String()),
  email: Type.String(),
  emailVerified: Type.Optional(Type.Date()),
  image: Type.Optional(Type.String()),
  coverImage: Type.Optional(Type.String()),
  profileImage: Type.Optional(Type.String()),
  hashedPassword: Type.Optional(Type.String()),
  createdAt: Type.Date(),
  updatedAt: Type.Date(),
  hasNotification: Type.Optional(Type.Boolean()),
})

export const PostSchema = Type.Object({
  id: Type.String(),
  body: Type.String(),
  createdAt: Type.Date(),
  updatedAt: Type.Date(),
  userId: Type.String(),
})

export const FollowSchema = Type.Object({
  followerId: Type.String(),
  followingId: Type.String(),
  createdAt: Type.Date(),
})

export const LikeSchema = Type.Object({
  userId: Type.String(),
  postId: Type.String(),
  createdAt: Type.Date(),
})

export const CommentSchema = Type.Object({
  id: Type.String(),
  body: Type.String(),
  createdAt: Type.Date(),
  updatedAt: Type.Date(),
  userId: Type.String(),
  postId: Type.String(),
})

export const NotificationSchema = Type.Object({
  id: Type.String(),
  body: Type.String(),
  userId: Type.String(),
  createdAt: Type.Date(),
})
