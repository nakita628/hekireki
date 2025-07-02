import { z } from 'zod/v4'

export const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  username: z.string(),
  bio: z.string().optional().default(''),
  email: z.string().email(),
  emailVerified: z.date().nullable(),
  image: z.string().url().nullable(),
  coverImage: z.string().url().nullable(),
  profileImage: z.string().url().nullable(),
  hashedPassword: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  hasNotification: z.boolean().default(false),
})

export const PostSchema = z.object({
  id: z.string().uuid(),
  body: z.string().min(1).max(1000),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  userId: z.string().uuid(),
})

export const FollowSchema = z.object({
  id: z.string().uuid(),
  followerId: z.string().uuid(),
  followingId: z.string().uuid(),
  createdAt: z.date(),
})

export const LikeSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  postId: z.uuid(),
  createdAt: z.datetime(),
})

export const CommentSchema = z.object({
  id: z.uuid(),
  body: z.string(),
  createdAt: z.datetime(),
  updatedAt: z.datetime(),
  userId: z.uuid(),
  postId: z.uuid(),
})

export const NotificationSchema = z.object({
  id: z.uuid(),
  body: z.string(),
  userId: z.uuid(),
  createdAt: z.datetime(),
})
