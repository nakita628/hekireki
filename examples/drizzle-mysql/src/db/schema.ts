import {
  customType,
  datetime,
  foreignKey,
  int,
  mysqlTable,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core'
import { defineRelations, sql } from 'drizzle-orm'

const bytes = customType<{
  data: Uint8Array
  jsonData: string
  config: { type: string }
}>({
  dataType: (config) => config?.type ?? 'longblob',
  forJsonSelect: (identifier, sql) => sql`to_base64(${identifier})`,
  fromJson: (value) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0)),
})

const bitBoolean = customType<{
  data: boolean
  driverData: Uint8Array | number | bigint | string
  jsonData: number
}>({
  dataType: () => 'bit(1)',
  fromDriver: (value) => {
    if (typeof value === 'number' || typeof value === 'bigint') return value !== 0 && value !== 0n
    if (typeof value === 'string') return [...value].some((char) => char.charCodeAt(0) !== 0)
    return value.some((byte) => byte !== 0)
  },
  forJsonSelect: (identifier, sql) => sql`cast(${identifier} as unsigned)`,
  fromJson: (value) => value !== 0,
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

/** A DateTime in every column MySQL has for one. */
export const moments = mysqlTable(
  'moments',
  {
    id: int('id').primaryKey().autoincrement(),
    name: varchar('name', { length: 191 }).notNull(),
    at: datetime('at', { fsp: 3 }).notNull(),
    precise: datetime('precise', { fsp: 6 }).notNull(),
    whole: datetime('whole').notNull(),
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
  },
  (table) => [uniqueIndex('moments_name_key').on(table.name)],
)

/** A Boolean and a Bytes in MySQL's BIT, read through a relation too. */
export const panel = mysqlTable(
  'Panel',
  { id: int('id').primaryKey().autoincrement(), name: varchar('name', { length: 191 }).notNull() },
  (table) => [uniqueIndex('Panel_name_key').on(table.name)],
)

export const switches = mysqlTable(
  'switches',
  {
    id: int('id').primaryKey().autoincrement(),
    name: varchar('name', { length: 191 }).notNull(),
    on: bitBoolean('on')
      .notNull()
      .default(sql`b'1'`),
    off: bitBoolean('off').notNull(),
    maybe: bitBoolean('maybe'),
    mask: bytes('mask', { type: 'bit(8)' }).notNull(),
    panelId: int('panel_id').notNull(),
  },
  (table) => [
    uniqueIndex('switches_name_key').on(table.name),
    foreignKey({
      name: 'switches_panel_id_fkey',
      columns: [table.panelId],
      foreignColumns: [panel.id],
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
  ],
)

export const relations = defineRelations({ moments, panel, switches }, (r) => ({
  panel: { switches: r.many.switches() },
  switches: { panel: r.one.panel({ from: r.switches.panelId, to: r.panel.id, optional: false }) },
}))
