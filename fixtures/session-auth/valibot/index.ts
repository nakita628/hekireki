import * as v from 'valibot'

export const UserSchema = v.object({
  /**
   * User ID
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * Email address
   */
  email: v.pipe(v.string(), v.email()),
  /**
   * Hashed password
   */
  passwordHash: v.pipe(v.string(), v.minLength(8)),
  /**
   * Display name
   */
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  /**
   * User role
   */
  role: v.picklist(['ADMIN', 'USER']),
  /**
   * Account active status
   */
  isActive: v.boolean(),
  /**
   * Account creation timestamp
   */
  createdAt: v.date(),
  /**
   * Last update timestamp
   */
  updatedAt: v.date(),
})

export type User = v.InferInput<typeof UserSchema>

export const SessionSchema = v.object({
  /**
   * Session ID
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * Session token
   */
  token: v.string(),
  /**
   * User ID
   */
  userId: v.pipe(v.string(), v.uuid()),
  /**
   * Session expiration
   */
  expiresAt: v.date(),
  /**
   * Client IP address
   */
  ipAddress: v.optional(v.nullish(v.string())),
  /**
   * Client user agent
   */
  userAgent: v.optional(v.nullish(v.string())),
  /**
   * Session creation timestamp
   */
  createdAt: v.date(),
})

export type Session = v.InferInput<typeof SessionSchema>

export const LoginHistorySchema = v.object({
  /**
   * Login history ID
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * User ID
   */
  userId: v.pipe(v.string(), v.uuid()),
  /**
   * Client IP address
   */
  ipAddress: v.string(),
  /**
   * Client user agent
   */
  userAgent: v.optional(v.nullish(v.string())),
  /**
   * Login success status
   */
  success: v.boolean(),
  /**
   * Login timestamp
   */
  createdAt: v.date(),
})

export type LoginHistory = v.InferInput<typeof LoginHistorySchema>

export const PasswordHistorySchema = v.object({
  /**
   * Password history ID
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * User ID
   */
  userId: v.pipe(v.string(), v.uuid()),
  /**
   * Hashed password
   */
  passwordHash: v.string(),
  /**
   * Change timestamp
   */
  createdAt: v.date(),
})

export type PasswordHistory = v.InferInput<typeof PasswordHistorySchema>

export const UserRelationsSchema = v.object({
  ...UserSchema.entries,
  sessions: v.array(SessionSchema),
  loginHistories: v.array(LoginHistorySchema),
  passwordHistories: v.array(PasswordHistorySchema),
})

export type UserRelations = v.InferInput<typeof UserRelationsSchema>

export const SessionRelationsSchema = v.object({
  ...SessionSchema.entries,
  user: UserSchema,
})

export type SessionRelations = v.InferInput<typeof SessionRelationsSchema>

export const LoginHistoryRelationsSchema = v.object({
  ...LoginHistorySchema.entries,
  user: UserSchema,
})

export type LoginHistoryRelations = v.InferInput<typeof LoginHistoryRelationsSchema>

export const PasswordHistoryRelationsSchema = v.object({
  ...PasswordHistorySchema.entries,
  user: UserSchema,
})

export type PasswordHistoryRelations = v.InferInput<typeof PasswordHistoryRelationsSchema>
