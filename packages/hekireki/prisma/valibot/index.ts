import * as v from 'valibot'

export const UserSchema = v.object({
  id: v.string(),
  name: v.string(),
})

export const PostSchema = v.object({
  id: v.string(),
  title: v.string(),
  content: v.string(),
  userId: v.string(),
})

export const UserRelationsSchema = v.object({
  ...UserSchema.entries,
  posts: v.array(PostSchema),
})

export const PostRelationsSchema = v.object({
  ...PostSchema.entries,
  user: UserSchema,
})
