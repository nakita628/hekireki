import * as z from 'zod'

export const UserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  age: z.number(),
  isActive: z.boolean(),
  role: z.enum(['ADMIN', 'MEMBER', 'GUEST']),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type User = z.infer<typeof UserSchema>

export const PostSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  published: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  authorId: z.string(),
})

export type Post = z.infer<typeof PostSchema>

export const ProfileSchema = z.object({
  id: z.string(),
  bio: z.string(),
  avatar: z.string(),
  userId: z.string(),
})

export type Profile = z.infer<typeof ProfileSchema>

export const TagSchema = z.object({
  id: z.string(),
  name: z.string(),
})

export type Tag = z.infer<typeof TagSchema>

export const UserRelationsSchema = z.object({
  ...UserSchema.shape,
  posts: z.array(PostSchema),
  profile: ProfileSchema,
})

export type UserRelations = z.infer<typeof UserRelationsSchema>

export const PostRelationsSchema = z.object({
  ...PostSchema.shape,
  author: UserSchema,
  tags: z.array(TagSchema),
})

export type PostRelations = z.infer<typeof PostRelationsSchema>

export const ProfileRelationsSchema = z.object({
  ...ProfileSchema.shape,
  user: UserSchema,
})

export type ProfileRelations = z.infer<typeof ProfileRelationsSchema>

export const TagRelationsSchema = z.object({
  ...TagSchema.shape,
  posts: z.array(PostSchema),
})

export type TagRelations = z.infer<typeof TagRelationsSchema>
