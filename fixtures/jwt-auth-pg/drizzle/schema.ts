import cuid from 'cuid'
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

export const roleEnum = pgEnum('Role', ['ADMIN', 'USER', 'GUEST'])
export const oauthProviderEnum = pgEnum('OAuthProvider', [
  'GOOGLE',
  'GITHUB',
  'FACEBOOK',
  'TWITTER',
  'APPLE',
])
export const twoFactorMethodEnum = pgEnum('TwoFactorMethod', ['TOTP', 'SMS', 'EMAIL'])

export const users = pgTable('users', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash'),
  name: varchar('name', { length: 100 }).notNull(),
  avatarUrl: text('avatar_url'),
  role: roleEnum('role').notNull().default('USER'),
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

export const oauthAccounts = pgTable(
  'oauth_accounts',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: oauthProviderEnum('provider').notNull(),
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

export const twoFactorSettings = pgTable('two_factor_settings', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').notNull().default(false),
  method: twoFactorMethodEnum('method'),
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

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => cuid()),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    deviceInfo: text('device_info'),
    ipAddress: varchar('ip_address', { length: 45 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revoked: boolean('revoked').notNull().default(false),
  },
  (table) => [index('idx_refresh_tokens_userId').on(table.userId)],
)

export const emailVerifications = pgTable(
  'email_verifications',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_email_verifications_userId').on(table.userId)],
)

export const passwordResets = pgTable(
  'password_resets',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    used: boolean('used').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_password_resets_userId').on(table.userId)],
)

export const usersRelations = relations(users, ({ one, many }) => ({
  oauthAccounts: many(oauthAccounts),
  twoFactorSetting: one(twoFactorSettings),
  refreshTokens: many(refreshTokens),
  emailVerifications: many(emailVerifications),
  passwordResets: many(passwordResets),
}))

export const oauthAccountsRelations = relations(oauthAccounts, ({ one }) => ({
  user: one(users, { fields: [oauthAccounts.userId], references: [users.id] }),
}))

export const twoFactorSettingsRelations = relations(twoFactorSettings, ({ one }) => ({
  user: one(users, { fields: [twoFactorSettings.userId], references: [users.id] }),
}))

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}))

export const emailVerificationsRelations = relations(emailVerifications, ({ one }) => ({
  user: one(users, { fields: [emailVerifications.userId], references: [users.id] }),
}))

export const passwordResetsRelations = relations(passwordResets, ({ one }) => ({
  user: one(users, { fields: [passwordResets.userId], references: [users.id] }),
}))
