import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import {
  makeAtlasColumn,
  makeAtlasEnums,
  makeAtlasForeignKeys,
  makeAtlasIndexes,
  makeAtlasM2MJoinTables,
  makeAtlasPrimaryKey,
  makeAtlasSchemas,
  makeAtlasTable,
} from './atlas.js'

function makeModel(overrides: Partial<DMMF.Model> & { name: string }): DMMF.Model {
  return {
    dbName: null,
    fields: [],
    uniqueFields: [],
    uniqueIndexes: [],
    primaryKey: null,
    isGenerated: false,
    schema: null,
    ...overrides,
  }
}

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

describe('makeAtlasColumn', () => {
  it('should generate a required text column', () => {
    const field = makeField({ name: 'name', type: 'String' })
    expect(makeAtlasColumn(field, 'postgresql', [], false)).toBe(
      `  column "name" {
    null = false
    type = text
  }`,
    )
  })

  it('should align attributes when a default is present', () => {
    const field = makeField({
      name: 'age',
      type: 'Int',
      isRequired: false,
      hasDefaultValue: true,
      default: 42,
    })
    expect(makeAtlasColumn(field, 'postgresql', [], false)).toBe(
      `  column "age" {
    null    = true
    type    = integer
    default = 42
  }`,
    )
  })

  it('should map postgresql autoincrement to serial without a default', () => {
    const field = makeField({
      name: 'id',
      type: 'Int',
      isId: true,
      hasDefaultValue: true,
      default: { name: 'autoincrement', args: [] },
    })
    expect(makeAtlasColumn(field, 'postgresql', [], false)).toBe(
      `  column "id" {
    null = false
    type = serial
  }`,
    )
  })

  it('should map postgresql BigInt autoincrement to bigserial', () => {
    const field = makeField({
      name: 'id',
      type: 'BigInt',
      isId: true,
      hasDefaultValue: true,
      default: { name: 'autoincrement', args: [] },
    })
    expect(makeAtlasColumn(field, 'postgresql', [], false)).toBe(
      `  column "id" {
    null = false
    type = bigserial
  }`,
    )
  })

  it('should emit auto_increment for mysql autoincrement', () => {
    const field = makeField({
      name: 'id',
      type: 'Int',
      isId: true,
      hasDefaultValue: true,
      default: { name: 'autoincrement', args: [] },
    })
    expect(makeAtlasColumn(field, 'mysql', [], false)).toBe(
      `  column "id" {
    null           = false
    type           = int
    auto_increment = true
  }`,
    )
  })

  it('should map now() to CURRENT_TIMESTAMP on postgresql', () => {
    const field = makeField({
      name: 'created_at',
      type: 'DateTime',
      hasDefaultValue: true,
      default: { name: 'now', args: [] },
    })
    expect(makeAtlasColumn(field, 'postgresql', [], false)).toBe(
      `  column "created_at" {
    null    = false
    type    = timestamp(3)
    default = sql("CURRENT_TIMESTAMP")
  }`,
    )
  })

  it('should map now() to CURRENT_TIMESTAMP(3) on mysql', () => {
    const field = makeField({
      name: 'created_at',
      type: 'DateTime',
      hasDefaultValue: true,
      default: { name: 'now', args: [] },
    })
    expect(makeAtlasColumn(field, 'mysql', [], false)).toBe(
      `  column "created_at" {
    null    = false
    type    = datetime(3)
    default = sql("CURRENT_TIMESTAMP(3)")
  }`,
    )
  })

  it('should resolve postgresql native types', () => {
    const field = makeField({ name: 'code', type: 'String', nativeType: ['VarChar', ['32']] })
    expect(makeAtlasColumn(field, 'postgresql', [], false)).toBe(
      `  column "code" {
    null = false
    type = varchar(32)
  }`,
    )
  })

  it('should resolve mysql unsigned native types', () => {
    const field = makeField({ name: 'count', type: 'Int', nativeType: ['UnsignedInt', []] })
    expect(makeAtlasColumn(field, 'mysql', [], false)).toBe(
      `  column "count" {
    null     = false
    type     = int
    unsigned = true
  }`,
    )
  })

  it('should emit a nullable sql array type for scalar lists', () => {
    const field = makeField({ name: 'tags', type: 'String', isList: true })
    expect(makeAtlasColumn(field, 'postgresql', [], false)).toBe(
      `  column "tags" {
    null = true
    type = sql("text[]")
  }`,
    )
  })

  it('should convert underscored types to sql names in list casts', () => {
    const field = makeField({
      name: 'scores',
      type: 'Float',
      isList: true,
      hasDefaultValue: true,
      default: [],
    })
    expect(makeAtlasColumn(field, 'postgresql', [], false)).toBe(
      `  column "scores" {
    null    = true
    type    = sql("double precision[]")
    default = sql("ARRAY[]::double precision[]")
  }`,
    )
  })

  it('should render list defaults as ARRAY expressions', () => {
    const field = makeField({
      name: 'tags',
      type: 'String',
      isList: true,
      hasDefaultValue: true,
      default: ['a', "b'c"],
    })
    expect(makeAtlasColumn(field, 'postgresql', [], false)).toBe(
      `  column "tags" {
    null    = true
    type    = sql("text[]")
    default = sql("ARRAY['a', 'b''c']::text[]")
  }`,
    )
  })

  it('should reference the enum block on postgresql and map the default to its dbName', () => {
    const enums: DMMF.DatamodelEnum[] = [
      {
        name: 'Visibility',
        dbName: 'visibility_level',
        values: [
          { name: 'PUBLIC', dbName: 'public_v' },
          { name: 'PRIVATE', dbName: 'private_v' },
        ],
      },
    ]
    const field = makeField({
      name: 'visibility',
      type: 'Visibility',
      kind: 'enum',
      hasDefaultValue: true,
      default: 'PUBLIC',
    })
    expect(makeAtlasColumn(field, 'postgresql', enums, false)).toBe(
      `  column "visibility" {
    null    = false
    type    = enum.visibility_level
    default = "public_v"
  }`,
    )
  })

  it('should render enum lists as a sql array of the enum dbName', () => {
    const enums: DMMF.DatamodelEnum[] = [
      {
        name: 'Visibility',
        dbName: 'visibility_level',
        values: [
          { name: 'PUBLIC', dbName: 'public_v' },
          { name: 'PRIVATE', dbName: 'private_v' },
        ],
      },
    ]
    const field = makeField({
      name: 'levels',
      type: 'Visibility',
      kind: 'enum',
      isList: true,
      hasDefaultValue: true,
      default: ['PUBLIC'],
    })
    expect(makeAtlasColumn(field, 'postgresql', enums, false)).toBe(
      `  column "levels" {
    null    = true
    type    = sql("\\"visibility_level\\"[]")
    default = sql("ARRAY['public_v']::\\"visibility_level\\"[]")
  }`,
    )
  })

  it('should inline enum values on mysql', () => {
    const enums: DMMF.DatamodelEnum[] = [
      {
        name: 'Status',
        dbName: null,
        values: [
          { name: 'ACTIVE', dbName: 'active' },
          { name: 'INACTIVE', dbName: 'inactive' },
        ],
      },
    ]
    const field = makeField({ name: 'status', type: 'Status', kind: 'enum' })
    expect(makeAtlasColumn(field, 'mysql', enums, false)).toBe(
      `  column "status" {
    null = false
    type = enum("active", "inactive")
  }`,
    )
  })

  it('should store enums as text on sqlite', () => {
    const enums: DMMF.DatamodelEnum[] = [
      {
        name: 'Status',
        dbName: null,
        values: [{ name: 'ACTIVE', dbName: null }],
      },
    ]
    const field = makeField({ name: 'status', type: 'Status', kind: 'enum' })
    expect(makeAtlasColumn(field, 'sqlite', enums, false)).toBe(
      `  column "status" {
    null = false
    type = text
  }`,
    )
  })

  it('should pass dbgenerated expressions through as sql', () => {
    const field = makeField({
      name: 'id',
      type: 'String',
      nativeType: ['Uuid', []],
      hasDefaultValue: true,
      default: { name: 'dbgenerated', args: ['gen_random_uuid()'] },
    })
    expect(makeAtlasColumn(field, 'postgresql', [], false)).toBe(
      `  column "id" {
    null    = false
    type    = uuid
    default = sql("gen_random_uuid()")
  }`,
    )
  })

  it('should omit defaults for client-side functions like uuid()', () => {
    const field = makeField({
      name: 'id',
      type: 'String',
      hasDefaultValue: true,
      default: { name: 'uuid', args: [7] },
    })
    expect(makeAtlasColumn(field, 'postgresql', [], false)).toBe(
      `  column "id" {
    null = false
    type = text
  }`,
    )
  })

  it('should emit BigInt defaults as unquoted numeric literals', () => {
    const field = makeField({
      name: 'big',
      type: 'BigInt',
      hasDefaultValue: true,
      default: '9007199254740993',
    })
    expect(makeAtlasColumn(field, 'postgresql', [], false)).toBe(
      `  column "big" {
    null    = false
    type    = bigint
    default = 9007199254740993
  }`,
    )
  })

  it('should escape quotes, newlines, and template sequences in string defaults', () => {
    const field = makeField({
      name: 'greeting',
      type: 'String',
      hasDefaultValue: true,
      default: 'say "hi"\n${x} %{y}',
    })
    expect(makeAtlasColumn(field, 'postgresql', [], false)).toBe(
      '  column "greeting" {\n' +
        '    null    = false\n' +
        '    type    = text\n' +
        '    default = "say \\"hi\\"\\n$${x} %%{y}"\n' +
        '  }',
    )
  })

  it('should map the postgresql native type grid', () => {
    const cases: readonly [readonly [string, readonly string[]], string, string][] = [
      [['Char', ['3']], 'String', 'char(3)'],
      [['Text', []], 'String', 'text'],
      [['SmallInt', []], 'Int', 'smallint'],
      [['Integer', []], 'Int', 'integer'],
      [['Oid', []], 'Int', 'oid'],
      [['Real', []], 'Float', 'real'],
      [['DoublePrecision', []], 'Float', 'double_precision'],
      [['Money', []], 'Decimal', 'money'],
      [['Decimal', ['38', '12']], 'Decimal', 'decimal(38, 12)'],
      [['ByteA', []], 'Bytes', 'bytea'],
      [['JsonB', []], 'Json', 'jsonb'],
      [['Json', []], 'Json', 'json'],
      [['Date', []], 'DateTime', 'date'],
      [['Time', ['3']], 'DateTime', 'time(3)'],
      [['Timestamp', ['0']], 'DateTime', 'timestamp(0)'],
      [['Timestamptz', ['6']], 'DateTime', 'timestamptz(6)'],
      [['Inet', []], 'String', 'inet'],
      [['Bit', ['8']], 'String', 'bit(8)'],
      [['VarBit', ['16']], 'String', 'bit_varying(16)'],
      [['Xml', []], 'String', 'xml'],
      [['BigInt', []], 'BigInt', 'bigint'],
      [['Boolean', []], 'Boolean', 'boolean'],
      [['Citext', []], 'String', 'text'],
    ]
    for (const [nativeType, prismaType, expected] of cases) {
      const field = makeField({ name: 'v', type: prismaType, nativeType })
      expect(makeAtlasColumn(field, 'postgresql', [], false)).toBe(
        `  column "v" {\n    null = false\n    type = ${expected}\n  }`,
      )
    }
  })

  it('should map the mysql native type grid', () => {
    const cases: readonly [readonly [string, readonly string[]], string, string][] = [
      [['VarChar', []], 'String', 'varchar(191)'],
      [['Char', ['3']], 'String', 'char(3)'],
      [['Text', []], 'String', 'text'],
      [['TinyText', []], 'String', 'tinytext'],
      [['MediumText', []], 'String', 'mediumtext'],
      [['LongText', []], 'String', 'longtext'],
      [['TinyInt', []], 'Int', 'tinyint'],
      [['SmallInt', []], 'Int', 'smallint'],
      [['MediumInt', []], 'Int', 'mediumint'],
      [['Int', []], 'Int', 'int'],
      [['BigInt', []], 'BigInt', 'bigint'],
      [['Float', []], 'Float', 'float'],
      [['Double', []], 'Float', 'double'],
      [['Decimal', ['10', '2']], 'Decimal', 'decimal(10, 2)'],
      [['Bit', ['8']], 'String', 'bit(8)'],
      [['Date', []], 'DateTime', 'date'],
      [['Time', ['3']], 'DateTime', 'time(3)'],
      [['DateTime', ['6']], 'DateTime', 'datetime(6)'],
      [['Timestamp', ['0']], 'DateTime', 'timestamp(0)'],
      [['Year', []], 'Int', 'year'],
      [['Json', []], 'Json', 'json'],
      [['Binary', ['16']], 'Bytes', 'binary(16)'],
      [['VarBinary', ['32']], 'Bytes', 'varbinary(32)'],
      [['TinyBlob', []], 'Bytes', 'tinyblob'],
      [['MediumBlob', []], 'Bytes', 'mediumblob'],
      [['LongBlob', []], 'Bytes', 'longblob'],
      [['Blob', []], 'Bytes', 'blob'],
    ]
    for (const [nativeType, prismaType, expected] of cases) {
      const field = makeField({ name: 'v', type: prismaType, nativeType })
      expect(makeAtlasColumn(field, 'mysql', [], false)).toBe(
        `  column "v" {\n    null = false\n    type = ${expected}\n  }`,
      )
    }
  })

  it('should map the mysql unsigned integer grid', () => {
    const cases: readonly [string, string][] = [
      ['UnsignedTinyInt', 'tinyint'],
      ['UnsignedSmallInt', 'smallint'],
      ['UnsignedMediumInt', 'mediumint'],
      ['UnsignedBigInt', 'bigint'],
    ]
    for (const [nativeName, expected] of cases) {
      const field = makeField({ name: 'v', type: 'Int', nativeType: [nativeName, []] })
      expect(makeAtlasColumn(field, 'mysql', [], false)).toBe(
        `  column "v" {\n    null     = false\n    type     = ${expected}\n    unsigned = true\n  }`,
      )
    }
  })

  it('should map the sqlite scalar grid and ignore native types', () => {
    const cases: readonly [string, string][] = [
      ['String', 'text'],
      ['Boolean', 'boolean'],
      ['Int', 'integer'],
      ['BigInt', 'bigint'],
      ['Float', 'real'],
      ['Decimal', 'decimal'],
      ['DateTime', 'datetime'],
      ['Json', 'jsonb'],
      ['Bytes', 'blob'],
    ]
    for (const [prismaType, expected] of cases) {
      const field = makeField({ name: 'v', type: prismaType, nativeType: ['Uuid', []] })
      expect(makeAtlasColumn(field, 'sqlite', [], false)).toBe(
        `  column "v" {\n    null = false\n    type = ${expected}\n  }`,
      )
    }
  })

  it('should map native SmallInt autoincrement to smallserial on postgresql', () => {
    const field = makeField({
      name: 'id',
      type: 'Int',
      isId: true,
      nativeType: ['SmallInt', []],
      hasDefaultValue: true,
      default: { name: 'autoincrement', args: [] },
    })
    expect(makeAtlasColumn(field, 'postgresql', [], false)).toBe(
      `  column "id" {
    null = false
    type = smallserial
  }`,
    )
  })

  it('should render numeric list defaults without quoting', () => {
    const field = makeField({
      name: 'counts',
      type: 'Int',
      isList: true,
      hasDefaultValue: true,
      default: [1, 2, 3],
    })
    expect(makeAtlasColumn(field, 'postgresql', [], false)).toBe(
      `  column "counts" {
    null    = true
    type    = sql("integer[]")
    default = sql("ARRAY[1, 2, 3]::integer[]")
  }`,
    )
  })

  it('should render BigInt list defaults as raw digits', () => {
    const field = makeField({
      name: 'words',
      type: 'BigInt',
      isList: true,
      hasDefaultValue: true,
      default: ['9007199254740993'],
    })
    expect(makeAtlasColumn(field, 'postgresql', [], false)).toBe(
      `  column "words" {
    null    = true
    type    = sql("bigint[]")
    default = sql("ARRAY[9007199254740993]::bigint[]")
  }`,
    )
  })

  it('should attach stripped documentation as a comment when enabled', () => {
    const field = makeField({
      name: 'name',
      type: 'String',
      documentation: '@z.string()\nUser name',
    })
    expect(makeAtlasColumn(field, 'postgresql', [], true)).toBe(
      `  column "name" {
    null    = false
    type    = text
    comment = "User name"
  }`,
    )
  })
})

