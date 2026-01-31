import * as z from 'zod'

export const UserSchema = z.object({
  /**
   * User ID
   */
  id: z.uuid(),
  /**
   * Email address
   */
  email: z.email(),
  /**
   * Hashed password (null for OAuth-only users)
   */
  passwordHash: z.string().min(8).nullable(),
  /**
   * Display name
   */
  name: z.string().min(1).max(100),
  /**
   * Profile image URL
   */
  avatarUrl: z.url().nullable(),
  /**
   * Email verification status
   */
  emailVerified: z.boolean(),
  /**
   * Account active status
   */
  isActive: z.boolean(),
  /**
   * Account creation timestamp
   */
  createdAt: z.iso.datetime(),
  /**
   * Last update timestamp
   */
  updatedAt: z.iso.datetime(),
  /**
   * Last login timestamp
   */
  lastLoginAt: z.iso.datetime().nullable(),
})

export type User = z.infer<typeof UserSchema>

export const OAuthAccountSchema = z.object({
  /**
   * OAuth account ID
   */
  id: z.uuid(),
  /**
   * User ID
   */
  userId: z.uuid(),
  /**
   * Provider account ID
   */
  providerAccountId: z.string(),
  /**
   * Access token from provider
   */
  accessToken: z.string().nullable(),
  /**
   * Refresh token from provider
   */
  refreshToken: z.string().nullable(),
  /**
   * Token expiration timestamp
   */
  expiresAt: z.iso.datetime().nullable(),
  /**
   * Account creation timestamp
   */
  createdAt: z.iso.datetime(),
})

export type OAuthAccount = z.infer<typeof OAuthAccountSchema>

export const TwoFactorSettingSchema = z.object({
  /**
   * 2FA setting ID
   */
  id: z.uuid(),
  /**
   * User ID
   */
  userId: z.uuid(),
  /**
   * 2FA enabled status
   */
  enabled: z.boolean(),
  /**
   * TOTP secret (encrypted)
   */
  totpSecret: z.string().nullable(),
  /**
   * Phone number for SMS (E.164 format)
   */
  phoneNumber: z.string().nullable(),
  /**
   * Backup codes (hashed, JSON array)
   */
  backupCodes: z.string().nullable(),
  /**
   * Last verified timestamp
   */
  verifiedAt: z.iso.datetime().nullable(),
  /**
   * Creation timestamp
   */
  createdAt: z.iso.datetime(),
  /**
   * Last update timestamp
   */
  updatedAt: z.iso.datetime(),
})

export type TwoFactorSetting = z.infer<typeof TwoFactorSettingSchema>

export const RefreshTokenSchema = z.object({
  /**
   * Refresh token ID
   */
  id: z.uuid(),
  /**
   * User ID
   */
  userId: z.uuid(),
  /**
   * Token hash (SHA-256)
   */
  tokenHash: z.string(),
  /**
   * Device/client identifier
   */
  deviceInfo: z.string().nullable(),
  /**
   * IP address at creation
   */
  ipAddress: z.string().nullable(),
  /**
   * Token expiration timestamp
   */
  expiresAt: z.iso.datetime(),
  /**
   * Token creation timestamp
   */
  createdAt: z.iso.datetime(),
  /**
   * Revocation status
   */
  revoked: z.boolean(),
})

export type RefreshToken = z.infer<typeof RefreshTokenSchema>

export const EmailVerificationSchema = z.object({
  /**
   * Verification ID
   */
  id: z.uuid(),
  /**
   * User ID
   */
  userId: z.uuid(),
  /**
   * Verification token (hashed)
   */
  tokenHash: z.string(),
  /**
   * Token expiration timestamp
   */
  expiresAt: z.iso.datetime(),
  /**
   * Creation timestamp
   */
  createdAt: z.iso.datetime(),
})

export type EmailVerification = z.infer<typeof EmailVerificationSchema>

export const PasswordResetSchema = z.object({
  /**
   * Reset ID
   */
  id: z.uuid(),
  /**
   * User ID
   */
  userId: z.uuid(),
  /**
   * Reset token (hashed)
   */
  tokenHash: z.string(),
  /**
   * Token expiration timestamp
   */
  expiresAt: z.iso.datetime(),
  /**
   * Used status
   */
  used: z.boolean(),
  /**
   * Creation timestamp
   */
  createdAt: z.iso.datetime(),
})

export type PasswordReset = z.infer<typeof PasswordResetSchema>

export const UserRelationsSchema = z.object({
  ...UserSchema.shape,
  oauthAccounts: z.array(OAuthAccountSchema),
  twoFactorSetting: TwoFactorSettingSchema,
  refreshTokens: z.array(RefreshTokenSchema),
  emailVerifications: z.array(EmailVerificationSchema),
  passwordResets: z.array(PasswordResetSchema),
})

export type UserRelations = z.infer<typeof UserRelationsSchema>

export const OAuthAccountRelationsSchema = z.object({
  ...OAuthAccountSchema.shape,
  user: UserSchema,
})

export type OAuthAccountRelations = z.infer<typeof OAuthAccountRelationsSchema>

export const TwoFactorSettingRelationsSchema = z.object({
  ...TwoFactorSettingSchema.shape,
  user: UserSchema,
})

export type TwoFactorSettingRelations = z.infer<typeof TwoFactorSettingRelationsSchema>

export const RefreshTokenRelationsSchema = z.object({
  ...RefreshTokenSchema.shape,
  user: UserSchema,
})

export type RefreshTokenRelations = z.infer<typeof RefreshTokenRelationsSchema>

export const EmailVerificationRelationsSchema = z.object({
  ...EmailVerificationSchema.shape,
  user: UserSchema,
})

export type EmailVerificationRelations = z.infer<typeof EmailVerificationRelationsSchema>

export const PasswordResetRelationsSchema = z.object({
  ...PasswordResetSchema.shape,
  user: UserSchema,
})

export type PasswordResetRelations = z.infer<typeof PasswordResetRelationsSchema>
