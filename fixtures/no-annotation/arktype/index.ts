import { type } from 'arktype'

export const UserSchema = type({
  id: 'string',
  email: 'string',
  name: 'string',
  age: 'number',
  isActive: 'boolean',
  role: "'ADMIN' | 'MEMBER' | 'GUEST'",
  createdAt: 'Date',
  updatedAt: 'Date',
})

export type User = typeof UserSchema.infer

export const PostSchema = type({
  id: 'string',
  title: 'string',
  content: 'string',
  published: 'boolean',
  createdAt: 'Date',
  updatedAt: 'Date',
  authorId: 'string',
})

export type Post = typeof PostSchema.infer

export const ProfileSchema = type({
  id: 'string',
  bio: 'string',
  avatar: 'string',
  userId: 'string',
})

export type Profile = typeof ProfileSchema.infer

export const TagSchema = type({
  id: 'string',
  name: 'string',
})

export type Tag = typeof TagSchema.infer
