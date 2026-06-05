import { Schema } from 'effect'

export const UserSchema = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
  age: Schema.Number,
  isActive: Schema.Boolean,
  role: Schema.Literal('ADMIN', 'MEMBER', 'GUEST'),
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
})

export type User = typeof UserSchema.Type

export const PostSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  content: Schema.String,
  published: Schema.Boolean,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
  authorId: Schema.String,
})

export type Post = typeof PostSchema.Type

export const ProfileSchema = Schema.Struct({
  id: Schema.String,
  bio: Schema.String,
  avatar: Schema.String,
  userId: Schema.String,
})

export type Profile = typeof ProfileSchema.Type

export const TagSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
})

export type Tag = typeof TagSchema.Type
