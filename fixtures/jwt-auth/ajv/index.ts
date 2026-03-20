import type { FromSchema } from 'json-schema-to-ts'

export const UserSchema = {
  type: 'object' as const,
  properties: {
    /**

     * User ID

     */
    id: { type: 'string' as const },
    /**

     * Email address

     */
    email: { type: 'string' as const },
    /**

     * Hashed password (null for OAuth-only users)

     */
    passwordHash: { type: 'string' as const },
    /**

     * Display name

     */
    name: { type: 'string' as const },
    /**

     * Profile image URL

     */
    avatarUrl: { type: 'string' as const },
    /**

     * User role

     */
    role: { enum: ['ADMIN', 'USER', 'GUEST'] as const },
    /**

     * Email verification status

     */
    emailVerified: { type: 'boolean' as const },
    /**

     * Account active status

     */
    isActive: { type: 'boolean' as const },
    /**

     * Account creation timestamp

     */
    createdAt: { type: 'string' as const, format: 'date-time' as const },
    /**

     * Last update timestamp

     */
    updatedAt: { type: 'string' as const, format: 'date-time' as const },
    /**

     * Last login timestamp

     */
    lastLoginAt: { type: 'string' as const, format: 'date-time' as const },
  },
  required: [
    'id',
    'email',
    'name',
    'role',
    'emailVerified',
    'isActive',
    'createdAt',
    'updatedAt',
  ] as const,
  additionalProperties: false,
} as const

export type User = FromSchema<typeof UserSchema>

