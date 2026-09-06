import { describe, expect, it } from 'vite-plus/test'

import { literalDataType, toTsType } from './types.js'

describe('toTsType', () => {
  it('reads SQLite types by affinity', () => {
    expect(
      ['INTEGER', 'VARCHAR(20)', 'BLOB', 'REAL', 'DATETIME', 'BOOLEAN', 'NUMERIC', ''].map((type) =>
        toTsType('sqlite', type),
      ),
    ).toStrictEqual([
      'number',
      'string',
      'Uint8Array',
      'number',
      'string',
      'number',
      'number',
      'unknown',
    ])
  })

  it('reads PostgreSQL types the way pg hands them back, arrays included', () => {
    expect(
      [
        'int4',
        'int8',
        'numeric',
        'text',
        'bool',
        'timestamptz',
        'bytea',
        'jsonb',
        '_int4',
        'text[]',
        'unknown_thing',
      ].map((type) => toTsType('postgresql', type)),
    ).toStrictEqual([
      'number',
      'string',
      'string',
      'string',
      'boolean',
      'Date',
      'Uint8Array',
      'unknown',
      'number[]',
      'string[]',
      'unknown',
    ])
  })

  it('reads MySQL types the way mysql2 hands them back', () => {
    expect(
      [
        'int unsigned',
        'bigint',
        'decimal(10,2)',
        'varchar(255)',
        'datetime',
        'json',
        'blob',
        'tinyint(1)',
      ].map((type) => toTsType('mysql', type)),
    ).toStrictEqual([
      'number',
      'number',
      'string',
      'string',
      'Date',
      'unknown',
      'Uint8Array',
      'number',
    ])
  })

  it('names the declared type of a literal per dialect', () => {
    expect([
      literalDataType('sqlite', 'string'),
      literalDataType('postgresql', 'number'),
      literalDataType('mysql', 'boolean'),
    ]).toStrictEqual(['TEXT', 'int4', 'tinyint'])
  })
})
