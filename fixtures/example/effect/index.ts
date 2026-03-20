import { Schema } from 'effect'

export const UserSchema = Schema.Struct({
  /**

   * Primary key

   */
  id: Schema.UUID,
  /**

   * Display name

   */
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(50)),
})

export type UserEncoded = typeof UserSchema.Encoded

export const PostSchema = Schema.Struct({
  /**

   * Primary key

   */
  id: Schema.UUID,
  /**

   * Article title

   */
  title: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
  /**

   * Body content (no length limit)

   */
  content: Schema.String,
  /**

   * Foreign key referencing User.id

   */
  userId: Schema.UUID,
})

export type PostEncoded = typeof PostSchema.Encoded
