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
  passwordHash: z.string().min(8).nullable().exactOptional(),
  /**
   * Display name
   */
  name: z.string().min(1).max(100),
  /**
   * Profile image URL
   */
  avatarUrl: z.url().nullable().exactOptional(),
  /**
   * User role
   */
  role: z.enum(['ADMIN', 'USER', 'GUEST']),
  /**
   * Credit balance
   */
  creditBalance: z.number(),
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
  lastLoginAt: z.iso.datetime().exactOptional(),
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
   * OAuth provider
   */
  provider: z.enum(['GOOGLE', 'GITHUB', 'FACEBOOK', 'TWITTER', 'APPLE']),
  /**
   * Provider account ID
   */
  providerAccountId: z.string(),
  /**
   * Access token from provider
   */
  accessToken: z.string().nullable().exactOptional(),
  /**
   * Refresh token from provider
   */
  refreshToken: z.string().nullable().exactOptional(),
  /**
   * Token expiration timestamp
   */
  expiresAt: z.iso.datetime().exactOptional(),
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
   * 2FA method
   */
  method: z.enum(['TOTP', 'SMS', 'EMAIL']).exactOptional(),
  /**
   * TOTP secret (encrypted)
   */
  totpSecret: z.string().nullable().exactOptional(),
  /**
   * Phone number for SMS (E.164 format)
   */
  phoneNumber: z.string().nullable().exactOptional(),
  /**
   * Backup codes (hashed, JSON array)
   */
  backupCodes: z.string().nullable().exactOptional(),
  /**
   * Last verified timestamp
   */
  verifiedAt: z.iso.datetime().exactOptional(),
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
  id: z.string(),
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
  deviceInfo: z.string().nullable().exactOptional(),
  /**
   * IP address at creation
   */
  ipAddress: z.string().nullable().exactOptional(),
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
