import { createId } from '@paralleldrive/cuid2'
import { relations } from 'drizzle-orm'
import {
  boolean,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

export const user = pgTable('users', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash'),
  name: varchar('name', { length: 100 }).notNull(),
  avatarUrl: text('avatar_url'),
  role: pgEnum('Role', ['ADMIN', 'USER', 'GUEST'])('role').notNull().default('USER'),
  creditBalance: numeric('credit_balance', { precision: 10, scale: 2 }).notNull().default('0'),
  emailVerified: boolean('email_verified').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
})

export const oAuthAccount = pgTable(
  'oauth_accounts',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    provider: pgEnum('OAuthProvider', ['GOOGLE', 'GITHUB', 'FACEBOOK', 'TWITTER', 'APPLE'])(
      'provider',
    ).notNull(),
    providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique().on(table.provider, table.providerAccountId),
    index('idx_oauth_accounts_userId').on(table.userId),
  ],
)

export const twoFactorSetting = pgTable('two_factor_settings', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  method: pgEnum('TwoFactorMethod', ['TOTP', 'SMS', 'EMAIL'])('method'),
  totpSecret: text('totp_secret'),
  phoneNumber: varchar('phone_number', { length: 20 }),
  backupCodes: text('backup_codes'),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const refreshToken = pgTable(
  'refresh_tokens',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    deviceInfo: text('device_info'),
    ipAddress: varchar('ip_address', { length: 45 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revoked: boolean('revoked').notNull().default(false),
  },
  (table) => [index('idx_refresh_tokens_userId').on(table.userId)],
)

export const emailVerification = pgTable(
  'email_verifications',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_email_verifications_userId').on(table.userId)],
)

export const passwordReset = pgTable(
  'password_resets',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    used: boolean('used').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_password_resets_userId').on(table.userId)],
)

export const userRelations = relations(user, ({ one, many }) => ({
  oauthAccounts: many(oAuthAccount),
  twoFactorSetting: one(twoFactorSetting),
  refreshTokens: many(refreshToken),
  emailVerifications: many(emailVerification),
  passwordResets: many(passwordReset),
}))

export const oAuthAccountRelations = relations(oAuthAccount, ({ one }) => ({
  user: one(user, { fields: [oAuthAccount.userId], references: [user.id] }),
}))

export const twoFactorSettingRelations = relations(twoFactorSetting, ({ one }) => ({
  user: one(user, { fields: [twoFactorSetting.userId], references: [user.id] }),
}))

export const refreshTokenRelations = relations(refreshToken, ({ one }) => ({
  user: one(user, { fields: [refreshToken.userId], references: [user.id] }),
}))

export const emailVerificationRelations = relations(emailVerification, ({ one }) => ({
  user: one(user, { fields: [emailVerification.userId], references: [user.id] }),
}))

export const passwordResetRelations = relations(passwordReset, ({ one }) => ({
  user: one(user, { fields: [passwordReset.userId], references: [user.id] }),
}))
