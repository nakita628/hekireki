export const UserSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const },
    name: { type: 'string' as const },
    username: { type: 'string' as const },
    bio: { type: 'string' as const },
    email: { type: 'string' as const },
    emailVerified: { type: 'string' as const, format: 'date-time' as const },
    image: { type: 'string' as const },
    coverImage: { type: 'string' as const },
    profileImage: { type: 'string' as const },
    hashedPassword: { type: 'string' as const },
    createdAt: { type: 'string' as const, format: 'date-time' as const },
    updatedAt: { type: 'string' as const, format: 'date-time' as const },
    hasNotification: { type: 'boolean' as const },
  },
  required: ['id', 'name', 'username', 'email', 'createdAt', 'updatedAt'] as const,
  additionalProperties: false,
} as const

export const PostSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const },
    body: { type: 'string' as const },
    createdAt: { type: 'string' as const, format: 'date-time' as const },
    updatedAt: { type: 'string' as const, format: 'date-time' as const },
    userId: { type: 'string' as const },
  },
  required: ['id', 'body', 'createdAt', 'updatedAt', 'userId'] as const,
  additionalProperties: false,
} as const

export const FollowSchema = {
  type: 'object' as const,
  properties: {
    followerId: { type: 'string' as const },
    followingId: { type: 'string' as const },
    createdAt: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['followerId', 'followingId', 'createdAt'] as const,
  additionalProperties: false,
} as const

export const LikeSchema = {
  type: 'object' as const,
  properties: {
    userId: { type: 'string' as const },
    postId: { type: 'string' as const },
    createdAt: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['userId', 'postId', 'createdAt'] as const,
  additionalProperties: false,
} as const

export const CommentSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const },
    body: { type: 'string' as const },
    createdAt: { type: 'string' as const, format: 'date-time' as const },
    updatedAt: { type: 'string' as const, format: 'date-time' as const },
    userId: { type: 'string' as const },
    postId: { type: 'string' as const },
  },
  required: ['id', 'body', 'createdAt', 'updatedAt', 'userId', 'postId'] as const,
  additionalProperties: false,
} as const

export const NotificationSchema = {
  type: 'object' as const,
  properties: {
    id: { type: 'string' as const },
    body: { type: 'string' as const },
    userId: { type: 'string' as const },
    createdAt: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['id', 'body', 'userId', 'createdAt'] as const,
  additionalProperties: false,
} as const
