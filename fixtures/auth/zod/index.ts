import * as z from 'zod'

export const UserSchema = z.object({
  /**
   * Unique user ID
   */
  id: z.cuid(),
  /**
   * Display name
   */
  name: z.string().min(1).max(50).optional(),
  /**
   * Email address
   */
  email: z.email().optional(),
  /**
   * Date when the email was verified
   */
  emailVerified: z.iso.date().optional(),
  /**
   * Profile image URL
   */
  image: z.url().optional(),
  /**
   * Hashed password
   */
  password: z.string().min(8).optional(),
  /**
   * Role of the user (ADMIN or USER)
   */
  role: z.unknown(),
  /**
   * Whether 2FA is enabled
   */
  isTwoFactorEnabled: z.boolean().optional(),
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
  refresh_token: z.string().optional(),
  /**
   * Access token
   */
  access_token: z.string().optional(),
  /**
   * Expiration time (UNIX timestamp)
   */
  expires_at: z.int().optional(),
  /**
   * Token type (e.g., Bearer)
   */
  token_type: z.string().optional().optional(),
  /**
   * OAuth scope
   */
  scope: z.string().optional().optional(),
  /**
   * ID token
   */
  id_token: z.string().optional().optional(),
  /**
   * Session state
   */
  session_state: z.string().optional().optional(),
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

export const UserRelationsSchema = z.object({
  ...UserSchema.shape,
  accounts: z.array(AccountSchema),
  twoFactorConfirmation: TwoFactorConfirmationSchema,
})

export type UserRelations = z.infer<typeof UserRelationsSchema>

export const AccountRelationsSchema = z.object({ ...AccountSchema.shape, user: UserSchema })

export type AccountRelations = z.infer<typeof AccountRelationsSchema>

export const TwoFactorConfirmationRelationsSchema = z.object({
  ...TwoFactorConfirmationSchema.shape,
  user: UserSchema,
})

export type TwoFactorConfirmationRelations = z.infer<typeof TwoFactorConfirmationRelationsSchema>
