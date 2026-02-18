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

export type User = Schema.Schema.Type<typeof UserSchema>

export const PostSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  content: Schema.String,
  published: Schema.Boolean,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
  authorId: Schema.String,
})

export type Post = Schema.Schema.Type<typeof PostSchema>

export const ProfileSchema = Schema.Struct({
  id: Schema.String,
  bio: Schema.String,
  avatar: Schema.String,
  userId: Schema.String,
})

export type Profile = Schema.Schema.Type<typeof ProfileSchema>

export const TagSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
})

export type Tag = Schema.Schema.Type<typeof TagSchema>
