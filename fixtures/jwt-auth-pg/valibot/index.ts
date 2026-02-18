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
  passwordHash: v.optional(v.nullish(v.pipe(v.string(), v.minLength(8)))),
  /**
   * Display name
   */
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  /**
   * Profile image URL
   */
  avatarUrl: v.optional(v.nullish(v.pipe(v.string(), v.url()))),
  /**
   * User role
   */
  role: v.picklist(['ADMIN', 'USER', 'GUEST']),
  /**
   * Credit balance
   */
  creditBalance: v.number(),
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
  createdAt: v.date(),
  /**
   * Last update timestamp
   */
  updatedAt: v.date(),
  /**
   * Last login timestamp
   */
  lastLoginAt: v.optional(v.date()),
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
   * OAuth provider
   */
  provider: v.picklist(['GOOGLE', 'GITHUB', 'FACEBOOK', 'TWITTER', 'APPLE']),
  /**
   * Provider account ID
   */
  providerAccountId: v.string(),
  /**
   * Access token from provider
   */
  accessToken: v.optional(v.nullish(v.string())),
  /**
   * Refresh token from provider
   */
  refreshToken: v.optional(v.nullish(v.string())),
  /**
   * Token expiration timestamp
   */
  expiresAt: v.optional(v.date()),
  /**
   * Account creation timestamp
   */
  createdAt: v.date(),
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
   * 2FA method
   */
  method: v.optional(v.picklist(['TOTP', 'SMS', 'EMAIL'])),
  /**
   * TOTP secret (encrypted)
   */
  totpSecret: v.optional(v.nullish(v.string())),
  /**
   * Phone number for SMS (E.164 format)
   */
  phoneNumber: v.optional(v.nullish(v.string())),
  /**
   * Backup codes (hashed, JSON array)
   */
  backupCodes: v.optional(v.nullish(v.string())),
  /**
   * Last verified timestamp
   */
  verifiedAt: v.optional(v.date()),
  /**
   * Creation timestamp
   */
  createdAt: v.date(),
  /**
   * Last update timestamp
   */
  updatedAt: v.date(),
})

export type TwoFactorSetting = v.InferInput<typeof TwoFactorSettingSchema>

export const RefreshTokenSchema = v.object({
  /**
   * Refresh token ID
   */
  id: v.string(),
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
  deviceInfo: v.optional(v.nullish(v.string())),
  /**
   * IP address at creation
   */
  ipAddress: v.optional(v.nullish(v.string())),
  /**
   * Token expiration timestamp
   */
  expiresAt: v.date(),
  /**
   * Token creation timestamp
   */
  createdAt: v.date(),
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
  expiresAt: v.date(),
  /**
   * Creation timestamp
   */
  createdAt: v.date(),
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
  expiresAt: v.date(),
  /**
   * Used status
   */
  used: v.boolean(),
  /**
   * Creation timestamp
   */
  createdAt: v.date(),
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
