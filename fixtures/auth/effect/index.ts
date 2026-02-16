import { Schema } from 'effect'

export const UserSchema = Schema.Struct({
  /** Unique user ID */
  id: Schema.String,
  /** Display name */
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(50)),
  /** Email address */
  email: Schema.String,
  /** Date when the email was verified */
  emailVerified: Schema.DateFromString,
  /** Profile image URL */
  image: Schema.String,
  /** Hashed password */
  password: Schema.String.pipe(Schema.minLength(8)),
  /** Whether 2FA is enabled */
  isTwoFactorEnabled: Schema.Boolean,
})

export type User = Schema.Schema.Type<typeof UserSchema>

export const AccountSchema = Schema.Struct({
  /** Unique account ID */
  id: Schema.String,
  /** Reference to the user ID */
  userId: Schema.String,
  /** Type of account (e.g., oauth, email) */
  type: Schema.String,
  /** Name of the provider (e.g., google, github) */
  provider: Schema.String,
  /** Provider-specific account ID */
  providerAccountId: Schema.String,
  /** Refresh token */
  refresh_token: Schema.NullOr(Schema.String),
  /** Access token */
  access_token: Schema.NullOr(Schema.String),
  /** Expiration time (UNIX timestamp) */
  expires_at: Schema.Int,
  /** Token type (e.g., Bearer) */
  token_type: Schema.NullOr(Schema.String),
  /** OAuth scope */
  scope: Schema.NullOr(Schema.String),
  /** ID token */
  id_token: Schema.NullOr(Schema.String),
  /** Session state */
  session_state: Schema.NullOr(Schema.String),
})

export type Account = Schema.Schema.Type<typeof AccountSchema>

export const VerificationTokenSchema = Schema.Struct({
  /** Token ID */
  id: Schema.String,
  /** Email address */
  email: Schema.String,
  /** Token string */
  token: Schema.String,
  /** Expiry time */
  expires: Schema.DateFromString,
})

export type VerificationToken = Schema.Schema.Type<typeof VerificationTokenSchema>

export const PasswordResetTokenSchema = Schema.Struct({
  /** Token ID */
  id: Schema.String,
  /** Email address */
  email: Schema.String,
  /** Token string */
  token: Schema.String,
  /** Expiry time */
  expires: Schema.DateFromString,
})

export type PasswordResetToken = Schema.Schema.Type<typeof PasswordResetTokenSchema>

export const TwoFactorTokenSchema = Schema.Struct({
  /** Token ID */
  id: Schema.String,
  /** Email address */
  email: Schema.String,
  /** Token string */
  token: Schema.String,
  /** Expiry time */
  expires: Schema.DateFromString,
})

export type TwoFactorToken = Schema.Schema.Type<typeof TwoFactorTokenSchema>

export const TwoFactorConfirmationSchema = Schema.Struct({
  /** Confirmation ID */
  id: Schema.UUID,
  /** Reference to user */
  userId: Schema.String,
})

export type TwoFactorConfirmation = Schema.Schema.Type<typeof TwoFactorConfirmationSchema>
