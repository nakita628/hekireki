import * as v from 'valibot'

export const UserSchema = v.object({
  id: v.string(),
  email: v.string(),
  name: v.exactOptional(v.string()),
  age: v.exactOptional(v.number()),
  isActive: v.boolean(),
  role: v.picklist(['ADMIN', 'MEMBER', 'GUEST']),
  createdAt: v.date(),
  updatedAt: v.date(),
})

export type User = v.InferOutput<typeof UserSchema>

export const PostSchema = v.object({
  id: v.string(),
  title: v.string(),
  content: v.string(),
  published: v.boolean(),
  createdAt: v.date(),
  updatedAt: v.date(),
  authorId: v.string(),
})

export type Post = v.InferOutput<typeof PostSchema>

export const ProfileSchema = v.object({
  id: v.string(),
  bio: v.exactOptional(v.string()),
  avatar: v.exactOptional(v.string()),
  userId: v.string(),
})

export type Profile = v.InferOutput<typeof ProfileSchema>

export const TagSchema = v.object({
  id: v.string(),
  name: v.string(),
})

export type Tag = v.InferOutput<typeof TagSchema>

export const UserRelationsSchema = v.object({
  ...UserSchema.entries,
  posts: v.array(PostSchema),
  profile: ProfileSchema,
})

export type UserRelations = v.InferOutput<typeof UserRelationsSchema>

export const PostRelationsSchema = v.object({
  ...PostSchema.entries,
  author: UserSchema,
  tags: v.array(TagSchema),
})

export type PostRelations = v.InferOutput<typeof PostRelationsSchema>

export const ProfileRelationsSchema = v.object({
  ...ProfileSchema.entries,
  user: UserSchema,
})

export type ProfileRelations = v.InferOutput<typeof ProfileRelationsSchema>

export const TagRelationsSchema = v.object({
  ...TagSchema.entries,
  posts: v.array(PostSchema),
})

export type TagRelations = v.InferOutput<typeof TagRelationsSchema>
