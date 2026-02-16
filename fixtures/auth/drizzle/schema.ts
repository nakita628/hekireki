import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'
import { createId } from '@paralleldrive/cuid2'

export const user = sqliteTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => createId()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: integer('emailVerified', { mode: 'timestamp' }),
  image: text('image'),
  password: text('password'),
  role: text('role', { enum: ['ADMIN', 'USER'] })
    .notNull()
    .default('USER'),
  isTwoFactorEnabled: integer('isTwoFactorEnabled', { mode: 'boolean' }).default(false),
})

export const account = sqliteTable(
  'account',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text('userId').notNull(),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (table) => [unique().on(table.provider, table.providerAccountId)],
)

export const verificationToken = sqliteTable(
  'verification_token',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    email: text('email').notNull(),
    token: text('token').notNull().unique(),
    expires: integer('expires', { mode: 'timestamp' }).notNull(),
  },
  (table) => [unique().on(table.email, table.token)],
)

export const passwordResetToken = sqliteTable(
  'password_reset_token',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    email: text('email').notNull(),
    token: text('token').notNull().unique(),
    expires: integer('expires', { mode: 'timestamp' }).notNull(),
  },
  (table) => [unique().on(table.email, table.token)],
)

export const twoFactorToken = sqliteTable(
  'two_factor_token',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    email: text('email').notNull(),
    token: text('token').notNull().unique(),
    expires: integer('expires', { mode: 'timestamp' }).notNull(),
  },
  (table) => [unique().on(table.email, table.token)],
)

export const twoFactorConfirmation = sqliteTable(
  'two_factor_confirmation',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text('userId').notNull().unique(),
  },
  (table) => [unique().on(table.userId)],
)

export const userRelations = relations(user, ({ one, many }) => ({
  accounts: many(account),
  twoFactorConfirmation: one(twoFactorConfirmation),
}))

export const accountRelations = relations(account, ({ one, many }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}))

export const twoFactorConfirmationRelations = relations(twoFactorConfirmation, ({ one, many }) => ({
  user: one(user, { fields: [twoFactorConfirmation.userId], references: [user.id] }),
}))
