import { describe, expect, it } from 'vitest'
import {
  buildSeaOrmAttributes,
  generateEntityFile,
  generateEnum,
  prismaTypeToRustType,
  resolveSeaOrmColumnType,
} from './sea-orm.js'

// Test run
// pnpm vitest run ./src/helper/sea-orm.test.ts

describe('prismaTypeToRustType', () => {
  it('maps String to String', () => {
    expect(prismaTypeToRustType('String', true)).toStrictEqual('String')
  })

  it('maps optional String to Option<String>', () => {
    expect(prismaTypeToRustType('String', false)).toStrictEqual('Option<String>')
  })

  it('maps Int to i32', () => {
    expect(prismaTypeToRustType('Int', true)).toStrictEqual('i32')
  })

  it('maps optional Int to Option<i32>', () => {
    expect(prismaTypeToRustType('Int', false)).toStrictEqual('Option<i32>')
  })

  it('maps BigInt to i64', () => {
    expect(prismaTypeToRustType('BigInt', true)).toStrictEqual('i64')
  })

  it('maps Float to f64', () => {
    expect(prismaTypeToRustType('Float', true)).toStrictEqual('f64')
  })

  it('maps Decimal to Decimal', () => {
    expect(prismaTypeToRustType('Decimal', true)).toStrictEqual('Decimal')
  })

  it('maps Boolean to bool', () => {
    expect(prismaTypeToRustType('Boolean', true)).toStrictEqual('bool')
  })

  it('maps optional Boolean to Option<bool>', () => {
    expect(prismaTypeToRustType('Boolean', false)).toStrictEqual('Option<bool>')
  })

  it('maps DateTime to DateTimeUtc', () => {
    expect(prismaTypeToRustType('DateTime', true)).toStrictEqual('DateTimeUtc')
  })

  it('maps optional DateTime to Option<DateTimeUtc>', () => {
    expect(prismaTypeToRustType('DateTime', false)).toStrictEqual('Option<DateTimeUtc>')
  })

  it('maps Json to Json', () => {
    expect(prismaTypeToRustType('Json', true)).toStrictEqual('Json')
  })

  it('maps Bytes to Vec<u8>', () => {
    expect(prismaTypeToRustType('Bytes', true)).toStrictEqual('Vec<u8>')
  })

  it('maps unknown type to String', () => {
    expect(prismaTypeToRustType('Unknown', true)).toStrictEqual('String')
  })
})

describe('resolveSeaOrmColumnType', () => {
  it('returns null for field without nativeType', () => {
    const field = { nativeType: null } as any
    expect(resolveSeaOrmColumnType(field)).toBeNull()
  })

  it('resolves VarChar(255) to String(StringLen::N(255))', () => {
    const field = { nativeType: ['VarChar', [255]] } as any
    expect(resolveSeaOrmColumnType(field)).toStrictEqual('String(StringLen::N(255))')
  })

  it('resolves Text to Text', () => {
    const field = { nativeType: ['Text', []] } as any
    expect(resolveSeaOrmColumnType(field)).toStrictEqual('Text')
  })

  it('resolves Uuid to Uuid', () => {
    const field = { nativeType: ['Uuid', []] } as any
    expect(resolveSeaOrmColumnType(field)).toStrictEqual('Uuid')
  })

  it('resolves Decimal(10,2) to Decimal(Some((10, 2)))', () => {
    const field = { nativeType: ['Decimal', [10, 2]] } as any
    expect(resolveSeaOrmColumnType(field)).toStrictEqual('Decimal(Some((10, 2)))')
  })

  it('resolves Timestamptz to TimestampWithTimeZone', () => {
    const field = { nativeType: ['Timestamptz', []] } as any
    expect(resolveSeaOrmColumnType(field)).toStrictEqual('TimestampWithTimeZone')
  })

  it('resolves JsonB to JsonBinary', () => {
    const field = { nativeType: ['JsonB', []] } as any
    expect(resolveSeaOrmColumnType(field)).toStrictEqual('JsonBinary')
  })
})

