import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vitest'
import {
  makeDecimalOpts,
  mysqlNativeType,
  PRISMA_ACTION_MAP,
  pgNativeType,
  resolveDefaultValue,
  resolveScalarType,
  resolveUpdatedAtDefault,
  toCamelCase,
} from './drizzle.js'

function makeField(overrides: Partial<DMMF.Field> & { name: string; type: string }): DMMF.Field {
  return {
    kind: 'scalar',
    isList: false,
    isRequired: true,
    isUnique: false,
    isId: false,
    isReadOnly: false,
    isGenerated: false,
    isUpdatedAt: false,
    hasDefaultValue: false,
    ...overrides,
  }
}

// ============================================================================
// toCamelCase
// ============================================================================
describe('toCamelCase', () => {
  it('lowercases first char', () => {
    expect(toCamelCase('User')).toBe('user')
  })
  it('keeps already lowercase', () => {
    expect(toCamelCase('post')).toBe('post')
  })
  it('handles single char', () => {
    expect(toCamelCase('A')).toBe('a')
  })
  it('preserves rest of string', () => {
    expect(toCamelCase('TwoFactor')).toBe('twoFactor')
  })
})

// ============================================================================
// makeDecimalOpts
// ============================================================================
describe('makeDecimalOpts', () => {
  it('returns empty for no args', () => {
    expect(makeDecimalOpts([])).toBe('')
  })
  it('returns precision only', () => {
    expect(makeDecimalOpts(['10'])).toBe('{ precision: 10 }')
  })
  it('returns precision and scale', () => {
    expect(makeDecimalOpts(['10', '2'])).toBe('{ precision: 10, scale: 2 }')
  })
  it('skips empty strings', () => {
    expect(makeDecimalOpts(['', '2'])).toBe('{ scale: 2 }')
  })
})

// ============================================================================
// pgNativeType
// ============================================================================
describe('pgNativeType', () => {
  it('VarChar with length', () => {
    expect(pgNativeType('VarChar', ['255'])).toBe('varchar({ length: 255 })')
  })
  it('VarChar without length', () => {
    expect(pgNativeType('VarChar', [])).toBe('varchar()')
  })
  it('Uuid', () => {
    expect(pgNativeType('Uuid', [])).toBe('uuid()')
  })
  it('Timestamptz without precision', () => {
    expect(pgNativeType('Timestamptz', [])).toBe('timestamp({ withTimezone: true })')
  })
  it('Timestamptz with precision', () => {
    expect(pgNativeType('Timestamptz', ['3'])).toBe(
      'timestamp({ withTimezone: true, precision: 3 })',
    )
  })
  it('Timestamp without precision', () => {
    expect(pgNativeType('Timestamp', [])).toBe('timestamp()')
  })
  it('Timestamp with precision', () => {
    expect(pgNativeType('Timestamp', ['6'])).toBe('timestamp({ precision: 6 })')
  })
  it('Decimal with precision and scale', () => {
    expect(pgNativeType('Decimal', ['10', '2'])).toBe('numeric({ precision: 10, scale: 2 })')
  })
  it('SmallInt', () => {
    expect(pgNativeType('SmallInt', [])).toBe('smallint()')
  })
  it('DoublePrecision', () => {
    expect(pgNativeType('DoublePrecision', [])).toBe('doublePrecision()')
  })
  it('JsonB', () => {
    expect(pgNativeType('JsonB', [])).toBe('jsonb()')
  })
  it('returns null for unknown', () => {
    expect(pgNativeType('Unknown', [])).toBeNull()
  })
})

