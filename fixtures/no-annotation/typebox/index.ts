import { type Static, Type } from '@sinclair/typebox'

export const UserSchema = Type.Object({
  id: Type.String(),
  email: Type.String(),
  name: Type.Optional(Type.String()),
  age: Type.Optional(Type.Integer()),
  isActive: Type.Boolean(),
  role: Type.Union([Type.Literal('ADMIN'), Type.Literal('MEMBER'), Type.Literal('GUEST')]),
  createdAt: Type.Date(),
  updatedAt: Type.Date(),
})

export type User = Static<typeof UserSchema>

export const PostSchema = Type.Object({
  id: Type.String(),
  title: Type.String(),
  content: Type.String(),
  published: Type.Boolean(),
  createdAt: Type.Date(),
  updatedAt: Type.Date(),
  authorId: Type.String(),
})

export type Post = Static<typeof PostSchema>

export const ProfileSchema = Type.Object({
  id: Type.String(),
  bio: Type.Optional(Type.String()),
  avatar: Type.Optional(Type.String()),
  userId: Type.String(),
})

export type Profile = Static<typeof ProfileSchema>

export const TagSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
})

export type Tag = Static<typeof TagSchema>

export const UserRelationsSchema = Type.Object({
  ...UserSchema.properties,
  posts: Type.Array(PostSchema),
  profile: ProfileSchema,
})

export type UserRelations = Static<typeof UserRelationsSchema>

export const PostRelationsSchema = Type.Object({
  ...PostSchema.properties,
  author: UserSchema,
  tags: Type.Array(TagSchema),
})

export type PostRelations = Static<typeof PostRelationsSchema>

export const ProfileRelationsSchema = Type.Object({
  ...ProfileSchema.properties,
  user: UserSchema,
})

export type ProfileRelations = Static<typeof ProfileRelationsSchema>

export const TagRelationsSchema = Type.Object({
  ...TagSchema.properties,
  posts: Type.Array(PostSchema),
})

export type TagRelations = Static<typeof TagRelationsSchema>
