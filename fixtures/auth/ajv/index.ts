import type { FromSchema } from 'json-schema-to-ts'

export const UserSchema = {
  type: 'object' as const,
  properties: {
    /**
     * Unique user ID
     */
    id: { type: 'string' as const },
    /**
     * Display name
     */
    name: { type: 'string' as const },
    /**
     * Email address
     */
    email: { type: 'string' as const },
    /**
     * Date when the email was verified
     */
    emailVerified: { type: 'string' as const, format: 'date-time' as const },
    /**
     * Profile image URL
     */
    image: { type: 'string' as const },
    /**
     * Hashed password
     */
    password: { type: 'string' as const },
    /**
     * Role of the user (ADMIN or USER)
     */
    role: { enum: ['ADMIN', 'USER'] as const },
    /**
     * Whether 2FA is enabled
     */
    isTwoFactorEnabled: { type: 'boolean' as const },
  },
  required: ['id', 'role'] as const,
  additionalProperties: false,
} as const

export type User = FromSchema<typeof UserSchema>

export const AccountSchema = {
  type: 'object' as const,
  properties: {
    /**
     * Unique account ID
     */
    id: { type: 'string' as const },
    /**
     * Reference to the user ID
     */
    userId: { type: 'string' as const },
    /**
     * Type of account (e.g., oauth, email)
     */
    type: { type: 'string' as const },
    /**
     * Name of the provider (e.g., google, github)
     */
    provider: { type: 'string' as const },
    /**
     * Provider-specific account ID
     */
    providerAccountId: { type: 'string' as const },
    /**
     * Refresh token
     */
    refresh_token: { type: 'string' as const },
    /**
     * Access token
     */
    access_token: { type: 'string' as const },
    /**
     * Expiration time (UNIX timestamp)
     */
    expires_at: { type: 'integer' as const },
    /**
     * Token type (e.g., Bearer)
     */
    token_type: { type: 'string' as const },
    /**
     * OAuth scope
     */
    scope: { type: 'string' as const },
    /**
     * ID token
     */
    id_token: { type: 'string' as const },
    /**
     * Session state
     */
    session_state: { type: 'string' as const },
  },
  required: ['id', 'userId', 'type', 'provider', 'providerAccountId'] as const,
  additionalProperties: false,
} as const

export type Account = FromSchema<typeof AccountSchema>

export const VerificationTokenSchema = {
  type: 'object' as const,
  properties: {
    /**
     * Token ID
     */
    id: { type: 'string' as const },
    /**
     * Email address
     */
    email: { type: 'string' as const },
    /**
     * Token string
     */
    token: { type: 'string' as const },
    /**
     * Expiry time
     */
    expires: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['id', 'email', 'token', 'expires'] as const,
  additionalProperties: false,
} as const

export type VerificationToken = FromSchema<typeof VerificationTokenSchema>

export const PasswordResetTokenSchema = {
  type: 'object' as const,
  properties: {
    /**
     * Token ID
     */
    id: { type: 'string' as const },
    /**
     * Email address
     */
    email: { type: 'string' as const },
    /**
     * Token string
     */
    token: { type: 'string' as const },
    /**
     * Expiry time
     */
    expires: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['id', 'email', 'token', 'expires'] as const,
  additionalProperties: false,
} as const

export type PasswordResetToken = FromSchema<typeof PasswordResetTokenSchema>

export const TwoFactorTokenSchema = {
  type: 'object' as const,
  properties: {
    /**
     * Token ID
     */
    id: { type: 'string' as const },
    /**
     * Email address
     */
    email: { type: 'string' as const },
    /**
     * Token string
     */
    token: { type: 'string' as const },
    /**
     * Expiry time
     */
    expires: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['id', 'email', 'token', 'expires'] as const,
  additionalProperties: false,
} as const

export type TwoFactorToken = FromSchema<typeof TwoFactorTokenSchema>

export const TwoFactorConfirmationSchema = {
  type: 'object' as const,
  properties: {
    /**
     * Confirmation ID
     */
    id: { type: 'string' as const },
    /**
     * Reference to user
     */
    userId: { type: 'string' as const },
  },
  required: ['id', 'userId'] as const,
  additionalProperties: false,
} as const

export type TwoFactorConfirmation = FromSchema<typeof TwoFactorConfirmationSchema>