// ============================================================================
// mysqlNativeType
// ============================================================================
describe('mysqlNativeType', () => {
  it('VarChar with length', () => {
    expect(mysqlNativeType('VarChar', ['191'])).toBe('varchar({ length: 191 })')
  })
  it('DateTime with fsp', () => {
    expect(mysqlNativeType('DateTime', ['6'])).toBe('datetime({ fsp: 6 })')
  })
  it('DateTime without fsp defaults to 3', () => {
    expect(mysqlNativeType('DateTime', [])).toBe('datetime({ fsp: 3 })')
  })
  it('Timestamp with fsp', () => {
    expect(mysqlNativeType('Timestamp', ['3'])).toBe('timestamp({ fsp: 3 })')
  })
  it('Timestamp without fsp defaults to 3', () => {
    expect(mysqlNativeType('Timestamp', [])).toBe('timestamp({ fsp: 3 })')
  })
  it('Decimal with precision and scale', () => {
    expect(mysqlNativeType('Decimal', ['10', '2'])).toBe('decimal({ precision: 10, scale: 2 })')
  })
  it('LongText', () => {
    expect(mysqlNativeType('LongText', [])).toBe('longtext()')
  })
  it('TinyInt', () => {
    expect(mysqlNativeType('TinyInt', [])).toBe('tinyint()')
  })
  it('Binary with length', () => {
    expect(mysqlNativeType('Binary', ['16'])).toBe('binary({ length: 16 })')
  })
  it('returns null for unknown', () => {
    expect(mysqlNativeType('Unknown', [])).toBeNull()
  })
})

// ============================================================================
// resolveScalarType
// ============================================================================
describe('resolveScalarType', () => {
  it('PostgreSQL String → text()', () => {
    expect(resolveScalarType(makeField({ name: 'x', type: 'String' }), 'postgresql')).toBe('text()')
  })
  it('PostgreSQL DateTime → timestamp()', () => {
    expect(resolveScalarType(makeField({ name: 'x', type: 'DateTime' }), 'postgresql')).toBe(
      'timestamp()',
    )
  })
  it('MySQL DateTime → datetime({ fsp: 3 })', () => {
    expect(resolveScalarType(makeField({ name: 'x', type: 'DateTime' }), 'mysql')).toBe(
      'datetime({ fsp: 3 })',
    )
  })
  it('SQLite DateTime → integer({ mode: timestamp_ms })', () => {
    expect(resolveScalarType(makeField({ name: 'x', type: 'DateTime' }), 'sqlite')).toBe(
      "integer({ mode: 'timestamp_ms' })",
    )
  })
  it('SQLite Boolean → integer({ mode: boolean })', () => {
    expect(resolveScalarType(makeField({ name: 'x', type: 'Boolean' }), 'sqlite')).toBe(
      "integer({ mode: 'boolean' })",
    )
  })
  it('PostgreSQL with @db.Uuid overrides', () => {
    expect(
      resolveScalarType(
        makeField({ name: 'x', type: 'String', nativeType: ['Uuid', []] }),
        'postgresql',
      ),
    ).toBe('uuid()')
  })
  it('MySQL with @db.VarChar overrides', () => {
    expect(
      resolveScalarType(
        makeField({ name: 'x', type: 'String', nativeType: ['VarChar', ['255']] }),
        'mysql',
      ),
    ).toBe('varchar({ length: 255 })')
  })
  it('SQLite ignores nativeType', () => {
    expect(
      resolveScalarType(
        makeField({ name: 'x', type: 'String', nativeType: ['VarChar', ['255']] }),
        'sqlite',
      ),
    ).toBe('text()')
  })
  it('unknown type falls back to text()', () => {
    expect(resolveScalarType(makeField({ name: 'x', type: 'Unknown' }), 'postgresql')).toBe(
      'text()',
    )
  })
})