describe('makeAtlasPrimaryKey', () => {
  it('should build the primary key from the id index with dbName translation', () => {
    const model = makeModel({
      name: 'Follow',
      fields: [
        makeField({ name: 'followerId', type: 'String', dbName: 'follower_id' }),
        makeField({ name: 'followeeId', type: 'String', dbName: 'followee_id' }),
      ],
    })
    const indexes: DMMF.Index[] = [
      {
        model: 'Follow',
        type: 'id',
        isDefinedOnField: false,
        fields: [{ name: 'followerId' }, { name: 'followeeId' }],
      },
    ]
    expect(makeAtlasPrimaryKey(model, indexes)).toBe(
      `  primary_key {
    columns = [column.follower_id, column.followee_id]
  }`,
    )
  })

  it('should return null when the model has no id index', () => {
    const model = makeModel({ name: 'Log' })
    expect(makeAtlasPrimaryKey(model, [])).toBe(null)
  })

  it('should fall back to index syntax for non-identifier column names', () => {
    const model = makeModel({
      name: 'Odd',
      fields: [makeField({ name: 'id', type: 'String', dbName: 'user id' })],
    })
    const indexes: DMMF.Index[] = [
      { model: 'Odd', type: 'id', isDefinedOnField: true, fields: [{ name: 'id' }] },
    ]
    expect(makeAtlasPrimaryKey(model, indexes)).toBe(
      `  primary_key {
    columns = [column["user id"]]
  }`,
    )
  })
})

