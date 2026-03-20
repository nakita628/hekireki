import { type } from 'arktype'

export const UserSchema = type({
  /**

   * User ID

   */
  id: 'string.uuid',
  /**

   * Email address

   */
  email: 'string.email',
  /**

   * Hashed password

   */
  passwordHash: 'string >= 8',
  /**

   * Display name

   */
  name: '1 <= string <= 100',
  /**

   * User role

   */
  role: "'ADMIN' | 'USER'",
  /**

   * Account active status

   */
  isActive: 'boolean',
  /**

   * Account creation timestamp

   */
  createdAt: 'Date',
  /**

   * Last update timestamp

   */
  updatedAt: 'Date',
})

export type User = typeof UserSchema.infer

export const SessionSchema = type({
  /**

   * Session ID

   */
  id: 'string.uuid',
  /**

   * Session token

   */
  token: 'string',
  /**

   * User ID

   */
  userId: 'string.uuid',
  /**

   * Session expiration

   */
  expiresAt: 'Date',
  /**

   * Client IP address

   */
  ipAddress: 'string | null',
  /**

   * Client user agent

   */
  userAgent: 'string | null',
  /**

   * Session creation timestamp

   */
  createdAt: 'Date',
})

export type Session = typeof SessionSchema.infer

export const LoginHistorySchema = type({
  /**

   * Login history ID

   */
  id: 'string.uuid',
  /**

   * User ID

   */
  userId: 'string.uuid',
  /**

   * Client IP address

   */
  ipAddress: 'string',
  /**

   * Client user agent

   */
  userAgent: 'string | null',
  /**

   * Login success status

   */
  success: 'boolean',
  /**

   * Login timestamp

   */
  createdAt: 'Date',
})

export type LoginHistory = typeof LoginHistorySchema.infer

export const PasswordHistorySchema = type({
  /**

   * Password history ID

   */
  id: 'string.uuid',
  /**

   * User ID

   */
  userId: 'string.uuid',
  /**

   * Hashed password

   */
  passwordHash: 'string',
  /**

   * Change timestamp

   */
  createdAt: 'Date',
})

export type PasswordHistory = typeof PasswordHistorySchema.infer
