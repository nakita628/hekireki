import { customType, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'
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

const utcTimetz = customType<{
  data: Date
  driverData: string
  config: { precision?: number }
}>({
  dataType: (config) =>
    `time${config?.precision === undefined ? '' : `(${config.precision})`} with time zone`,
  toDriver: (value) => `${value.toISOString().slice(11, 23)}+00`,
  fromDriver: (value) => new Date(`1970-01-01T${value.replace(/[+-]\d\d(:?\d\d)?$/u, '')}Z`),
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

export const moments = pgTable('moments', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  at: timestamp('at', { precision: 3 }).notNull(),
  precise: timestamp('precise', { precision: 6 }).notNull(),
  whole: timestamp('whole', { precision: 0 }).notNull(),
  zoned: timestamp('zoned', { withTimezone: true, precision: 3 }).notNull(),
  day: utcDate('day').notNull(),
  dayOpt: utcDate('day_opt'),
  opensAt: utcTime('opens_at', { precision: 3 }).notNull(),
  zonedTime: utcTimetz('zoned_time', { precision: 3 }).notNull(),
  moments: timestamp('moments', { precision: 3 }).array(),
  days: utcDate('days').array(),
  today: utcDate('today')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
    .$defaultFn(utcNow),
  launch: utcDate('launch').notNull().default(new Date('2024-01-15T00:00:00+00:00')),
  bell: utcTime('bell').notNull().default(new Date('1970-01-01T10:30:00+00:00')),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`)
    .$defaultFn(utcNow),
  updatedAt: timestamp('updated_at', { precision: 3 }).notNull().$onUpdate(utcNow),
})
