import * as z from 'zod'

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
})

export const PostSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  userId: z.string(),
})

export const UserRelationsSchema = z.object({
  ...UserSchema.shape,
  posts: z.array(PostSchema),
})

export const PostRelationsSchema = z.object({
  ...PostSchema.shape,
  user: UserSchema,
})
