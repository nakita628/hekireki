import { describe, expect, it } from 'vite-plus/test'

import { sqlOf } from './dialect.js'

describe('sqlOf', () => {
  it('writes PostgreSQL', () => {
    const sql = sqlOf('postgresql', false)
    expect(sql.prefixed('user-', 'id')).toBe(`'user-' || "id"`)
    expect(sql.uuid).toBe('gen_random_uuid()::text')
    expect(sql.randomId).toBe('md5(random()::text || clock_timestamp()::text)')
    expect(sql.now).toBe('CURRENT_TIMESTAMP')
    expect(sql.falsy).toBe('FALSE')
    expect(sql.firstKey('User', 'public', 'id')).toBe('(SELECT MIN("id") FROM "public"."User")')
    expect(sql.number('views', 'Int')).toBe(`CAST(NULLIF(TRIM("views"), '') AS INTEGER)`)
    expect(sql.number('price', 'Decimal')).toBe(
      `CAST(NULLIF(TRIM("price"), '') AS DECIMAL(65, 30))`,
    )
  })

  it('writes CockroachDB with STRING in place of text', () => {
    const sql = sqlOf('postgresql', true)
    expect(sql.prefixed('user-', 'id')).toBe(`'user-' || "id"::STRING`)
    expect(sql.uuid).toBe('gen_random_uuid()::STRING')
    expect(sql.randomId).toBe('md5(random()::STRING || now()::STRING)')
  })

  it('writes MySQL', () => {
    const sql = sqlOf('mysql', false)
    expect(sql.prefixed('user-', 'id')).toBe("CONCAT('user-', `id`)")
    expect(sql.uuid).toBe('UUID()')
    expect(sql.randomId).toBe("REPLACE(UUID(), '-', '')")
    expect(sql.now).toBe('CURRENT_TIMESTAMP(3)')
    expect(sql.firstKey('User', null, 'id')).toBe('(SELECT MIN(`id`) FROM `User`)')
    expect(sql.number('views', 'Int')).toBe("CAST(NULLIF(TRIM(`views`), '') AS SIGNED)")
  })

  it('writes SQLite', () => {
    const sql = sqlOf('sqlite', false)
    expect(sql.randomId).toBe('lower(hex(randomblob(12)))')
    expect(sql.now).toBe("strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")
    expect(sql.falsy).toBe('0')
    expect(sql.number('score', 'Float')).toBe(`CAST(NULLIF(TRIM("score"), '') AS REAL)`)
  })

  it('reads no type it cannot cast to', () => {
    expect(sqlOf('postgresql', false).number('name', 'String')).toBeNull()
  })
})
