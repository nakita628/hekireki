import { describe, expect, it } from 'vite-plus/test'

import { buildGormTags, goFieldName, prismaTypeToGoType } from './gorm.js'

// Test run
// pnpm vitest run ./src/helper/gorm.test.ts

describe('prismaTypeToGoType', () => {
  it('maps String to string', () => {
    expect(prismaTypeToGoType('String', true)).toStrictEqual('string')
  })

  it('maps optional String to *string', () => {
    expect(prismaTypeToGoType('String', false)).toStrictEqual('*string')
  })

  it('maps Int to int', () => {
    expect(prismaTypeToGoType('Int', true)).toStrictEqual('int')
  })

  it('maps optional Int to *int', () => {
    expect(prismaTypeToGoType('Int', false)).toStrictEqual('*int')
  })

  it('maps BigInt to int64', () => {
    expect(prismaTypeToGoType('BigInt', true)).toStrictEqual('int64')
  })

  it('maps Float to float64', () => {
    expect(prismaTypeToGoType('Float', true)).toStrictEqual('float64')
  })

  it('maps Decimal to float64', () => {
    expect(prismaTypeToGoType('Decimal', true)).toStrictEqual('float64')
  })

  it('maps Boolean to bool', () => {
    expect(prismaTypeToGoType('Boolean', true)).toStrictEqual('bool')
  })

  it('maps optional Boolean to *bool', () => {
    expect(prismaTypeToGoType('Boolean', false)).toStrictEqual('*bool')
  })

  it('maps DateTime to time.Time', () => {
    expect(prismaTypeToGoType('DateTime', true)).toStrictEqual('time.Time')
  })

  it('maps optional DateTime to *time.Time', () => {
    expect(prismaTypeToGoType('DateTime', false)).toStrictEqual('*time.Time')
  })

  it('maps Json to datatypes.JSON', () => {
    expect(prismaTypeToGoType('Json', true)).toStrictEqual('datatypes.JSON')
  })

  it('maps optional Json to datatypes.JSON (no pointer for JSON)', () => {
    expect(prismaTypeToGoType('Json', false)).toStrictEqual('datatypes.JSON')
  })

  it('maps Bytes to []byte', () => {
    expect(prismaTypeToGoType('Bytes', true)).toStrictEqual('[]byte')
  })

  it('maps optional Bytes to []byte (no pointer for slice)', () => {
    expect(prismaTypeToGoType('Bytes', false)).toStrictEqual('[]byte')
  })

  it('maps unknown type to string', () => {
    expect(prismaTypeToGoType('Unknown', true)).toStrictEqual('string')
  })
})

describe('goFieldName — Go initialism conventions', () => {
  it('converts id to ID', () => {
    expect(goFieldName('id')).toStrictEqual('ID')
  })

  it('converts userId to UserID', () => {
    expect(goFieldName('userId')).toStrictEqual('UserID')
  })

  it('converts postId to PostID', () => {
    expect(goFieldName('postId')).toStrictEqual('PostID')
  })

  it('converts avatarUrl to AvatarURL', () => {
    expect(goFieldName('avatarUrl')).toStrictEqual('AvatarURL')
  })

  it('converts ipAddress to IPAddress', () => {
    expect(goFieldName('ipAddress')).toStrictEqual('IPAddress')
  })

  it('converts providerAccountId to ProviderAccountID', () => {
    expect(goFieldName('providerAccountId')).toStrictEqual('ProviderAccountID')
  })

  it('converts createdAt to CreatedAt (no initialism)', () => {
    expect(goFieldName('createdAt')).toStrictEqual('CreatedAt')
  })

  it('converts name to Name (simple case)', () => {
    expect(goFieldName('name')).toStrictEqual('Name')
  })

  it('converts email to Email (no initialism)', () => {
    expect(goFieldName('email')).toStrictEqual('Email')
  })

  it('converts hashedPassword to HashedPassword', () => {
    expect(goFieldName('hashedPassword')).toStrictEqual('HashedPassword')
  })
})

describe('buildGormTags', () => {
  it('generates column + primaryKey + type:char(36) + json for uuid PK', () => {
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
    } as any
    expect(buildGormTags(field, true, false, [])).toStrictEqual(
      '`gorm:"column:id;primaryKey;type:char(36)" json:"id"`',
    )
  })

  it('generates primaryKey;autoIncrement for autoincrement', () => {
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
    } as any
    expect(buildGormTags(field, true, false, [])).toStrictEqual(
      '`gorm:"column:id;primaryKey;autoIncrement" json:"id"`',
    )
  })

  it('generates uniqueIndex + not null tag', () => {
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
    } as any
    expect(buildGormTags(field, false, false, [])).toStrictEqual(
      '`gorm:"column:email;uniqueIndex;not null" json:"email"`',
    )
  })

  it('generates autoUpdateTime + not null for @updatedAt', () => {
    const field = {
      name: 'updatedAt',
      kind: 'scalar' as const,
      type: 'DateTime',
      isRequired: true,
      isId: false,
      isUnique: false,
      isList: false,
      isUpdatedAt: true,
      hasDefaultValue: false,
    } as any
    expect(buildGormTags(field, false, false, [])).toStrictEqual(
      '`gorm:"column:updated_at;autoUpdateTime;not null" json:"updated_at"`',
    )
  })

  it('generates default tag for boolean default', () => {
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
    } as any
    expect(buildGormTags(field, false, false, [])).toStrictEqual(
      '`gorm:"column:active;default:true;not null" json:"active"`',
    )
  })

  it('generates column + json for nullable field with no other tags', () => {
    const field = {
      name: 'name',
      kind: 'scalar' as const,
      type: 'String',
      isRequired: false,
      isId: false,
      isUnique: false,
      isList: false,
      isUpdatedAt: false,
      hasDefaultValue: false,
    } as any
    expect(buildGormTags(field, false, false, [])).toStrictEqual('`gorm:"column:name" json:"name"`')
  })

  it('includes composite uniqueIndex tag from @@unique', () => {
    const field = {
      name: 'provider',
      kind: 'scalar' as const,
      type: 'String',
      isRequired: true,
      isId: false,
      isUnique: false,
      isList: false,
      isUpdatedAt: false,
      hasDefaultValue: false,
    } as any
    expect(
      buildGormTags(field, false, false, ['uniqueIndex:idx_provider_provider_account_id_unique']),
    ).toStrictEqual(
      '`gorm:"column:provider;uniqueIndex:idx_provider_provider_account_id_unique;not null" json:"provider"`',
    )
  })

  it('includes composite index tag from @@index', () => {
    const field = {
      name: 'userId',
      kind: 'scalar' as const,
      type: 'String',
      isRequired: true,
      isId: false,
      isUnique: false,
      isList: false,
      isUpdatedAt: false,
      hasDefaultValue: false,
    } as any
    expect(buildGormTags(field, false, false, ['index:idx_user_id'])).toStrictEqual(
      '`gorm:"column:user_id;index:idx_user_id;not null" json:"user_id"`',
    )
  })
})