// ============================================================================
// resolveDefaultValue
// ============================================================================
describe('resolveDefaultValue', () => {
  it('returns empty for undefined', () => {
    expect(resolveDefaultValue(undefined, 'String', 'postgresql')).toStrictEqual({
      chain: '',
      needsSql: false,
      needsCuid: false,
    })
  })
  it('returns empty for null', () => {
    expect(resolveDefaultValue(null, 'String', 'postgresql')).toStrictEqual({
      chain: '',
      needsSql: false,
      needsCuid: false,
    })
  })
  it('now() on PostgreSQL → .defaultNow()', () => {
    expect(resolveDefaultValue({ name: 'now', args: [] }, 'DateTime', 'postgresql')).toStrictEqual({
      chain: '.defaultNow()',
      needsSql: false,
      needsCuid: false,
    })
  })
  it('now() on SQLite → sql with unixepoch', () => {
    const result = resolveDefaultValue({ name: 'now', args: [] }, 'DateTime', 'sqlite')
    expect(result.chain).toBe('.default(sql`(unixepoch() * 1000)`)')
    expect(result.needsSql).toBe(true)
    expect(result.needsCuid).toBe(false)
  })
  it('now() on MySQL → sql with CURRENT_TIMESTAMP(3)', () => {
    const result = resolveDefaultValue({ name: 'now', args: [] }, 'DateTime', 'mysql')
    expect(result.chain).toBe('.default(sql`CURRENT_TIMESTAMP(3)`)')
    expect(result.needsSql).toBe(true)
  })
  it('uuid() → $defaultFn', () => {
    expect(resolveDefaultValue({ name: 'uuid', args: [4] }, 'String', 'postgresql')).toStrictEqual({
      chain: '.$defaultFn(() => crypto.randomUUID())',
      needsSql: false,
      needsCuid: false,
    })
  })
  it('cuid() → $defaultFn with createId', () => {
    const result = resolveDefaultValue({ name: 'cuid', args: [] }, 'String', 'postgresql')
    expect(result.chain).toBe('.$defaultFn(() => createId())')
    expect(result.needsCuid).toBe(true)
  })
  it('autoincrement → empty', () => {
    expect(
      resolveDefaultValue({ name: 'autoincrement', args: [] }, 'Int', 'postgresql'),
    ).toStrictEqual({ chain: '', needsSql: false, needsCuid: false })
  })
  it('dbgenerated with args → sql', () => {
    const result = resolveDefaultValue(
      { name: 'dbgenerated', args: ['gen_random_uuid()'] },
      'String',
      'postgresql',
    )
    expect(result.chain).toBe('.default(sql`gen_random_uuid()`)')
    expect(result.needsSql).toBe(true)
  })
  it('string default', () => {
    expect(resolveDefaultValue('hello', 'String', 'postgresql')).toStrictEqual({
      chain: ".default('hello')",
      needsSql: false,
      needsCuid: false,
    })
  })
  it('number default', () => {
    expect(resolveDefaultValue(42, 'Int', 'postgresql')).toStrictEqual({
      chain: '.default(42)',
      needsSql: false,
      needsCuid: false,
    })
  })
  it('Decimal number default wraps in string', () => {
    expect(resolveDefaultValue(3.14, 'Decimal', 'postgresql')).toStrictEqual({
      chain: ".default('3.14')",
      needsSql: false,
      needsCuid: false,
    })
  })
  it('boolean default', () => {
    expect(resolveDefaultValue(false, 'Boolean', 'postgresql')).toStrictEqual({
      chain: '.default(false)',
      needsSql: false,
      needsCuid: false,
    })
  })
})

// ============================================================================
// resolveUpdatedAtDefault
// ============================================================================
describe('resolveUpdatedAtDefault', () => {
  it('PostgreSQL → .defaultNow()', () => {
    expect(resolveUpdatedAtDefault('postgresql')).toStrictEqual({
      chain: '.defaultNow()',
      needsSql: false,
    })
  })
  it('SQLite → sql with unixepoch * 1000', () => {
    expect(resolveUpdatedAtDefault('sqlite')).toStrictEqual({
      chain: '.default(sql`(unixepoch() * 1000)`)',
      needsSql: true,
    })
  })
  it('MySQL → sql with CURRENT_TIMESTAMP(3)', () => {
    expect(resolveUpdatedAtDefault('mysql')).toStrictEqual({
      chain: '.default(sql`CURRENT_TIMESTAMP(3)`)',
      needsSql: true,
    })
  })
})

// ============================================================================
// PRISMA_ACTION_MAP
// ============================================================================
describe('PRISMA_ACTION_MAP', () => {
  it('maps Cascade', () => {
    expect(PRISMA_ACTION_MAP.Cascade).toBe('cascade')
  })
  it('maps SetNull', () => {
    expect(PRISMA_ACTION_MAP.SetNull).toBe('set null')
  })
  it('maps Restrict', () => {
    expect(PRISMA_ACTION_MAP.Restrict).toBe('restrict')
  })
  it('maps NoAction', () => {
    expect(PRISMA_ACTION_MAP.NoAction).toBe('no action')
  })
  it('maps SetDefault', () => {
    expect(PRISMA_ACTION_MAP.SetDefault).toBe('set default')
  })
  it('has exactly 5 entries', () => {
    expect(Object.keys(PRISMA_ACTION_MAP)).toHaveLength(5)
  })
})
