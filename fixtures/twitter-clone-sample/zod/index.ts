import * as z from 'zod'

export const UserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  username: z.string(),
  bio: z.string().optional().default(''),
  email: z.email(),
  emailVerified: z.date().nullable(),
  image: z.url().nullable(),
  coverImage: z.url().nullable(),
  profileImage: z.url().nullable(),
  hashedPassword: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  hasNotification: z.boolean().default(false),
})

export type User = z.infer<typeof UserSchema>

export const PostSchema = z.object({
  id: z.uuid(),
  body: z.string().min(1).max(1000),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  userId: z.uuid(),
})

export type Post = z.infer<typeof PostSchema>

export const FollowSchema = z.object({
  followerId: z.uuid(),
  followingId: z.uuid(),
  createdAt: z.iso.datetime(),
})

export type Follow = z.infer<typeof FollowSchema>

export const LikeSchema = z.object({
  userId: z.uuid(),
  postId: z.uuid(),
  createdAt: z.iso.datetime(),
})

export type Like = z.infer<typeof LikeSchema>

export const CommentSchema = z.object({
  id: z.uuid(),
  body: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  userId: z.uuid(),
  postId: z.uuid(),
})

export type Comment = z.infer<typeof CommentSchema>

export const NotificationSchema = z.object({
  id: z.uuid(),
  body: z.string(),
  userId: z.uuid(),
  createdAt: z.iso.datetime(),
})

export type Notification = z.infer<typeof NotificationSchema>