describe('makeAtlasForeignKeys', () => {
  it('should apply Prisma default actions for a required relation', () => {
    const user = makeModel({
      name: 'User',
      fields: [makeField({ name: 'id', type: 'String', isId: true })],
    })
    const post = makeModel({
      name: 'Post',
      fields: [
        makeField({ name: 'id', type: 'String', isId: true }),
        makeField({ name: 'authorId', type: 'String' }),
        makeField({
          name: 'author',
          type: 'User',
          kind: 'object',
          relationName: 'PostToUser',
          relationFromFields: ['authorId'],
          relationToFields: ['id'],
        }),
      ],
    })
    expect(makeAtlasForeignKeys(post, [user, post], 'public')).toStrictEqual([
      `  foreign_key "Post_authorId_fkey" {
    columns     = [column.authorId]
    ref_columns = [table.User.column.id]
    on_update   = CASCADE
    on_delete   = RESTRICT
  }`,
    ])
  })

  it('should default to SET_NULL for optional relations and honor explicit actions', () => {
    const user = makeModel({
      name: 'User',
      fields: [makeField({ name: 'id', type: 'String', isId: true })],
    })
    const post = makeModel({
      name: 'Post',
      fields: [
        makeField({ name: 'authorId', type: 'String', isRequired: false }),
        makeField({
          name: 'author',
          type: 'User',
          kind: 'object',
          isRequired: false,
          relationName: 'PostToUser',
          relationFromFields: ['authorId'],
          relationToFields: ['id'],
          relationOnUpdate: 'NoAction',
        }),
      ],
    })
    expect(makeAtlasForeignKeys(post, [user, post], 'public')).toStrictEqual([
      `  foreign_key "Post_authorId_fkey" {
    columns     = [column.authorId]
    ref_columns = [table.User.column.id]
    on_update   = NO_ACTION
    on_delete   = SET_NULL
  }`,
    ])
  })

  it('should skip relations whose target model is not in the datamodel', () => {
    const orphan = makeModel({
      name: 'Orphan',
      fields: [
        makeField({ name: 'ghostId', type: 'String' }),
        makeField({
          name: 'ghost',
          type: 'Ghost',
          kind: 'object',
          relationName: 'GhostToOrphan',
          relationFromFields: ['ghostId'],
          relationToFields: ['id'],
        }),
      ],
    })
    expect(makeAtlasForeignKeys(orphan, [orphan], 'public')).toStrictEqual([])
  })

  it('should translate composite foreign keys with dbName mapping', () => {
    const warehouse = makeModel({
      name: 'Warehouse',
      dbName: 'warehouses',
      fields: [
        makeField({ name: 'region', type: 'String' }),
        makeField({ name: 'code', type: 'String', dbName: 'code_x' }),
      ],
    })
    const stock = makeModel({
      name: 'Stock',
      fields: [
        makeField({ name: 'whRegion', type: 'String', dbName: 'wh_region' }),
        makeField({ name: 'whCode', type: 'String', dbName: 'wh_code' }),
        makeField({
          name: 'warehouse',
          type: 'Warehouse',
          kind: 'object',
          relationName: 'StockToWarehouse',
          relationFromFields: ['whRegion', 'whCode'],
          relationToFields: ['region', 'code'],
          relationOnDelete: 'Cascade',
        }),
      ],
    })
    expect(makeAtlasForeignKeys(stock, [warehouse, stock], 'public')).toStrictEqual([
      `  foreign_key "Stock_wh_region_wh_code_fkey" {
    columns     = [column.wh_region, column.wh_code]
    ref_columns = [table.warehouses.column.region, table.warehouses.column.code_x]
    on_update   = CASCADE
    on_delete   = CASCADE
  }`,
    ])
  })
})

