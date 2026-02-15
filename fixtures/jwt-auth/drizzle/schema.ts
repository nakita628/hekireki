import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'

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
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().defaultNow(),
  updatedAt: integer('updatedAt', { mode: 'timestamp' })
    .notNull()
    .$onUpdate(() => new Date()),
  lastLoginAt: integer('lastLoginAt', { mode: 'timestamp' }),
})
export const oAuthAccount = sqliteTable(
  'oauth_account',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text('userId').notNull(),
    provider: text('provider', {
      enum: ['GOOGLE', 'GITHUB', 'FACEBOOK', 'TWITTER', 'APPLE'],
    }).notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    accessToken: text('accessToken'),
    refreshToken: text('refreshToken'),
    expiresAt: integer('expiresAt', { mode: 'timestamp' }),
    createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueProviderProviderAccountId: unique().on(table.provider, table.providerAccountId),
  }),
)
export const twoFactorSetting = sqliteTable('two_factor_setting', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('userId').notNull().unique(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  method: text('method', { enum: ['TOTP', 'SMS', 'EMAIL'] }),
  totpSecret: text('totpSecret'),
  phoneNumber: text('phoneNumber'),
  backupCodes: text('backupCodes'),
  verifiedAt: integer('verifiedAt', { mode: 'timestamp' }),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().defaultNow(),
  updatedAt: integer('updatedAt', { mode: 'timestamp' })
    .notNull()
    .$onUpdate(() => new Date()),
})
export const refreshToken = sqliteTable('refresh_token', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('userId').notNull(),
  tokenHash: text('tokenHash').notNull().unique(),
  deviceInfo: text('deviceInfo'),
  ipAddress: text('ipAddress'),
  expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().defaultNow(),
  revoked: integer('revoked', { mode: 'boolean' }).notNull().default(false),
})
export const emailVerification = sqliteTable('email_verification', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('userId').notNull(),
  tokenHash: text('tokenHash').notNull().unique(),
  expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().defaultNow(),
})
export const passwordReset = sqliteTable('password_reset', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('userId').notNull(),
  tokenHash: text('tokenHash').notNull().unique(),
  expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
  used: integer('used', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().defaultNow(),
})

export const userRelations = relations(user, ({ one, many }) => ({
  oauthAccounts: many(oAuthAccount),
  twoFactorSetting: one(twoFactorSetting),
  refreshTokens: many(refreshToken),
  emailVerifications: many(emailVerification),
  passwordResets: many(passwordReset),
}))
export const oAuthAccountRelations = relations(oAuthAccount, ({ one, many }) => ({
  user: one(user, { fields: [oAuthAccount.userId], references: [user.id] }),
}))
export const twoFactorSettingRelations = relations(twoFactorSetting, ({ one, many }) => ({
  user: one(user, { fields: [twoFactorSetting.userId], references: [user.id] }),
}))
export const refreshTokenRelations = relations(refreshToken, ({ one, many }) => ({
  user: one(user, { fields: [refreshToken.userId], references: [user.id] }),
}))
export const emailVerificationRelations = relations(emailVerification, ({ one, many }) => ({
  user: one(user, { fields: [emailVerification.userId], references: [user.id] }),
}))
export const passwordResetRelations = relations(passwordReset, ({ one, many }) => ({
  user: one(user, { fields: [passwordReset.userId], references: [user.id] }),
}))
