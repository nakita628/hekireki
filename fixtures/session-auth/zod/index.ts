import * as z from 'zod'

export const UserSchema = z.object({
  /**
   * User ID
   */
  id: z.uuid(),
  /**
   * Email address
   */
  email: z.email(),
  /**
   * Hashed password
   */
  passwordHash: z.string().min(8),
  /**
   * Display name
   */
  name: z.string().min(1).max(100),
  /**
   * Account active status
   */
  isActive: z.boolean(),
})

export type User = z.infer<typeof UserSchema>

export const SessionSchema = z.object({
  /**
   * Session ID
   */
  id: z.uuid(),
  /**
   * Session token
   */
  token: z.string(),
  /**
   * User ID
   */
  userId: z.uuid(),
  /**
   * Client IP address
   */
  ipAddress: z.string().nullable(),
  /**
   * Client user agent
   */
  userAgent: z.string().nullable(),
})

export type Session = z.infer<typeof SessionSchema>

export const LoginHistorySchema = z.object({
  /**
   * Login history ID
   */
  id: z.uuid(),
  /**
   * User ID
   */
  userId: z.uuid(),
  /**
   * Client IP address
   */
  ipAddress: z.string(),
  /**
   * Client user agent
   */
  userAgent: z.string().nullable(),
  /**
   * Login success status
   */
  success: z.boolean(),
})

export type LoginHistory = z.infer<typeof LoginHistorySchema>

export const PasswordHistorySchema = z.object({
  /**
   * Password history ID
   */
  id: z.uuid(),
  /**
   * User ID
   */
  userId: z.uuid(),
  /**
   * Hashed password
   */
  passwordHash: z.string(),
})

export type PasswordHistory = z.infer<typeof PasswordHistorySchema>

export const UserRelationsSchema = z.object({
  ...UserSchema.shape,
  sessions: z.array(SessionSchema),
  loginHistories: z.array(LoginHistorySchema),
  passwordHistories: z.array(PasswordHistorySchema),
})

export type UserRelations = z.infer<typeof UserRelationsSchema>

export const SessionRelationsSchema = z.object({
  ...SessionSchema.shape,
  user: UserSchema,
})

export type SessionRelations = z.infer<typeof SessionRelationsSchema>

export const LoginHistoryRelationsSchema = z.object({
  ...LoginHistorySchema.shape,
  user: UserSchema,
})

export type LoginHistoryRelations = z.infer<typeof LoginHistoryRelationsSchema>

export const PasswordHistoryRelationsSchema = z.object({
  ...PasswordHistorySchema.shape,
  user: UserSchema,
})

export type PasswordHistoryRelations = z.infer<typeof PasswordHistoryRelationsSchema>
