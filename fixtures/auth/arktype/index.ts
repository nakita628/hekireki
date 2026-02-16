import { type } from 'arktype'

export const UserSchema = type({
  /** Unique user ID */
  id: 'string',
  /** Display name */
  name: '1 <= string <= 50',
  /** Email address */
  email: 'string.email',
  /** Date when the email was verified */
  emailVerified: 'string.date.iso',
  /** Profile image URL */
  image: 'string.url',
  /** Hashed password */
  password: 'string >= 8',
  /** Whether 2FA is enabled */
  isTwoFactorEnabled: 'boolean',
})

export type User = typeof UserSchema.infer

export const AccountSchema = type({
  /** Unique account ID */
  id: 'string',
  /** Reference to the user ID */
  userId: 'string',
  /** Type of account (e.g., oauth, email) */
  type: 'string',
  /** Name of the provider (e.g., google, github) */
  provider: 'string',
  /** Provider-specific account ID */
  providerAccountId: 'string',
  /** Refresh token */
  refresh_token: 'string | null',
  /** Access token */
  access_token: 'string | null',
  /** Expiration time (UNIX timestamp) */
  expires_at: 'number.integer',
  /** Token type (e.g., Bearer) */
  token_type: 'string | null',
  /** OAuth scope */
  scope: 'string | null',
  /** ID token */
  id_token: 'string | null',
  /** Session state */
  session_state: 'string | null',
})

export type Account = typeof AccountSchema.infer

export const VerificationTokenSchema = type({
  /** Token ID */
  id: 'string',
  /** Email address */
  email: 'string.email',
  /** Token string */
  token: 'string',
  /** Expiry time */
  expires: 'string.date.iso',
})

export type VerificationToken = typeof VerificationTokenSchema.infer

export const PasswordResetTokenSchema = type({
  /** Token ID */
  id: 'string',
  /** Email address */
  email: 'string.email',
  /** Token string */
  token: 'string',
  /** Expiry time */
  expires: 'string.date.iso',
})

export type PasswordResetToken = typeof PasswordResetTokenSchema.infer

export const TwoFactorTokenSchema = type({
  /** Token ID */
  id: 'string',
  /** Email address */
  email: 'string.email',
  /** Token string */
  token: 'string',
  /** Expiry time */
  expires: 'string.date.iso',
})

export type TwoFactorToken = typeof TwoFactorTokenSchema.infer

export const TwoFactorConfirmationSchema = type({
  /** Confirmation ID */
  id: 'string.uuid',
  /** Reference to user */
  userId: 'string',
})

export type TwoFactorConfirmation = typeof TwoFactorConfirmationSchema.infer