describe('makeAtlasIndexes', () => {
  it('should generate a unique index with the Prisma naming convention', () => {
    const model = makeModel({
      name: 'User',
      fields: [makeField({ name: 'email', type: 'String', isUnique: true })],
    })
    const indexes: DMMF.Index[] = [
      { model: 'User', type: 'unique', isDefinedOnField: true, fields: [{ name: 'email' }] },
    ]
    expect(makeAtlasIndexes(model, indexes, 'postgresql')).toStrictEqual([
      `  index "User_email_key" {
    unique  = true
    columns = [column.email]
  }`,
    ])
  })

  it('should generate a composite normal index and skip the id index', () => {
    const model = makeModel({
      name: 'Profile',
      fields: [
        makeField({ name: 'id', type: 'String', isId: true }),
        makeField({ name: 'firstName', type: 'String', dbName: 'first_name' }),
        makeField({ name: 'lastName', type: 'String', dbName: 'last_name' }),
      ],
    })
    const indexes: DMMF.Index[] = [
      { model: 'Profile', type: 'id', isDefinedOnField: true, fields: [{ name: 'id' }] },
      {
        model: 'Profile',
        type: 'normal',
        isDefinedOnField: false,
        fields: [{ name: 'firstName' }, { name: 'lastName' }],
      },
    ]
    expect(makeAtlasIndexes(model, indexes, 'postgresql')).toStrictEqual([
      `  index "Profile_first_name_last_name_idx" {
    columns = [column.first_name, column.last_name]
  }`,
    ])
  })

  it('should prefer the mapped dbName over the derived name', () => {
    const model = makeModel({
      name: 'User',
      fields: [makeField({ name: 'email', type: 'String' })],
    })
    const indexes: DMMF.Index[] = [
      {
        model: 'User',
        type: 'normal',
        isDefinedOnField: false,
        dbName: 'custom_email_idx',
        fields: [{ name: 'email' }],
      },
    ]
    expect(makeAtlasIndexes(model, indexes, 'postgresql')).toStrictEqual([
      `  index "custom_email_idx" {
    columns = [column.email]
  }`,
    ])
  })

  it('should expand descending indexes into on blocks', () => {
    const model = makeModel({
      name: 'Rank',
      fields: [
        makeField({ name: 'group', type: 'String' }),
        makeField({ name: 'score', type: 'Int' }),
      ],
    })
    const indexes: DMMF.Index[] = [
      {
        model: 'Rank',
        type: 'normal',
        isDefinedOnField: false,
        fields: [{ name: 'group' }, { name: 'score', sortOrder: 'desc' }],
      },
    ]
    expect(makeAtlasIndexes(model, indexes, 'postgresql')).toStrictEqual([
      `  index "Rank_group_score_idx" {
    on {
      column = column.group
    }
    on {
      desc   = true
      column = column.score
    }
  }`,
    ])
  })

  it('should mark mysql fulltext indexes with type FULLTEXT', () => {
    const model = makeModel({
      name: 'Post',
      fields: [makeField({ name: 'title', type: 'String' })],
    })
    const indexes: DMMF.Index[] = [
      { model: 'Post', type: 'fulltext', isDefinedOnField: false, fields: [{ name: 'title' }] },
    ]
    expect(makeAtlasIndexes(model, indexes, 'mysql')).toStrictEqual([
      `  index "Post_title_idx" {
    columns = [column.title]
    type    = FULLTEXT
  }`,
    ])
  })
})

