import {
  customType,
  foreignKey,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { defineRelations, sql } from 'drizzle-orm'

const moneyDecimal = customType<{ data: string; driverData: string | number }>({
  dataType: () => 'money',
  codec: 'money',
  forJsonSelect: (identifier, sql, arrayDimensions) =>
    arrayDimensions ? sql`${identifier}::numeric[]::text[]` : sql`${identifier}::numeric::text`,
  fromDriver: (value) => {
    if (typeof value === 'number' || /^-?\d+(\.\d+)?$/u.test(value)) return String(value)
    const money = /^(-?)\$(\d{1,3}(?:,\d{3})*\.\d{2})$/u.exec(value)
    if (money === null) {
      throw new Error(
        `money ${value} is not in the C / en_US form (lc_monetary): cast it with an instance codec`,
      )
    }
    return `${money[1]}${money[2]?.replaceAll(',', '') ?? ''}`
  },
})

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

/** A DateTime in every column PostgreSQL has for one. */
export const moments = pgTable(
  'moments',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
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
  },
  (table) => [uniqueIndex('moments_name_key').on(table.name)],
)

/** A Decimal in PostgreSQL's money, read through a relation too. */
export const owner = pgTable(
  'Owner',
  { id: serial('id').primaryKey(), name: text('name').notNull() },
  (table) => [uniqueIndex('Owner_name_key').on(table.name)],
)

export const purses = pgTable(
  'purses',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    cash: moneyDecimal('cash').notNull(),
    spare: moneyDecimal('spare'),
    history: moneyDecimal('history').array(),
    fee: moneyDecimal('fee').notNull().default('1.5'),
    ownerId: integer('owner_id').notNull(),
  },
  (table) => [
    uniqueIndex('purses_name_key').on(table.name),
    foreignKey({
      name: 'purses_owner_id_fkey',
      columns: [table.ownerId],
      foreignColumns: [owner.id],
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
  ],
)

export const relations = defineRelations({ moments, owner, purses }, (r) => ({
  owner: { purses: r.many.purses() },
  purses: { owner: r.one.owner({ from: r.purses.ownerId, to: r.owner.id, optional: false }) },
}))
