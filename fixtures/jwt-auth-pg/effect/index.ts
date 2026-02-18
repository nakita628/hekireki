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
  /** User role */
  role: Schema.Literal('ADMIN', 'USER', 'GUEST'),
  /** Credit balance */
  creditBalance: Schema.Number,
  /** Email verification status */
  emailVerified: Schema.Boolean,
  /** Account active status */
  isActive: Schema.Boolean,
  /** Account creation timestamp */
  createdAt: Schema.Date,
  /** Last update timestamp */
  updatedAt: Schema.Date,
  /** Last login timestamp */
  lastLoginAt: Schema.Date,
})

export type User = Schema.Schema.Type<typeof UserSchema>

export const OAuthAccountSchema = Schema.Struct({
  /** OAuth account ID */
  id: Schema.UUID,
  /** User ID */
  userId: Schema.UUID,
  /** OAuth provider */
  provider: Schema.Literal('GOOGLE', 'GITHUB', 'FACEBOOK', 'TWITTER', 'APPLE'),
  /** Provider account ID */
  providerAccountId: Schema.String,
  /** Access token from provider */
  accessToken: Schema.NullOr(Schema.String),
  /** Refresh token from provider */
  refreshToken: Schema.NullOr(Schema.String),
  /** Token expiration timestamp */
  expiresAt: Schema.Date,
  /** Account creation timestamp */
  createdAt: Schema.Date,
})

export type OAuthAccount = Schema.Schema.Type<typeof OAuthAccountSchema>

export const TwoFactorSettingSchema = Schema.Struct({
  /** 2FA setting ID */
  id: Schema.UUID,
  /** User ID */
  userId: Schema.UUID,
  /** 2FA enabled status */
  enabled: Schema.Boolean,
  /** 2FA method */
  method: Schema.Literal('TOTP', 'SMS', 'EMAIL'),
  /** TOTP secret (encrypted) */
  totpSecret: Schema.NullOr(Schema.String),
  /** Phone number for SMS (E.164 format) */
  phoneNumber: Schema.NullOr(Schema.String),
  /** Backup codes (hashed, JSON array) */
  backupCodes: Schema.NullOr(Schema.String),
  /** Last verified timestamp */
  verifiedAt: Schema.Date,
  /** Creation timestamp */
  createdAt: Schema.Date,
  /** Last update timestamp */
  updatedAt: Schema.Date,
})

export type TwoFactorSetting = Schema.Schema.Type<typeof TwoFactorSettingSchema>

export const RefreshTokenSchema = Schema.Struct({
  /** Refresh token ID */
  id: Schema.String,
  /** User ID */
  userId: Schema.UUID,
  /** Token hash (SHA-256) */
  tokenHash: Schema.String,
  /** Device/client identifier */
  deviceInfo: Schema.NullOr(Schema.String),
  /** IP address at creation */
  ipAddress: Schema.NullOr(Schema.String),
  /** Token expiration timestamp */
  expiresAt: Schema.Date,
  /** Token creation timestamp */
  createdAt: Schema.Date,
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
  /** Token expiration timestamp */
  expiresAt: Schema.Date,
  /** Creation timestamp */
  createdAt: Schema.Date,
})

export type EmailVerification = Schema.Schema.Type<typeof EmailVerificationSchema>

export const PasswordResetSchema = Schema.Struct({
  /** Reset ID */
  id: Schema.UUID,
  /** User ID */
  userId: Schema.UUID,
  /** Reset token (hashed) */
  tokenHash: Schema.String,
  /** Token expiration timestamp */
  expiresAt: Schema.Date,
  /** Used status */
  used: Schema.Boolean,
  /** Creation timestamp */
  createdAt: Schema.Date,
})

export type PasswordReset = Schema.Schema.Type<typeof PasswordResetSchema>