describe('makeAtlasTable', () => {
  it('should assemble schema, columns, primary key, and indexes', () => {
    const model = makeModel({
      name: 'User',
      fields: [
        makeField({ name: 'id', type: 'String', isId: true }),
        makeField({ name: 'email', type: 'String', isUnique: true }),
      ],
    })
    const indexes: DMMF.Index[] = [
      { model: 'User', type: 'id', isDefinedOnField: true, fields: [{ name: 'id' }] },
      { model: 'User', type: 'unique', isDefinedOnField: true, fields: [{ name: 'email' }] },
    ]
    expect(
      makeAtlasTable(model, [model], indexes, 'postgresql', [], {
        schemaName: 'public',
        comment: false,
      }),
    ).toBe(
      `table "User" {
  schema = schema.public
  column "id" {
    null = false
    type = text
  }
  column "email" {
    null = false
    type = text
  }
  primary_key {
    columns = [column.id]
  }
  index "User_email_key" {
    unique  = true
    columns = [column.email]
  }
}`,
    )
  })

  it('should use the @@map name and @@schema, and align the comment attribute', () => {
    const model = makeModel({
      name: 'Account',
      dbName: 'accounts',
      schema: 'auth',
      documentation: 'Account table\n@z.object',
      fields: [makeField({ name: 'id', type: 'String', isId: true })],
    })
    const indexes: DMMF.Index[] = [
      { model: 'Account', type: 'id', isDefinedOnField: true, fields: [{ name: 'id' }] },
    ]
    expect(
      makeAtlasTable(model, [model], indexes, 'postgresql', [], {
        schemaName: 'public',
        comment: true,
      }),
    ).toBe(
      `table "accounts" {
  schema  = schema.auth
  comment = "Account table"
  column "id" {
    null = false
    type = text
  }
  primary_key {
    columns = [column.id]
  }
}`,
    )
  })

  it('should qualify the table label when dbNames collide across schemas', () => {
    const a = makeModel({
      name: 'AuthUser',
      dbName: 'users',
      schema: 'auth',
      fields: [makeField({ name: 'id', type: 'String', isId: true })],
    })
    const b = makeModel({
      name: 'PublicUser',
      dbName: 'users',
      schema: null,
      fields: [makeField({ name: 'id', type: 'String', isId: true })],
    })
    expect(
      makeAtlasTable(a, [a, b], [], 'postgresql', [], { schemaName: 'public', comment: false }),
    ).toBe(
      `table "auth" "users" {
  schema = schema.auth
  column "id" {
    null = false
    type = text
  }
}`,
    )
  })
})

