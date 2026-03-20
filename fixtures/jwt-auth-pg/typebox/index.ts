import { type Static, Type } from '@sinclair/typebox'

export const UserSchema = Type.Object({
  /**
   * User ID
   */
  id: Type.String(),
  /**
   * Email address
   */
  email: Type.String(),
  /**
   * Hashed password (null for OAuth-only users)
   */
  passwordHash: Type.Optional(Type.String()),
  /**
   * Display name
   */
  name: Type.String(),
  /**
   * Profile image URL
   */
  avatarUrl: Type.Optional(Type.String()),
  /**
   * User role
   */
  role: Type.Union([Type.Literal('ADMIN'), Type.Literal('USER'), Type.Literal('GUEST')]),
  /**
   * Credit balance
   */
  creditBalance: Type.Number(),
  /**
   * Email verification status
   */
  emailVerified: Type.Boolean(),
  /**
   * Account active status
   */
  isActive: Type.Boolean(),
  /**
   * Account creation timestamp
   */
  createdAt: Type.Date(),
  /**
   * Last update timestamp
   */
  updatedAt: Type.Date(),
  /**
   * Last login timestamp
   */
  lastLoginAt: Type.Optional(Type.Date()),
})

export type User = Static<typeof UserSchema>

export const OAuthAccountSchema = Type.Object({
  /**
   * OAuth account ID
   */
  id: Type.String(),
  /**
   * User ID
   */
  userId: Type.String(),
  /**
   * OAuth provider
   */
  provider: Type.Union([
    Type.Literal('GOOGLE'),
    Type.Literal('GITHUB'),
    Type.Literal('FACEBOOK'),
    Type.Literal('TWITTER'),
    Type.Literal('APPLE'),
  ]),
  /**
   * Provider account ID
   */
  providerAccountId: Type.String(),
  /**
   * Access token from provider
   */
  accessToken: Type.Optional(Type.String()),
  /**
   * Refresh token from provider
   */
  refreshToken: Type.Optional(Type.String()),
  /**
   * Token expiration timestamp
   */
  expiresAt: Type.Optional(Type.Date()),
  /**
   * Account creation timestamp
   */
  createdAt: Type.Date(),
})

export type OAuthAccount = Static<typeof OAuthAccountSchema>

export const TwoFactorSettingSchema = Type.Object({
  /**
   * 2FA setting ID
   */
  id: Type.String(),
  /**
   * User ID
   */
  userId: Type.String(),
  /**
   * 2FA enabled status
   */
  enabled: Type.Boolean(),
  /**
   * 2FA method
   */
  method: Type.Optional(
    Type.Union([Type.Literal('TOTP'), Type.Literal('SMS'), Type.Literal('EMAIL')]),
  ),
  /**
   * TOTP secret (encrypted)
   */
  totpSecret: Type.Optional(Type.String()),
  /**
   * Phone number for SMS (E.164 format)
   */
  phoneNumber: Type.Optional(Type.String()),
  /**
   * Backup codes (hashed, JSON array)
   */
  backupCodes: Type.Optional(Type.String()),
  /**
   * Last verified timestamp
   */
  verifiedAt: Type.Optional(Type.Date()),
  /**
   * Creation timestamp
   */
  createdAt: Type.Date(),
  /**
   * Last update timestamp
   */
  updatedAt: Type.Date(),
})

export type TwoFactorSetting = Static<typeof TwoFactorSettingSchema>

export const RefreshTokenSchema = Type.Object({
  /**
   * Refresh token ID
   */
  id: Type.String(),
  /**
   * User ID
   */
  userId: Type.String(),
  /**
   * Token hash (SHA-256)
   */
  tokenHash: Type.String(),
  /**
   * Device/client identifier
   */
  deviceInfo: Type.Optional(Type.String()),
  /**
   * IP address at creation
   */
  ipAddress: Type.Optional(Type.String()),
  /**
   * Token expiration timestamp
   */
  expiresAt: Type.Date(),
  /**
   * Token creation timestamp
   */
  createdAt: Type.Date(),
  /**
   * Revocation status
   */
  revoked: Type.Boolean(),
})

export type RefreshToken = Static<typeof RefreshTokenSchema>

export const EmailVerificationSchema = Type.Object({
  /**
   * Verification ID
   */
  id: Type.String(),
  /**
   * User ID
   */
  userId: Type.String(),
  /**
   * Verification token (hashed)
   */
  tokenHash: Type.String(),
  /**
   * Token expiration timestamp
   */
  expiresAt: Type.Date(),
  /**
   * Creation timestamp
   */
  createdAt: Type.Date(),
})

export type EmailVerification = Static<typeof EmailVerificationSchema>

export const PasswordResetSchema = Type.Object({
  /**
   * Reset ID
   */
  id: Type.String(),
  /**
   * User ID
   */
  userId: Type.String(),
  /**
   * Reset token (hashed)
   */
  tokenHash: Type.String(),
  /**
   * Token expiration timestamp
   */
  expiresAt: Type.Date(),
  /**
   * Used status
   */
  used: Type.Boolean(),
  /**
   * Creation timestamp
   */
  createdAt: Type.Date(),
})

export type PasswordReset = Static<typeof PasswordResetSchema>

export const UserRelationsSchema = Type.Object({
  ...UserSchema.properties,
  oauthAccounts: Type.Array(OAuthAccountSchema),
  twoFactorSetting: TwoFactorSettingSchema,
  refreshTokens: Type.Array(RefreshTokenSchema),
  emailVerifications: Type.Array(EmailVerificationSchema),
  passwordResets: Type.Array(PasswordResetSchema),
})

export type UserRelations = Static<typeof UserRelationsSchema>

export const OAuthAccountRelationsSchema = Type.Object({
  ...OAuthAccountSchema.properties,
  user: UserSchema,
})

export type OAuthAccountRelations = Static<typeof OAuthAccountRelationsSchema>

export const TwoFactorSettingRelationsSchema = Type.Object({
  ...TwoFactorSettingSchema.properties,
  user: UserSchema,
})

export type TwoFactorSettingRelations = Static<typeof TwoFactorSettingRelationsSchema>

export const RefreshTokenRelationsSchema = Type.Object({
  ...RefreshTokenSchema.properties,
  user: UserSchema,
})

export type RefreshTokenRelations = Static<typeof RefreshTokenRelationsSchema>

export const EmailVerificationRelationsSchema = Type.Object({
  ...EmailVerificationSchema.properties,
  user: UserSchema,
})

export type EmailVerificationRelations = Static<typeof EmailVerificationRelationsSchema>

export const PasswordResetRelationsSchema = Type.Object({
  ...PasswordResetSchema.properties,
  user: UserSchema,
})

export type PasswordResetRelations = Static<typeof PasswordResetRelationsSchema>