describe('buildSeaOrmAttributes', () => {
  it('generates primary_key + auto_increment = false for uuid PK', () => {
    const field = {
      name: 'id',
      kind: 'scalar' as const,
      type: 'String',
      isRequired: true,
      isId: true,
      isUnique: false,
      isList: false,
      isUpdatedAt: false,
      hasDefaultValue: true,
      default: { name: 'uuid', args: [] },
      nativeType: null,
    } as any
    expect(buildSeaOrmAttributes(field, true, false)).toStrictEqual([
      '#[sea_orm(primary_key, auto_increment = false)]',
    ])
  })

  it('generates primary_key (auto_increment) for autoincrement PK', () => {
    const field = {
      name: 'id',
      kind: 'scalar' as const,
      type: 'Int',
      isRequired: true,
      isId: true,
      isUnique: false,
      isList: false,
      isUpdatedAt: false,
      hasDefaultValue: true,
      default: { name: 'autoincrement', args: [] },
      nativeType: null,
    } as any
    expect(buildSeaOrmAttributes(field, true, false)).toStrictEqual(['#[sea_orm(primary_key)]'])
  })

  it('generates unique attribute', () => {
    const field = {
      name: 'email',
      kind: 'scalar' as const,
      type: 'String',
      isRequired: true,
      isId: false,
      isUnique: true,
      isList: false,
      isUpdatedAt: false,
      hasDefaultValue: false,
      nativeType: null,
    } as any
    expect(buildSeaOrmAttributes(field, false, false)).toStrictEqual(['#[sea_orm(unique)]'])
  })

  it('generates default_value for boolean', () => {
    const field = {
      name: 'active',
      kind: 'scalar' as const,
      type: 'Boolean',
      isRequired: true,
      isId: false,
      isUnique: false,
      isList: false,
      isUpdatedAt: false,
      hasDefaultValue: true,
      default: true,
      nativeType: null,
    } as any
    expect(buildSeaOrmAttributes(field, false, false)).toStrictEqual([
      '#[sea_orm(default_value = true)]',
    ])
  })

  it('generates column_name when @map differs', () => {
    const field = {
      name: 'codeName',
      dbName: 'code_name_custom',
      kind: 'scalar' as const,
      type: 'String',
      isRequired: true,
      isId: false,
      isUnique: false,
      isList: false,
      isUpdatedAt: false,
      hasDefaultValue: false,
      nativeType: null,
    } as any
    expect(buildSeaOrmAttributes(field, false, false)).toStrictEqual([
      '#[sea_orm(column_name = "code_name_custom")]',
    ])
  })

  it('generates column_type for native VarChar', () => {
    const field = {
      name: 'name',
      kind: 'scalar' as const,
      type: 'String',
      isRequired: true,
      isId: false,
      isUnique: false,
      isList: false,
      isUpdatedAt: false,
      hasDefaultValue: false,
      nativeType: ['VarChar', [200]],
    } as any
    expect(buildSeaOrmAttributes(field, false, false)).toStrictEqual([
      '#[sea_orm(column_type = "String(StringLen::N(200))")]',
    ])
  })
})

describe('generateEnum', () => {
  it('generates DeriveActiveEnum with serde for Prisma enum (default)', () => {
    const e = {
      name: 'Role',
      values: [{ name: 'ADMIN' }, { name: 'USER' }, { name: 'MODERATOR' }],
    } as any

    const result = generateEnum(e, true)
    expect(result).toContain(
      '#[derive(Debug, Clone, PartialEq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]',
    )
    expect(result).toContain('pub enum Role {')
    expect(result).toContain('#[sea_orm(string_value = "ADMIN")]')
    expect(result).toContain('    Admin,')
  })

  it('generates DeriveActiveEnum without serde when serde = false', () => {
    const e = {
      name: 'Role',
      values: [{ name: 'ADMIN' }, { name: 'USER' }],
    } as any

    const result = generateEnum(e, false)
    expect(result).toContain('#[derive(Debug, Clone, PartialEq, EnumIter, DeriveActiveEnum)]')
    expect(result).not.toContain('Serialize')
  })

  it('generates serde rename_all attribute when renameAll is set', () => {
    const e = {
      name: 'Role',
      values: [{ name: 'ADMIN' }, { name: 'USER' }],
    } as any

    const result = generateEnum(e, { enabled: true, renameAll: 'camelCase' })
    expect(result).toContain(
      '#[derive(Debug, Clone, PartialEq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]',
    )
    expect(result).toContain('#[serde(rename_all = "camelCase")]')
    expect(result).toContain('#[sea_orm(rs_type = "String"')
  })

  it('does not generate serde rename_all when serde is disabled', () => {
    const e = {
      name: 'Role',
      values: [{ name: 'ADMIN' }, { name: 'USER' }],
    } as any

    const result = generateEnum(e, { enabled: false, renameAll: 'camelCase' })
    expect(result).not.toContain('serde')
    expect(result).not.toContain('Serialize')
  })
})

describe('generateEntityFile with renameAll', () => {
  const makeModel = (name: string, fields: any[]): any => ({
    name,
    dbName: null,
    fields,
    primaryKey: null,
    uniqueFields: [],
    uniqueIndexes: [],
  })

  it('generates serde rename_all attribute on Model struct', () => {
    const model = makeModel('User', [
      {
        name: 'id',
        kind: 'scalar',
        type: 'String',
        isRequired: true,
        isId: true,
        isUnique: false,
        isList: false,
        isUpdatedAt: false,
        hasDefaultValue: true,
        default: { name: 'uuid', args: [] },
        nativeType: null,
      },
      {
        name: 'userName',
        kind: 'scalar',
        type: 'String',
        isRequired: true,
        isId: false,
        isUnique: false,
        isList: false,
        isUpdatedAt: false,
        hasDefaultValue: false,
        nativeType: null,
      },
    ])

    const result = generateEntityFile(model, [model], [], { enabled: true, renameAll: 'camelCase' })
    expect(result).toContain(
      '#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]',
    )
    expect(result).toContain('#[serde(rename_all = "camelCase")]')
    expect(result).toContain('#[sea_orm(table_name = "user")]')
  })

  it('does not generate serde rename_all when renameAll is not set', () => {
    const model = makeModel('User', [
      {
        name: 'id',
        kind: 'scalar',
        type: 'String',
        isRequired: true,
        isId: true,
        isUnique: false,
        isList: false,
        isUpdatedAt: false,
        hasDefaultValue: true,
        default: { name: 'uuid', args: [] },
        nativeType: null,
      },
    ])

    const result = generateEntityFile(model, [model], [], true)
    expect(result).not.toContain('#[serde(')
  })
})