export const OAuthAccountSchema = {
  type: 'object' as const,
  properties: {
    /**

     * OAuth account ID

     */
    id: { type: 'string' as const },
    /**

     * User ID

     */
    userId: { type: 'string' as const },
    /**

     * OAuth provider

     */
    provider: { enum: ['GOOGLE', 'GITHUB', 'FACEBOOK', 'TWITTER', 'APPLE'] as const },
    /**

     * Provider account ID

     */
    providerAccountId: { type: 'string' as const },
    /**

     * Access token from provider

     */
    accessToken: { type: 'string' as const },
    /**

     * Refresh token from provider

     */
    refreshToken: { type: 'string' as const },
    /**

     * Token expiration timestamp

     */
    expiresAt: { type: 'string' as const, format: 'date-time' as const },
    /**

     * Account creation timestamp

     */
    createdAt: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['id', 'userId', 'provider', 'providerAccountId', 'createdAt'] as const,
  additionalProperties: false,
} as const

export type OAuthAccount = FromSchema<typeof OAuthAccountSchema>

export const TwoFactorSettingSchema = {
  type: 'object' as const,
  properties: {
    /**

     * 2FA setting ID

     */
    id: { type: 'string' as const },
    /**

     * User ID

     */
    userId: { type: 'string' as const },
    /**

     * 2FA enabled status

     */
    enabled: { type: 'boolean' as const },
    /**

     * 2FA method

     */
    method: { enum: ['TOTP', 'SMS', 'EMAIL'] as const },
    /**

     * TOTP secret (encrypted)

     */
    totpSecret: { type: 'string' as const },
    /**

     * Phone number for SMS (E.164 format)

     */
    phoneNumber: { type: 'string' as const },
    /**

     * Backup codes (hashed, JSON array)

     */
    backupCodes: { type: 'string' as const },
    /**

     * Last verified timestamp

     */
    verifiedAt: { type: 'string' as const, format: 'date-time' as const },
    /**

     * Creation timestamp

     */
    createdAt: { type: 'string' as const, format: 'date-time' as const },
    /**

     * Last update timestamp

     */
    updatedAt: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['id', 'userId', 'enabled', 'createdAt', 'updatedAt'] as const,
  additionalProperties: false,
} as const

export type TwoFactorSetting = FromSchema<typeof TwoFactorSettingSchema>

export const RefreshTokenSchema = {
  type: 'object' as const,
  properties: {
    /**

     * Refresh token ID

     */
    id: { type: 'string' as const },
    /**

     * User ID

     */
    userId: { type: 'string' as const },
    /**

     * Token hash (SHA-256)

     */
    tokenHash: { type: 'string' as const },
    /**

     * Device/client identifier

     */
    deviceInfo: { type: 'string' as const },
    /**

     * IP address at creation

     */
    ipAddress: { type: 'string' as const },
    /**

     * Token expiration timestamp

     */
    expiresAt: { type: 'string' as const, format: 'date-time' as const },
    /**

     * Token creation timestamp

     */
    createdAt: { type: 'string' as const, format: 'date-time' as const },
    /**

     * Revocation status

     */
    revoked: { type: 'boolean' as const },
  },
  required: ['id', 'userId', 'tokenHash', 'expiresAt', 'createdAt', 'revoked'] as const,
  additionalProperties: false,
} as const

export type RefreshToken = FromSchema<typeof RefreshTokenSchema>

export const EmailVerificationSchema = {
  type: 'object' as const,
  properties: {
    /**

     * Verification ID

     */
    id: { type: 'string' as const },
    /**

     * User ID

     */
    userId: { type: 'string' as const },
    /**

     * Verification token (hashed)

     */
    tokenHash: { type: 'string' as const },
    /**

     * Token expiration timestamp

     */
    expiresAt: { type: 'string' as const, format: 'date-time' as const },
    /**

     * Creation timestamp

     */
    createdAt: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['id', 'userId', 'tokenHash', 'expiresAt', 'createdAt'] as const,
  additionalProperties: false,
} as const

export type EmailVerification = FromSchema<typeof EmailVerificationSchema>

export const PasswordResetSchema = {
  type: 'object' as const,
  properties: {
    /**

     * Reset ID

     */
    id: { type: 'string' as const },
    /**

     * User ID

     */
    userId: { type: 'string' as const },
    /**

     * Reset token (hashed)

     */
    tokenHash: { type: 'string' as const },
    /**

     * Token expiration timestamp

     */
    expiresAt: { type: 'string' as const, format: 'date-time' as const },
    /**

     * Used status

     */
    used: { type: 'boolean' as const },
    /**

     * Creation timestamp

     */
    createdAt: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['id', 'userId', 'tokenHash', 'expiresAt', 'used', 'createdAt'] as const,
  additionalProperties: false,
} as const

export type PasswordReset = FromSchema<typeof PasswordResetSchema>

export const UserRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...UserSchema.properties,
    oauthAccounts: { type: 'array' as const, items: OAuthAccountSchema },
    twoFactorSetting: TwoFactorSettingSchema,
    refreshTokens: { type: 'array' as const, items: RefreshTokenSchema },
    emailVerifications: { type: 'array' as const, items: EmailVerificationSchema },
    passwordResets: { type: 'array' as const, items: PasswordResetSchema },
  },
  additionalProperties: false,
} as const

export type UserRelations = FromSchema<typeof UserRelationsSchema>

export const OAuthAccountRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...OAuthAccountSchema.properties,
    user: UserSchema,
  },
  additionalProperties: false,
} as const

export type OAuthAccountRelations = FromSchema<typeof OAuthAccountRelationsSchema>

export const TwoFactorSettingRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...TwoFactorSettingSchema.properties,
    user: UserSchema,
  },
  additionalProperties: false,
} as const

export type TwoFactorSettingRelations = FromSchema<typeof TwoFactorSettingRelationsSchema>

export const RefreshTokenRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...RefreshTokenSchema.properties,
    user: UserSchema,
  },
  additionalProperties: false,
} as const

export type RefreshTokenRelations = FromSchema<typeof RefreshTokenRelationsSchema>

export const EmailVerificationRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...EmailVerificationSchema.properties,
    user: UserSchema,
  },
  additionalProperties: false,
} as const

export type EmailVerificationRelations = FromSchema<typeof EmailVerificationRelationsSchema>

export const PasswordResetRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...PasswordResetSchema.properties,
    user: UserSchema,
  },
  additionalProperties: false,
} as const

export type PasswordResetRelations = FromSchema<typeof PasswordResetRelationsSchema>
