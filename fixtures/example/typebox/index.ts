import { type Static, Type } from '@sinclair/typebox'

export const UserSchema = Type.Object({
  /** Primary key */
  id: Type.String(),
  /** Display name */
  name: Type.String(),
})

export type User = Static<typeof UserSchema>

export const PostSchema = Type.Object({
  /** Primary key */
  id: Type.String(),
  /** Article title */
  title: Type.String(),
  /** Body content (no length limit) */
  content: Type.String(),
  /** Foreign key referencing User.id */
  userId: Type.String(),
})

export type Post = Static<typeof PostSchema>

export const UserRelationsSchema = Type.Object({
  ...UserSchema.properties,
  posts: Type.Array(PostSchema),
})

export type UserRelations = Static<typeof UserRelationsSchema>

export const PostRelationsSchema = Type.Object({
  ...PostSchema.properties,
  user: UserSchema,
})

export type PostRelations = Static<typeof PostRelationsSchema>
