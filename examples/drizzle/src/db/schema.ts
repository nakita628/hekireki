import { customType, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

const utcDateTime = customType<{ data: Date; driverData: string | number }>({
  dataType: () => 'datetime',
  toDriver: (value) => value.toISOString().replace('Z', '+00:00'),
  fromDriver: (value) => {
    if (typeof value === 'number' || /^-?\d+$/u.test(value)) return new Date(Number(value))
    const iso = value.replace(' ', 'T').replace(/ (?=[+-]\d\d:?\d\d$)/u, '')
    return new Date(/T[\d:.]+$/u.test(iso) ? `${iso}Z` : iso)
  },
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

export const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull().unique(),
  at: utcDateTime('at').notNull(),
  endsAt: utcDateTime('ends_at'),
  createdAt: utcDateTime('created_at').notNull().$defaultFn(utcNow),
  updatedAt: utcDateTime('updated_at').notNull().$onUpdate(utcNow),
  syncedAt: utcDateTime('synced_at').notNull().$onUpdate(utcNow),
  since: utcDateTime('since').notNull().default(new Date('2020-01-01T00:00:00+00:00')),
})
