import { type } from 'arktype'

export const UserSchema = type({
  /** User ID */
  id: 'string.uuid',
  /** Email address */
  email: 'string.email',
  /** Hashed password (null for OAuth-only users) */
  passwordHash: 'string >= 8 | null',
  /** Display name */
  name: '1 <= string <= 100',
  /** Profile image URL */
  avatarUrl: 'string.url | null',
  /** Email verification status */
  emailVerified: 'boolean',
  /** Account active status */
  isActive: 'boolean',
  /** Account creation timestamp */
  createdAt: 'string.date.iso',
  /** Last update timestamp */
  updatedAt: 'string.date.iso',
  /** Last login timestamp */
  lastLoginAt: 'string.date.iso | null',
})

export type User = typeof UserSchema.infer

export const OAuthAccountSchema = type({
  /** OAuth account ID */
  id: 'string.uuid',
  /** User ID */
  userId: 'string.uuid',
  /** Provider account ID */
  providerAccountId: 'string',
  /** Access token from provider */
  accessToken: 'string | null',
  /** Refresh token from provider */
  refreshToken: 'string | null',
  /** Token expiration timestamp */
  expiresAt: 'string.date.iso | null',
  /** Account creation timestamp */
  createdAt: 'string.date.iso',
})

export type OAuthAccount = typeof OAuthAccountSchema.infer

export const TwoFactorSettingSchema = type({
  /** 2FA setting ID */
  id: 'string.uuid',
  /** User ID */
  userId: 'string.uuid',
  /** 2FA enabled status */
  enabled: 'boolean',
  /** TOTP secret (encrypted) */
  totpSecret: 'string | null',
  /** Phone number for SMS (E.164 format) */
  phoneNumber: 'string | null',
  /** Backup codes (hashed, JSON array) */
  backupCodes: 'string | null',
  /** Last verified timestamp */
  verifiedAt: 'string.date.iso | null',
  /** Creation timestamp */
  createdAt: 'string.date.iso',
  /** Last update timestamp */
  updatedAt: 'string.date.iso',
})

export type TwoFactorSetting = typeof TwoFactorSettingSchema.infer

export const RefreshTokenSchema = type({
  /** Refresh token ID */
  id: 'string.uuid',
  /** User ID */
  userId: 'string.uuid',
  /** Token hash (SHA-256) */
  tokenHash: 'string',
  /** Device/client identifier */
  deviceInfo: 'string | null',
  /** IP address at creation */
  ipAddress: 'string | null',
  /** Token expiration timestamp */
  expiresAt: 'string.date.iso',
  /** Token creation timestamp */
  createdAt: 'string.date.iso',
  /** Revocation status */
  revoked: 'boolean',
})

export type RefreshToken = typeof RefreshTokenSchema.infer

export const EmailVerificationSchema = type({
  /** Verification ID */
  id: 'string.uuid',
  /** User ID */
  userId: 'string.uuid',
  /** Verification token (hashed) */
  tokenHash: 'string',
  /** Token expiration timestamp */
  expiresAt: 'string.date.iso',
  /** Creation timestamp */
  createdAt: 'string.date.iso',
})

export type EmailVerification = typeof EmailVerificationSchema.infer

export const PasswordResetSchema = type({
  /** Reset ID */
  id: 'string.uuid',
  /** User ID */
  userId: 'string.uuid',
  /** Reset token (hashed) */
  tokenHash: 'string',
  /** Token expiration timestamp */
  expiresAt: 'string.date.iso',
  /** Used status */
  used: 'boolean',
  /** Creation timestamp */
  createdAt: 'string.date.iso',
})

export type PasswordReset = typeof PasswordResetSchema.infer
