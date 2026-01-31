import * as v from 'valibot'

export const UserSchema = v.object({
  /**
   * User ID
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * Email address
   */
  email: v.pipe(v.string(), v.email()),
  /**
   * Hashed password (null for OAuth-only users)
   */
  passwordHash: v.nullish(v.pipe(v.string(), v.minLength(8))),
  /**
   * Display name
   */
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  /**
   * Profile image URL
   */
  avatarUrl: v.nullish(v.pipe(v.string(), v.url())),
  /**
   * Email verification status
   */
  emailVerified: v.boolean(),
  /**
   * Account active status
   */
  isActive: v.boolean(),
  /**
   * Account creation timestamp
   */
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
  /**
   * Last update timestamp
   */
  updatedAt: v.pipe(v.string(), v.isoTimestamp()),
  /**
   * Last login timestamp
   */
  lastLoginAt: v.nullish(v.pipe(v.string(), v.isoTimestamp())),
})

export type User = v.InferInput<typeof UserSchema>

export const OAuthAccountSchema = v.object({
  /**
   * OAuth account ID
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * User ID
   */
  userId: v.pipe(v.string(), v.uuid()),
  /**
   * Provider account ID
   */
  providerAccountId: v.string(),
  /**
   * Access token from provider
   */
  accessToken: v.nullish(v.string()),
  /**
   * Refresh token from provider
   */
  refreshToken: v.nullish(v.string()),
  /**
   * Token expiration timestamp
   */
  expiresAt: v.nullish(v.pipe(v.string(), v.isoTimestamp())),
  /**
   * Account creation timestamp
   */
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
})

export type OAuthAccount = v.InferInput<typeof OAuthAccountSchema>

export const TwoFactorSettingSchema = v.object({
  /**
   * 2FA setting ID
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * User ID
   */
  userId: v.pipe(v.string(), v.uuid()),
  /**
   * 2FA enabled status
   */
  enabled: v.boolean(),
  /**
   * TOTP secret (encrypted)
   */
  totpSecret: v.nullish(v.string()),
  /**
   * Phone number for SMS (E.164 format)
   */
  phoneNumber: v.nullish(v.string()),
  /**
   * Backup codes (hashed, JSON array)
   */
  backupCodes: v.nullish(v.string()),
  /**
   * Last verified timestamp
   */
  verifiedAt: v.nullish(v.pipe(v.string(), v.isoTimestamp())),
  /**
   * Creation timestamp
   */
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
  /**
   * Last update timestamp
   */
  updatedAt: v.pipe(v.string(), v.isoTimestamp()),
})

export type TwoFactorSetting = v.InferInput<typeof TwoFactorSettingSchema>

export const RefreshTokenSchema = v.object({
  /**
   * Refresh token ID
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * User ID
   */
  userId: v.pipe(v.string(), v.uuid()),
  /**
   * Token hash (SHA-256)
   */
  tokenHash: v.string(),
  /**
   * Device/client identifier
   */
  deviceInfo: v.nullish(v.string()),
  /**
   * IP address at creation
   */
  ipAddress: v.nullish(v.string()),
  /**
   * Token expiration timestamp
   */
  expiresAt: v.pipe(v.string(), v.isoTimestamp()),
  /**
   * Token creation timestamp
   */
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
  /**
   * Revocation status
   */
  revoked: v.boolean(),
})

export type RefreshToken = v.InferInput<typeof RefreshTokenSchema>

export const EmailVerificationSchema = v.object({
  /**
   * Verification ID
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * User ID
   */
  userId: v.pipe(v.string(), v.uuid()),
  /**
   * Verification token (hashed)
   */
  tokenHash: v.string(),
  /**
   * Token expiration timestamp
   */
  expiresAt: v.pipe(v.string(), v.isoTimestamp()),
  /**
   * Creation timestamp
   */
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
})

export type EmailVerification = v.InferInput<typeof EmailVerificationSchema>

export const PasswordResetSchema = v.object({
  /**
   * Reset ID
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * User ID
   */
  userId: v.pipe(v.string(), v.uuid()),
  /**
   * Reset token (hashed)
   */
  tokenHash: v.string(),
  /**
   * Token expiration timestamp
   */
  expiresAt: v.pipe(v.string(), v.isoTimestamp()),
  /**
   * Used status
   */
  used: v.boolean(),
  /**
   * Creation timestamp
   */
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
})

export type PasswordReset = v.InferInput<typeof PasswordResetSchema>

export const UserRelationsSchema = v.object({
  ...UserSchema.entries,
  oauthAccounts: v.array(OAuthAccountSchema),
  twoFactorSetting: TwoFactorSettingSchema,
  refreshTokens: v.array(RefreshTokenSchema),
  emailVerifications: v.array(EmailVerificationSchema),
  passwordResets: v.array(PasswordResetSchema),
})

export type UserRelations = v.InferInput<typeof UserRelationsSchema>

export const OAuthAccountRelationsSchema = v.object({
  ...OAuthAccountSchema.entries,
  user: UserSchema,
})

export type OAuthAccountRelations = v.InferInput<typeof OAuthAccountRelationsSchema>

export const TwoFactorSettingRelationsSchema = v.object({
  ...TwoFactorSettingSchema.entries,
  user: UserSchema,
})

export type TwoFactorSettingRelations = v.InferInput<typeof TwoFactorSettingRelationsSchema>

export const RefreshTokenRelationsSchema = v.object({
  ...RefreshTokenSchema.entries,
  user: UserSchema,
})

export type RefreshTokenRelations = v.InferInput<typeof RefreshTokenRelationsSchema>

export const EmailVerificationRelationsSchema = v.object({
  ...EmailVerificationSchema.entries,
  user: UserSchema,
})

export type EmailVerificationRelations = v.InferInput<typeof EmailVerificationRelationsSchema>

export const PasswordResetRelationsSchema = v.object({
  ...PasswordResetSchema.entries,
  user: UserSchema,
})

export type PasswordResetRelations = v.InferInput<typeof PasswordResetRelationsSchema>
