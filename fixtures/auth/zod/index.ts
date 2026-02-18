import * as z from 'zod'

export const UserSchema = z.object({
  /**
   * Unique user ID
   */
  id: z.cuid(),
  /**
   * Display name
   */
  name: z.string().min(1).max(50).exactOptional(),
  /**
   * Email address
   */
  email: z.email().exactOptional(),
  /**
   * Date when the email was verified
   */
  emailVerified: z.iso.date().exactOptional(),
  /**
   * Profile image URL
   */
  image: z.url().exactOptional(),
  /**
   * Hashed password
   */
  password: z.string().min(8).exactOptional(),
  /**
   * Role of the user (ADMIN or USER)
   */
  role: z.enum(['ADMIN', 'USER']),
  /**
   * Whether 2FA is enabled
   */
  isTwoFactorEnabled: z.boolean().exactOptional(),
})

export type User = z.infer<typeof UserSchema>

export const AccountSchema = z.object({
  /**
   * Unique account ID
   */
  id: z.cuid(),
  /**
   * Reference to the user ID
   */
  userId: z.string(),
  /**
   * Type of account (e.g., oauth, email)
   */
  type: z.string(),
  /**
   * Name of the provider (e.g., google, github)
   */
  provider: z.string(),
  /**
   * Provider-specific account ID
   */
  providerAccountId: z.string(),
  /**
   * Refresh token
   */
  refresh_token: z.string().exactOptional(),
  /**
   * Access token
   */
  access_token: z.string().exactOptional(),
  /**
   * Expiration time (UNIX timestamp)
   */
  expires_at: z.int().exactOptional(),
  /**
   * Token type (e.g., Bearer)
   */
  token_type: z.string().optional().exactOptional(),
  /**
   * OAuth scope
   */
  scope: z.string().optional().exactOptional(),
  /**
   * ID token
   */
  id_token: z.string().optional().exactOptional(),
  /**
   * Session state
   */
  session_state: z.string().optional().exactOptional(),
})

export type Account = z.infer<typeof AccountSchema>

export const VerificationTokenSchema = z.object({
  /**
   * Token ID
   */
  id: z.cuid(),
  /**
   * Email address
   */
  email: z.email(),
  /**
   * Token string
   */
  token: z.string(),
  /**
   * Expiry time
   */
  expires: z.iso.date(),
})

export type VerificationToken = z.infer<typeof VerificationTokenSchema>

export const PasswordResetTokenSchema = z.object({
  /**
   * Token ID
   */
  id: z.cuid(),
  /**
   * Email address
   */
  email: z.email(),
  /**
   * Token string
   */
  token: z.string(),
  /**
   * Expiry time
   */
  expires: z.iso.date(),
})

export type PasswordResetToken = z.infer<typeof PasswordResetTokenSchema>

export const TwoFactorTokenSchema = z.object({
  /**
   * Token ID
   */
  id: z.cuid(),
  /**
   * Email address
   */
  email: z.email(),
  /**
   * Token string
   */
  token: z.string(),
  /**
   * Expiry time
   */
  expires: z.iso.date(),
})

export type TwoFactorToken = z.infer<typeof TwoFactorTokenSchema>

export const TwoFactorConfirmationSchema = z.object({
  /**
   * Confirmation ID
   */
  id: z.uuid(),
  /**
   * Reference to user
   */
  userId: z.string(),
})

export type TwoFactorConfirmation = z.infer<typeof TwoFactorConfirmationSchema>
