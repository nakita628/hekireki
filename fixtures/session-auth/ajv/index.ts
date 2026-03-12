import type { FromSchema } from 'json-schema-to-ts'

export const UserSchema = {
  type: 'object' as const,
  properties: {
    /** User ID */
    id: { type: 'string' as const },
    /** Email address */
    email: { type: 'string' as const },
    /** Hashed password */
    passwordHash: { type: 'string' as const },
    /** Display name */
    name: { type: 'string' as const },
    /** User role */
    role: { enum: ['ADMIN', 'USER'] as const },
    /** Account active status */
    isActive: { type: 'boolean' as const },
    /** Account creation timestamp */
    createdAt: { type: 'string' as const, format: 'date-time' as const },
    /** Last update timestamp */
    updatedAt: { type: 'string' as const, format: 'date-time' as const },
  },
  required: [
    'id',
    'email',
    'passwordHash',
    'name',
    'role',
    'isActive',
    'createdAt',
    'updatedAt',
  ] as const,
  additionalProperties: false,
} as const

export type User = FromSchema<typeof UserSchema>

export const SessionSchema = {
  type: 'object' as const,
  properties: {
    /** Session ID */
    id: { type: 'string' as const },
    /** Session token */
    token: { type: 'string' as const },
    /** User ID */
    userId: { type: 'string' as const },
    /** Session expiration */
    expiresAt: { type: 'string' as const, format: 'date-time' as const },
    /** Client IP address */
    ipAddress: { type: 'string' as const },
    /** Client user agent */
    userAgent: { type: 'string' as const },
    /** Session creation timestamp */
    createdAt: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['id', 'token', 'userId', 'expiresAt', 'createdAt'] as const,
  additionalProperties: false,
} as const

export type Session = FromSchema<typeof SessionSchema>

export const LoginHistorySchema = {
  type: 'object' as const,
  properties: {
    /** Login history ID */
    id: { type: 'string' as const },
    /** User ID */
    userId: { type: 'string' as const },
    /** Client IP address */
    ipAddress: { type: 'string' as const },
    /** Client user agent */
    userAgent: { type: 'string' as const },
    /** Login success status */
    success: { type: 'boolean' as const },
    /** Login timestamp */
    createdAt: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['id', 'userId', 'ipAddress', 'success', 'createdAt'] as const,
  additionalProperties: false,
} as const

export type LoginHistory = FromSchema<typeof LoginHistorySchema>

export const PasswordHistorySchema = {
  type: 'object' as const,
  properties: {
    /** Password history ID */
    id: { type: 'string' as const },
    /** User ID */
    userId: { type: 'string' as const },
    /** Hashed password */
    passwordHash: { type: 'string' as const },
    /** Change timestamp */
    createdAt: { type: 'string' as const, format: 'date-time' as const },
  },
  required: ['id', 'userId', 'passwordHash', 'createdAt'] as const,
  additionalProperties: false,
} as const

export type PasswordHistory = FromSchema<typeof PasswordHistorySchema>

export const UserRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...UserSchema.properties,
    sessions: { type: 'array' as const, items: SessionSchema },
    loginHistories: { type: 'array' as const, items: LoginHistorySchema },
    passwordHistories: { type: 'array' as const, items: PasswordHistorySchema },
  },
  additionalProperties: false,
} as const

export type UserRelations = FromSchema<typeof UserRelationsSchema>

export const SessionRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...SessionSchema.properties,
    user: UserSchema,
  },
  additionalProperties: false,
} as const

export type SessionRelations = FromSchema<typeof SessionRelationsSchema>

export const LoginHistoryRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...LoginHistorySchema.properties,
    user: UserSchema,
  },
  additionalProperties: false,
} as const

export type LoginHistoryRelations = FromSchema<typeof LoginHistoryRelationsSchema>

export const PasswordHistoryRelationsSchema = {
  type: 'object' as const,
  properties: {
    ...PasswordHistorySchema.properties,
    user: UserSchema,
  },
  additionalProperties: false,
} as const

export type PasswordHistoryRelations = FromSchema<typeof PasswordHistoryRelationsSchema>
