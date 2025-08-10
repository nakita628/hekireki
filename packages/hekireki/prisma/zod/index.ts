import * as z from 'zod'

export const UserSchema = z.object({
  /**
   * Primary key
   */
  id: z.uuid(),
  /**
   * Display name
   */
  name: z.string().min(1).max(50),
})

export const UserRelationsSchema = z.object({
  ...UserSchema.shape,
  user: UserSchema,
})

export type User = z.infer<typeof UserSchema>

export type UserRelations = z.infer<typeof UserRelationsSchema>

export const PostSchema = z.object({
  /**
   * Primary key
   */
  id: z.uuid(),
  /**
   * Article title
   */
  title: z.string().min(1).max(100),
  /**
   * Body content (no length limit)
   */
  content: z.string(),
  /**
   * Foreign key referencing User.id
   */
  userId: z.uuid(),
})

export const PostRelationsSchema = z.object({
  ...PostSchema.shape,
  posts: z.array(PostSchema),
})

export type Post = z.infer<typeof PostSchema>

export type PostRelations = z.infer<typeof PostRelationsSchema>
