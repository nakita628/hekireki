import { type Static, Type } from '@sinclair/typebox'

export const UserSchema = Type.Object({
  /** Unique user ID */
  id: Type.String(),
  /** Display name */
  name: Type.Optional(Type.String()),
  /** Email address */
  email: Type.Optional(Type.String()),
  /** Date when the email was verified */
  emailVerified: Type.Optional(Type.Date()),
  /** Profile image URL */
  image: Type.Optional(Type.String()),
  /** Hashed password */
  password: Type.Optional(Type.String()),
  /** Role of the user (ADMIN or USER) */
  role: Type.Union([Type.Literal('ADMIN'), Type.Literal('USER')]),
  /** Whether 2FA is enabled */
  isTwoFactorEnabled: Type.Optional(Type.Boolean()),
})

export type User = Static<typeof UserSchema>

export const AccountSchema = Type.Object({
  /** Unique account ID */
  id: Type.String(),
  /** Reference to the user ID */
  userId: Type.String(),
  /** Type of account (e.g., oauth, email) */
  type: Type.String(),
  /** Name of the provider (e.g., google, github) */
  provider: Type.String(),
  /** Provider-specific account ID */
  providerAccountId: Type.String(),
  /** Refresh token */
  refresh_token: Type.Optional(Type.String()),
  /** Access token */
  access_token: Type.Optional(Type.String()),
  /** Expiration time (UNIX timestamp) */
  expires_at: Type.Optional(Type.Integer()),
  /** Token type (e.g., Bearer) */
  token_type: Type.Optional(Type.String()),
  /** OAuth scope */
  scope: Type.Optional(Type.String()),
  /** ID token */
  id_token: Type.Optional(Type.String()),
  /** Session state */
  session_state: Type.Optional(Type.String()),
})

export type Account = Static<typeof AccountSchema>

export const VerificationTokenSchema = Type.Object({
  /** Token ID */
  id: Type.String(),
  /** Email address */
  email: Type.String(),
  /** Token string */
  token: Type.String(),
  /** Expiry time */
  expires: Type.Date(),
})

export type VerificationToken = Static<typeof VerificationTokenSchema>

export const PasswordResetTokenSchema = Type.Object({
  /** Token ID */
  id: Type.String(),
  /** Email address */
  email: Type.String(),
  /** Token string */
  token: Type.String(),
  /** Expiry time */
  expires: Type.Date(),
})

export type PasswordResetToken = Static<typeof PasswordResetTokenSchema>

export const TwoFactorTokenSchema = Type.Object({
  /** Token ID */
  id: Type.String(),
  /** Email address */
  email: Type.String(),
  /** Token string */
  token: Type.String(),
  /** Expiry time */
  expires: Type.Date(),
})

export type TwoFactorToken = Static<typeof TwoFactorTokenSchema>

export const TwoFactorConfirmationSchema = Type.Object({
  /** Confirmation ID */
  id: Type.String(),
  /** Reference to user */
  userId: Type.String(),
})

export type TwoFactorConfirmation = Static<typeof TwoFactorConfirmationSchema>
