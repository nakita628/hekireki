import { describe, expect, it } from 'vite-plus/test'

import { databaseFamily, prismaFamily } from './types.js'

describe('prismaFamily', () => {
  it('reads scalars by type and every enum as one family', () => {
    expect(prismaFamily({ type: 'String', kind: 'scalar' })).toBe('string')
    expect(prismaFamily({ type: 'BigInt', kind: 'scalar' })).toBe('bigint')
    expect(prismaFamily({ type: 'Role', kind: 'enum' })).toBe('enum')
    expect(prismaFamily({ type: 'Point', kind: 'unsupported' })).toBeNull()
  })
})

describe('databaseFamily', () => {
  it('reads PostgreSQL data_type, enums included', () => {
    expect(databaseFamily({ dialect: 'postgresql', dataType: 'uuid', columnType: null })).toBe(
      'string',
    )
    expect(
      databaseFamily({ dialect: 'postgresql', dataType: 'USER-DEFINED', columnType: null }),
    ).toBe('enum')
    expect(databaseFamily({ dialect: 'postgresql', dataType: 'tsvector', columnType: null })).toBe(
      null,
    )
  })

  it('reads the tinyint(1) Prisma writes a Boolean as on MySQL as a boolean, any other tinyint as an int', () => {
    expect(
      databaseFamily({ dialect: 'mysql', dataType: 'tinyint', columnType: 'tinyint(1)' }),
    ).toBe('boolean')
    expect(
      databaseFamily({ dialect: 'mysql', dataType: 'tinyint', columnType: 'tinyint(4)' }),
    ).toBe('int')
    expect(
      databaseFamily({ dialect: 'mysql', dataType: 'enum', columnType: "enum('A','B')" }),
    ).toBe('enum')
  })

  it('reads the declared type on SQLite, by affinity when Prisma did not write it', () => {
    expect(databaseFamily({ dialect: 'sqlite', dataType: 'DATETIME', columnType: null })).toBe(
      'datetime',
    )
    expect(databaseFamily({ dialect: 'sqlite', dataType: 'varchar(20)', columnType: null })).toBe(
      'string',
    )
    expect(databaseFamily({ dialect: 'sqlite', dataType: 'MEDIUMINT', columnType: null })).toBe(
      'int',
    )
    expect(databaseFamily({ dialect: 'sqlite', dataType: 'WHATEVER', columnType: null })).toBe(null)
  })
})