describe('makeAtlasM2MJoinTables', () => {
  it('should build the implicit join table with composite PK, B index, and cascade FKs', () => {
    const post = makeModel({
      name: 'Post',
      fields: [
        makeField({ name: 'id', type: 'String', isId: true }),
        makeField({
          name: 'tags',
          type: 'Tag',
          kind: 'object',
          isList: true,
          isRequired: false,
          relationName: 'PostToTag',
          relationFromFields: [],
          relationToFields: [],
        }),
      ],
    })
    const tag = makeModel({
      name: 'Tag',
      fields: [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({
          name: 'posts',
          type: 'Post',
          kind: 'object',
          isList: true,
          isRequired: false,
          relationName: 'PostToTag',
          relationFromFields: [],
          relationToFields: [],
        }),
      ],
    })
    expect(makeAtlasM2MJoinTables([post, tag], 'postgresql', [], 'public')).toStrictEqual([
      `table "_PostToTag" {
  schema = schema.public
  column "A" {
    null = false
    type = text
  }
  column "B" {
    null = false
    type = integer
  }
  primary_key {
    columns = [column.A, column.B]
  }
  foreign_key "_PostToTag_A_fkey" {
    columns     = [column.A]
    ref_columns = [table.Post.column.id]
    on_update   = CASCADE
    on_delete   = CASCADE
  }
  foreign_key "_PostToTag_B_fkey" {
    columns     = [column.B]
    ref_columns = [table.Tag.column.id]
    on_update   = CASCADE
    on_delete   = CASCADE
  }
  index "_PostToTag_B_index" {
    columns = [column.B]
  }
}`,
    ])
  })

  it('should return no join tables for explicit relations', () => {
    const user = makeModel({
      name: 'User',
      fields: [makeField({ name: 'id', type: 'String', isId: true })],
    })
    expect(makeAtlasM2MJoinTables([user], 'postgresql', [], 'public')).toStrictEqual([])
  })
})

