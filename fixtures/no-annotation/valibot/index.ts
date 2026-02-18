import * as v from 'valibot'

export const UserSchema = v.object({
  id: v.string(),
  email: v.string(),
  name: v.string(),
  age: v.number(),
  isActive: v.boolean(),
  role: v.picklist(['ADMIN', 'MEMBER', 'GUEST']),
  createdAt: v.date(),
  updatedAt: v.date(),
})

export type User = v.InferInput<typeof UserSchema>

export const PostSchema = v.object({
  id: v.string(),
  title: v.string(),
  content: v.string(),
  published: v.boolean(),
  createdAt: v.date(),
  updatedAt: v.date(),
  authorId: v.string(),
})

export type Post = v.InferInput<typeof PostSchema>

export const ProfileSchema = v.object({
  id: v.string(),
  bio: v.string(),
  avatar: v.string(),
  userId: v.string(),
})

export type Profile = v.InferInput<typeof ProfileSchema>

export const TagSchema = v.object({
  id: v.string(),
  name: v.string(),
})

export type Tag = v.InferInput<typeof TagSchema>

export const UserRelationsSchema = v.object({
  ...UserSchema.entries,
  posts: v.array(PostSchema),
  profile: ProfileSchema,
})

export type UserRelations = v.InferInput<typeof UserRelationsSchema>

export const PostRelationsSchema = v.object({
  ...PostSchema.entries,
  author: UserSchema,
  tags: v.array(TagSchema),
})

export type PostRelations = v.InferInput<typeof PostRelationsSchema>

export const ProfileRelationsSchema = v.object({
  ...ProfileSchema.entries,
  user: UserSchema,
})

export type ProfileRelations = v.InferInput<typeof ProfileRelationsSchema>

export const TagRelationsSchema = v.object({
  ...TagSchema.entries,
  posts: v.array(PostSchema),
})

export type TagRelations = v.InferInput<typeof TagRelationsSchema>
