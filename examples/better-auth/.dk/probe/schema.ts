import { sql } from 'drizzle-orm'
import { index, mysqlTable, text, varchar } from 'drizzle-orm/mysql-core'

export const probe = mysqlTable(
  'probe',
  { id: varchar('id', { length: 191 }).primaryKey(), body: text('body').notNull() },
  (table) => [index('probe_body_idx').on(sql`${table.body}(191)`)],
)