describe('makeAtlasEnums', () => {
  it('should declare every enum with dbName values on postgresql, including unused ones', () => {
    const enums: DMMF.DatamodelEnum[] = [
      {
        name: 'Visibility',
        dbName: 'visibility_level',
        values: [
          { name: 'PUBLIC', dbName: 'public_v' },
          { name: 'PRIVATE', dbName: 'private_v' },
        ],
      },
      {
        name: 'Unused',
        dbName: null,
        values: [{ name: 'X', dbName: null }],
      },
    ]
    expect(makeAtlasEnums(enums, 'postgresql', 'public')).toStrictEqual([
      `enum "visibility_level" {
  schema = schema.public
  values = ["public_v", "private_v"]
}`,
      `enum "Unused" {
  schema = schema.public
  values = ["X"]
}`,
    ])
  })

  it('should declare nothing on mysql', () => {
    const enums: DMMF.DatamodelEnum[] = [
      { name: 'Status', dbName: null, values: [{ name: 'ACTIVE', dbName: null }] },
    ]
    expect(makeAtlasEnums(enums, 'mysql', 'public')).toStrictEqual([])
  })
})

describe('makeAtlasSchemas', () => {
  it('should emit the default schema block', () => {
    expect(makeAtlasSchemas([makeModel({ name: 'User' })], 'public')).toStrictEqual([
      'schema "public" {}',
    ])
  })

  it('should append @@schema schemas without duplicates', () => {
    const models = [
      makeModel({ name: 'User', schema: 'auth' }),
      makeModel({ name: 'Post', schema: null }),
      makeModel({ name: 'Session', schema: 'auth' }),
    ]
    expect(makeAtlasSchemas(models, 'public')).toStrictEqual([
      'schema "public" {}',
      'schema "auth" {}',
    ])
  })
})
