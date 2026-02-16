import { type } from 'arktype'

export const UserSchema = type({
  /** User ID */
  id: 'string.uuid',
  /** Email address */
  email: 'string.email',
  /** Hashed password */
  passwordHash: 'string >= 8',
  /** Display name */
  name: '1 <= string <= 100',
  /** Account active status */
  isActive: 'boolean',
})

export type User = typeof UserSchema.infer

export const SessionSchema = type({
  /** Session ID */
  id: 'string.uuid',
  /** Session token */
  token: 'string',
  /** User ID */
  userId: 'string.uuid',
  /** Client IP address */
  ipAddress: 'string | null',
  /** Client user agent */
  userAgent: 'string | null',
})

export type Session = typeof SessionSchema.infer

export const LoginHistorySchema = type({
  /** Login history ID */
  id: 'string.uuid',
  /** User ID */
  userId: 'string.uuid',
  /** Client IP address */
  ipAddress: 'string',
  /** Client user agent */
  userAgent: 'string | null',
  /** Login success status */
  success: 'boolean',
})

export type LoginHistory = typeof LoginHistorySchema.infer

export const PasswordHistorySchema = type({
  /** Password history ID */
  id: 'string.uuid',
  /** User ID */
  userId: 'string.uuid',
  /** Hashed password */
  passwordHash: 'string',
})

export type PasswordHistory = typeof PasswordHistorySchema.infer
