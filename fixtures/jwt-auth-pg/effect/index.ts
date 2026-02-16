import { Schema } from 'effect'

export const UserSchema = Schema.Struct({
  /** User ID */
  id: Schema.UUID,
  /** Email address */
  email: Schema.String,
  /** Hashed password (null for OAuth-only users) */
  passwordHash: Schema.NullOr(Schema.String.pipe(Schema.minLength(8))),
  /** Display name */
  name: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100)),
  /** Profile image URL */
  avatarUrl: Schema.NullOr(Schema.String),
  /** Credit balance */
  creditBalance: Schema.Number,
  /** Email verification status */
  emailVerified: Schema.Boolean,
  /** Account active status */
  isActive: Schema.Boolean,
})

export type User = Schema.Schema.Type<typeof UserSchema>

export const OAuthAccountSchema = Schema.Struct({
  /** OAuth account ID */
  id: Schema.UUID,
  /** User ID */
  userId: Schema.UUID,
  /** Provider account ID */
  providerAccountId: Schema.String,
  /** Access token from provider */
  accessToken: Schema.NullOr(Schema.String),
  /** Refresh token from provider */
  refreshToken: Schema.NullOr(Schema.String),
})

export type OAuthAccount = Schema.Schema.Type<typeof OAuthAccountSchema>

export const TwoFactorSettingSchema = Schema.Struct({
  /** 2FA setting ID */
  id: Schema.UUID,
  /** User ID */
  userId: Schema.UUID,
  /** 2FA enabled status */
  enabled: Schema.Boolean,
  /** TOTP secret (encrypted) */
  totpSecret: Schema.NullOr(Schema.String),
  /** Phone number for SMS (E.164 format) */
  phoneNumber: Schema.NullOr(Schema.String),
  /** Backup codes (hashed, JSON array) */
  backupCodes: Schema.NullOr(Schema.String),
})

export type TwoFactorSetting = Schema.Schema.Type<typeof TwoFactorSettingSchema>

export const RefreshTokenSchema = Schema.Struct({
  /** User ID */
  userId: Schema.UUID,
  /** Token hash (SHA-256) */
  tokenHash: Schema.String,
  /** Device/client identifier */
  deviceInfo: Schema.NullOr(Schema.String),
  /** IP address at creation */
  ipAddress: Schema.NullOr(Schema.String),
  /** Revocation status */
  revoked: Schema.Boolean,
})

export type RefreshToken = Schema.Schema.Type<typeof RefreshTokenSchema>

export const EmailVerificationSchema = Schema.Struct({
  /** Verification ID */
  id: Schema.UUID,
  /** User ID */
  userId: Schema.UUID,
  /** Verification token (hashed) */
  tokenHash: Schema.String,
})

export type EmailVerification = Schema.Schema.Type<typeof EmailVerificationSchema>

export const PasswordResetSchema = Schema.Struct({
  /** Reset ID */
  id: Schema.UUID,
  /** User ID */
  userId: Schema.UUID,
  /** Reset token (hashed) */
  tokenHash: Schema.String,
  /** Used status */
  used: Schema.Boolean,
})

export type PasswordReset = Schema.Schema.Type<typeof PasswordResetSchema>
