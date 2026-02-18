import { Schema } from 'effect'

export const UserSchema = Schema.Struct({
  /** User ID */
  id: Schema.UUID,
  /** Email address */
  email: Schema.String,
  /** Hashed password */
  passwordHash: Schema.String.pipe(Schema.minLength(8)),
  /** Display name */
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
  /** User role */
  role: Schema.Literal('ADMIN', 'USER'),
  /** Account active status */
  isActive: Schema.Boolean,
  /** Account creation timestamp */
  createdAt: Schema.Date,
  /** Last update timestamp */
  updatedAt: Schema.Date,
})

export type User = Schema.Schema.Type<typeof UserSchema>

export const SessionSchema = Schema.Struct({
  /** Session ID */
  id: Schema.UUID,
  /** Session token */
  token: Schema.String,
  /** User ID */
  userId: Schema.UUID,
  /** Session expiration */
  expiresAt: Schema.Date,
  /** Client IP address */
  ipAddress: Schema.NullOr(Schema.String),
  /** Client user agent */
  userAgent: Schema.NullOr(Schema.String),
  /** Session creation timestamp */
  createdAt: Schema.Date,
})

export type Session = Schema.Schema.Type<typeof SessionSchema>

export const LoginHistorySchema = Schema.Struct({
  /** Login history ID */
  id: Schema.UUID,
  /** User ID */
  userId: Schema.UUID,
  /** Client IP address */
  ipAddress: Schema.String,
  /** Client user agent */
  userAgent: Schema.NullOr(Schema.String),
  /** Login success status */
  success: Schema.Boolean,
  /** Login timestamp */
  createdAt: Schema.Date,
})

export type LoginHistory = Schema.Schema.Type<typeof LoginHistorySchema>

export const PasswordHistorySchema = Schema.Struct({
  /** Password history ID */
  id: Schema.UUID,
  /** User ID */
  userId: Schema.UUID,
  /** Hashed password */
  passwordHash: Schema.String,
  /** Change timestamp */
  createdAt: Schema.Date,
})

export type PasswordHistory = Schema.Schema.Type<typeof PasswordHistorySchema>
