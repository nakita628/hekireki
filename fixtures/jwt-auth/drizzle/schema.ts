import { relations, sql } from 'drizzle-orm'
import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'

export const user = sqliteTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull().unique(),
  passwordHash: text('passwordHash'),
  name: text('name').notNull(),
  avatarUrl: text('avatarUrl'),
  role: text('role', { enum: ['ADMIN', 'USER', 'GUEST'] })
    .notNull()
    .default('USER'),
  emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull().default(false),
  isActive: integer('isActive', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
    .$onUpdate(() => new Date()),
  lastLoginAt: integer('lastLoginAt', { mode: 'timestamp_ms' }),
})

export const oauthAccount = sqliteTable(
  'oauth_account',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    provider: text('provider', {
      enum: ['GOOGLE', 'GITHUB', 'FACEBOOK', 'TWITTER', 'APPLE'],
    }).notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    accessToken: text('accessToken'),
    refreshToken: text('refreshToken'),
    expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [unique().on(table.provider, table.providerAccountId)],
)

export const twoFactorSetting = sqliteTable('two_factor_setting', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('userId')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  method: text('method', { enum: ['TOTP', 'SMS', 'EMAIL'] }),
  totpSecret: text('totpSecret'),
  phoneNumber: text('phoneNumber'),
  backupCodes: text('backupCodes'),
  verifiedAt: integer('verifiedAt', { mode: 'timestamp_ms' }),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)
    .$onUpdate(() => new Date()),
})

export const refreshToken = sqliteTable('refresh_token', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  tokenHash: text('tokenHash').notNull().unique(),
  deviceInfo: text('deviceInfo'),
  ipAddress: text('ipAddress'),
  expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  revoked: integer('revoked', { mode: 'boolean' }).notNull().default(false),
})

export const emailVerification = sqliteTable('email_verification', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  tokenHash: text('tokenHash').notNull().unique(),
  expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
})

export const passwordReset = sqliteTable('password_reset', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  tokenHash: text('tokenHash').notNull().unique(),
  expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
  used: integer('used', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
})

export const userRelations = relations(user, ({ one, many }) => ({
  oauthAccounts: many(oauthAccount),
  twoFactorSetting: one(twoFactorSetting),
  refreshTokens: many(refreshToken),
  emailVerifications: many(emailVerification),
  passwordResets: many(passwordReset),
}))

export const oauthAccountRelations = relations(oauthAccount, ({ one }) => ({
  user: one(user, { fields: [oauthAccount.userId], references: [user.id] }),
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
