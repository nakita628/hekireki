import { Schema } from 'effect'

export const UserSchema = Schema.Struct({
  /** Unique identifier for the user */
  id: Schema.UUID,
  /** User's display name */
  name: Schema.String,
  /** Unique username for the user */
  username: Schema.String,
  /** User's biography or profile description */
  bio: Schema.NullOr(Schema.String),
  /** User's unique email address */
  email: Schema.String,
  /** Timestamp of email verification */
  emailVerified: Schema.NullOr(Schema.DateFromString),
  /** URL of user's image */
  image: Schema.NullOr(Schema.String),
  /** URL of user's cover image */
  coverImage: Schema.NullOr(Schema.String),
  /** URL of user's profile image */
  profileImage: Schema.NullOr(Schema.String),
  /** Hashed password for security */
  hashedPassword: Schema.NullOr(Schema.String),
  /** Timestamp when the user was created */
  createdAt: Schema.DateFromString,
  /** Timestamp when the user was last updated */
  updatedAt: Schema.DateFromString,
  /** Flag indicating if user has unread notifications */
  hasNotification: Schema.NullOr(Schema.Boolean),
})

export type User = Schema.Schema.Type<typeof UserSchema>

export const PostSchema = Schema.Struct({
  /** Unique identifier for the post */
  id: Schema.UUID,
  /** Content of the post */
  body: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(1000)),
  /** Timestamp when the post was created */
  createdAt: Schema.DateFromString,
  /** Timestamp when the post was last updated */
  updatedAt: Schema.DateFromString,
  /** ID of the user who created the post */
  userId: Schema.UUID,
})

export type Post = Schema.Schema.Type<typeof PostSchema>

export const FollowSchema = Schema.Struct({
  /** ID of the user who is following */
  followerId: Schema.UUID,
  /** ID of the user being followed */
  followingId: Schema.UUID,
  /** Timestamp when the follow relationship was created */
  createdAt: Schema.DateFromString,
})

export type Follow = Schema.Schema.Type<typeof FollowSchema>

export const LikeSchema = Schema.Struct({
  /** ID of the user who liked the post */
  userId: Schema.UUID,
  /** ID of the post that was liked */
  postId: Schema.UUID,
  /** Timestamp when the like was created */
  createdAt: Schema.DateFromString,
})

export type Like = Schema.Schema.Type<typeof LikeSchema>

export const CommentSchema = Schema.Struct({
  /** Unique identifier for the comment */
  id: Schema.UUID,
  /** Content of the comment */
  body: Schema.String,
  /** Timestamp when the comment was created */
  createdAt: Schema.DateFromString,
  /** Timestamp when the comment was last updated */
  updatedAt: Schema.DateFromString,
  /** ID of the user who created the comment */
  userId: Schema.UUID,
  /** ID of the post this comment belongs to */
  postId: Schema.UUID,
})

export type Comment = Schema.Schema.Type<typeof CommentSchema>

export const NotificationSchema = Schema.Struct({
  /** Unique identifier for the notification */
  id: Schema.UUID,
  /** Content of the notification message */
  body: Schema.String,
  /** ID of the user who receives the notification */
  userId: Schema.UUID,
  /** Timestamp when the notification was created */
  createdAt: Schema.DateFromString,
})

export type Notification = Schema.Schema.Type<typeof NotificationSchema>
