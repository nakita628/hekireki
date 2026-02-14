import * as v from 'valibot'

export const UserRelationsSchema = v.object({
  ...UserSchema.entries,
  posts: v.array(PostSchema),
})

export const PostRelationsSchema = v.object({
  ...PostSchema.entries,
  user: UserSchema,
})
