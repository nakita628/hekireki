import { customType, datetime, int, mysqlTable, text, timestamp } from 'drizzle-orm/mysql-core'
import { sql } from 'drizzle-orm'

const utcDate = customType<{ data: Date; driverData: string }>({
  dataType: () => 'date',
  toDriver: (value) => value.toISOString().slice(0, 10),
  fromDriver: (value) => new Date(value),
})

const utcTime = customType<{
  data: Date
  driverData: string
  config: { precision?: number }
}>({
  dataType: (config) => `time${config?.precision === undefined ? '' : `(${config.precision})`}`,
  toDriver: (value) => value.toISOString().slice(11, 23),
  fromDriver: (value) => new Date(`1970-01-01T${value}Z`),
})

const utcNow = (() => {
  let now: Date | undefined
  return () => {
    if (now === undefined) {
      now = new Date()
      queueMicrotask(() => {
        now = undefined
      })
    }
    return now
  }
})()

export const moments = mysqlTable('moments', {
  id: int('id').primaryKey().autoincrement(),
  name: text('name').notNull().unique(),
  at: datetime('at', { fsp: 3 }).notNull(),
  precise: datetime('precise', { fsp: 6 }).notNull(),
  whole: datetime('whole', { fsp: 0 }).notNull(),
  stamped: timestamp('stamped', { fsp: 3 }).notNull(),
  day: utcDate('day').notNull(),
  dayOpt: utcDate('day_opt'),
  opensAt: utcTime('opens_at', { precision: 3 }).notNull(),
  launch: utcDate('launch').notNull().default(new Date('2024-01-15T00:00:00+00:00')),
  createdAt: timestamp('created_at', { fsp: 3 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`)
    .$defaultFn(utcNow),
  updatedAt: datetime('updated_at', { fsp: 3 }).notNull().$onUpdate(utcNow),
})
