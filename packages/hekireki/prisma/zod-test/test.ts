import * as z from 'zod'

export const UserSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(50),
})

export const PostSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(100),
  content: z.string(),
  userId: z.uuid(),
})
