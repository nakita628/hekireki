import * as v from 'valibot'

export const UserSchema = v.object({
  /**
   * Unique user ID
   */
  id: v.pipe(v.string(), v.cuid2()),
  /**
   * Display name
   */
  name: v.exactOptional(v.pipe(v.string(), v.minLength(1), v.maxLength(50))),
  /**
   * Email address
   */
  email: v.exactOptional(v.pipe(v.string(), v.email())),
  /**
   * Date when the email was verified
   */
  emailVerified: v.exactOptional(v.pipe(v.string(), v.isoDate())),
  /**
   * Profile image URL
   */
  image: v.exactOptional(v.pipe(v.string(), v.url())),
  /**
   * Hashed password
   */
  password: v.exactOptional(v.pipe(v.string(), v.minLength(8))),
  /**
   * Role of the user (ADMIN or USER)
   */
  role: v.picklist(['ADMIN', 'USER']),
  /**
   * Whether 2FA is enabled
   */
  isTwoFactorEnabled: v.exactOptional(v.boolean()),
})

export type User = v.InferInput<typeof UserSchema>

export const AccountSchema = v.object({
  /**
   * Unique account ID
   */
  id: v.pipe(v.string(), v.cuid2()),
  /**
   * Reference to the user ID
   */
  userId: v.string(),
  /**
   * Type of account (e.g., oauth, email)
   */
  type: v.string(),
  /**
   * Name of the provider (e.g., google, github)
   */
  provider: v.string(),
  /**
   * Provider-specific account ID
   */
  providerAccountId: v.string(),
  /**
   * Refresh token
   */
  refresh_token: v.exactOptional(v.nullish(v.string())),
  /**
   * Access token
   */
  access_token: v.exactOptional(v.nullish(v.string())),
  /**
   * Expiration time (UNIX timestamp)
   */
  expires_at: v.exactOptional(v.pipe(v.number(), v.integer())),
  /**
   * Token type (e.g., Bearer)
   */
  token_type: v.exactOptional(v.nullish(v.string())),
  /**
   * OAuth scope
   */
  scope: v.exactOptional(v.nullish(v.string())),
  /**
   * ID token
   */
  id_token: v.exactOptional(v.nullish(v.string())),
  /**
   * Session state
   */
  session_state: v.exactOptional(v.nullish(v.string())),
})

export type Account = v.InferInput<typeof AccountSchema>

export const VerificationTokenSchema = v.object({
  /**
   * Token ID
   */
  id: v.pipe(v.string(), v.cuid2()),
  /**
   * Email address
   */
  email: v.pipe(v.string(), v.email()),
  /**
   * Token string
   */
  token: v.string(),
  /**
   * Expiry time
   */
  expires: v.pipe(v.string(), v.isoDate()),
})

export type VerificationToken = v.InferInput<typeof VerificationTokenSchema>

export const PasswordResetTokenSchema = v.object({
  /**
   * Token ID
   */
  id: v.pipe(v.string(), v.cuid2()),
  /**
   * Email address
   */
  email: v.pipe(v.string(), v.email()),
  /**
   * Token string
   */
  token: v.string(),
  /**
   * Expiry time
   */
  expires: v.pipe(v.string(), v.isoDate()),
})

export type PasswordResetToken = v.InferInput<typeof PasswordResetTokenSchema>

export const TwoFactorTokenSchema = v.object({
  /**
   * Token ID
   */
  id: v.pipe(v.string(), v.cuid2()),
  /**
   * Email address
   */
  email: v.pipe(v.string(), v.email()),
  /**
   * Token string
   */
  token: v.string(),
  /**
   * Expiry time
   */
  expires: v.pipe(v.string(), v.isoDate()),
})

export type TwoFactorToken = v.InferInput<typeof TwoFactorTokenSchema>

export const TwoFactorConfirmationSchema = v.object({
  /**
   * Confirmation ID
   */
  id: v.pipe(v.string(), v.uuid()),
  /**
   * Reference to user
   */
  userId: v.string(),
})

export type TwoFactorConfirmation = v.InferInput<typeof TwoFactorConfirmationSchema>
