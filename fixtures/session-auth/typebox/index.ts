import { type Static, Type } from '@sinclair/typebox'

export const UserSchema = Type.Object({
  /**

   * User ID

   */
  id: Type.String(),
  /**

   * Email address

   */
  email: Type.String(),
  /**

   * Hashed password

   */
  passwordHash: Type.String(),
  /**

   * Display name

   */
  name: Type.String(),
  /**

   * User role

   */
  role: Type.Union([Type.Literal('ADMIN'), Type.Literal('USER')]),
  /**

   * Account active status

   */
  isActive: Type.Boolean(),
  /**

   * Account creation timestamp

   */
  createdAt: Type.Date(),
  /**

   * Last update timestamp

   */
  updatedAt: Type.Date(),
})

export type User = Static<typeof UserSchema>

export const SessionSchema = Type.Object({
  /**

   * Session ID

   */
  id: Type.String(),
  /**

   * Session token

   */
  token: Type.String(),
  /**

   * User ID

   */
  userId: Type.String(),
  /**

   * Session expiration

   */
  expiresAt: Type.Date(),
  /**

   * Client IP address

   */
  ipAddress: Type.Optional(Type.String()),
  /**

   * Client user agent

   */
  userAgent: Type.Optional(Type.String()),
  /**

   * Session creation timestamp

   */
  createdAt: Type.Date(),
})

export type Session = Static<typeof SessionSchema>

export const LoginHistorySchema = Type.Object({
  /**

   * Login history ID

   */
  id: Type.String(),
  /**

   * User ID

   */
  userId: Type.String(),
  /**

   * Client IP address

   */
  ipAddress: Type.String(),
  /**

   * Client user agent

   */
  userAgent: Type.Optional(Type.String()),
  /**

   * Login success status

   */
  success: Type.Boolean(),
  /**

   * Login timestamp

   */
  createdAt: Type.Date(),
})

export type LoginHistory = Static<typeof LoginHistorySchema>

export const PasswordHistorySchema = Type.Object({
  /**

   * Password history ID

   */
  id: Type.String(),
  /**

   * User ID

   */
  userId: Type.String(),
  /**

   * Hashed password

   */
  passwordHash: Type.String(),
  /**

   * Change timestamp

   */
  createdAt: Type.Date(),
})

export type PasswordHistory = Static<typeof PasswordHistorySchema>

export const UserRelationsSchema = Type.Object({
  ...UserSchema.properties,
  sessions: Type.Array(SessionSchema),
  loginHistories: Type.Array(LoginHistorySchema),
  passwordHistories: Type.Array(PasswordHistorySchema),
})

export type UserRelations = Static<typeof UserRelationsSchema>

export const SessionRelationsSchema = Type.Object({
  ...SessionSchema.properties,
  user: UserSchema,
})

export type SessionRelations = Static<typeof SessionRelationsSchema>

export const LoginHistoryRelationsSchema = Type.Object({
  ...LoginHistorySchema.properties,
  user: UserSchema,
})

export type LoginHistoryRelations = Static<typeof LoginHistoryRelationsSchema>

export const PasswordHistoryRelationsSchema = Type.Object({
  ...PasswordHistorySchema.properties,
  user: UserSchema,
})

export type PasswordHistoryRelations = Static<typeof PasswordHistoryRelationsSchema>
