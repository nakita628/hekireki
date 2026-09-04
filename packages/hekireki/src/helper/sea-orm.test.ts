import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import {
  buildSeaOrmAttributes,
  canDeriveEq,
  generateEntityFile,
  generateEnum,
  generateM2MEntity,
  prismaTypeToRustType,
  resolveSeaOrmColumnType,
} from './sea-orm.js'

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

    const result = generateEnum(e)
    expect(result).toContain(
      '#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]',
    )
    expect(result).toContain('pub enum Role {')
    expect(result).toContain('#[sea_orm(string_value = "ADMIN")]')
    expect(result).toContain('    Admin,')
  })

  it('converts SCREAMING_SNAKE values to UpperCamelCase variants', () => {
    const e = {
      name: 'Status',
      values: [{ name: 'ACTIVE' }, { name: 'PENDING_REVIEW' }],
    } as any

    expect(generateEnum(e)).toBe(
      [
        '#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]',
        '#[sea_orm(rs_type = "String", db_type = "Enum", enum_name = "Status")]',
        'pub enum Status {',
        '    #[sea_orm(string_value = "ACTIVE")]',
        '    Active,',
        '    #[sea_orm(string_value = "PENDING_REVIEW")]',
        '    PendingReview,',
        '}',
      ].join('\n'),
    )
  })

  it('generates serde rename_all attribute when renameAll is set', () => {
    const e = {
      name: 'Role',
      values: [{ name: 'ADMIN' }, { name: 'USER' }],
    } as any

    const result = generateEnum(e, { renameAll: 'camelCase' })
    expect(result).toContain(
      '#[derive(Debug, Clone, PartialEq, Eq, EnumIter, DeriveActiveEnum, Serialize, Deserialize)]',
    )
    expect(result).toContain('#[serde(rename_all = "camelCase")]')
    expect(result).toContain('#[sea_orm(rs_type = "String"')
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
        isReadOnly: false,
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

    const result = generateEntityFile(model, [model], [], { renameAll: 'camelCase' })
    expect(result).toContain(
      '#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]',
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
        isReadOnly: false,
        isList: false,
        isUpdatedAt: false,
        hasDefaultValue: true,
        default: { name: 'uuid', args: [] },
        nativeType: null,
      },
    ])

    const result = generateEntityFile(model, [model], [])
    expect(result).not.toContain('#[serde(')
  })
})

describe('canDeriveEq', () => {
  it('returns true for String and Int fields', () => {
    const fields = [
      { kind: 'scalar', type: 'String' },
      { kind: 'scalar', type: 'Int' },
    ] as any
    expect(canDeriveEq(fields)).toBe(true)
  })

  it('returns false when Float field exists', () => {
    const fields = [
      { kind: 'scalar', type: 'String' },
      { kind: 'scalar', type: 'Float' },
    ] as any
    expect(canDeriveEq(fields)).toBe(false)
  })

  it('ignores object (relation) fields', () => {
    const fields = [
      { kind: 'scalar', type: 'String' },
      { kind: 'object', type: 'Post' },
    ] as any
    expect(canDeriveEq(fields)).toBe(true)
  })
})

describe('generateEntityFile Eq derive', () => {
  const makeModel = (name: string, fields: any[]): any => ({
    name,
    dbName: null,
    fields,
    primaryKey: null,
    uniqueFields: [],
    uniqueIndexes: [],
  })

  it('includes Eq when all fields support Eq', () => {
    const model = makeModel('User', [
      {
        name: 'id',
        kind: 'scalar',
        type: 'String',
        isRequired: true,
        isId: true,
        isUnique: false,
        isReadOnly: false,
        isList: false,
        isUpdatedAt: false,
        hasDefaultValue: true,
        default: { name: 'uuid', args: [] },
        nativeType: null,
      },
    ])
    const result = generateEntityFile(model, [model], [])
    expect(result).toContain('PartialEq, Eq, DeriveEntityModel')
  })

  it('omits Eq when Float field exists', () => {
    const model = makeModel('Product', [
      {
        name: 'id',
        kind: 'scalar',
        type: 'Int',
        isRequired: true,
        isId: true,
        isUnique: false,
        isReadOnly: false,
        isList: false,
        isUpdatedAt: false,
        hasDefaultValue: true,
        default: { name: 'autoincrement', args: [] },
        nativeType: null,
      },
      {
        name: 'price',
        kind: 'scalar',
        type: 'Float',
        isRequired: true,
        isId: false,
        isUnique: false,
        isList: false,
        isUpdatedAt: false,
        hasDefaultValue: false,
        nativeType: null,
      },
    ])
    const result = generateEntityFile(model, [model], [])
    expect(result).toContain('PartialEq, DeriveEntityModel')
    expect(result).not.toContain('PartialEq, Eq')
  })
})

describe('uuid default generation', () => {
  const makeModel = (name: string, fields: DMMF.Field[]): DMMF.Model => ({
    name,
    dbName: null,
    schema: null,
    fields,
    uniqueFields: [],
    uniqueIndexes: [],
    primaryKey: null,
  })

  it('generates ActiveModelBehavior::new for uuid() and uuid(7) primary keys', () => {
    const v4Model = makeModel('User', [
      {
        name: 'id',
        kind: 'scalar',
        type: 'String',
        isRequired: true,
        isId: true,
        isUnique: false,
        isReadOnly: false,
        isList: false,
        isUpdatedAt: false,
        hasDefaultValue: true,
        default: { name: 'uuid', args: [4] },
        nativeType: null,
      },
    ])

    expect(generateEntityFile(v4Model, [v4Model], [])).toBe(`use sea_orm::entity::prelude::*;
use sea_orm::Set;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "user")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {
    fn new() -> Self {
        Self {
            id: Set(uuid::Uuid::new_v4().to_string()),
            ..ActiveModelTrait::default()
        }
    }
}`)

    const v7Model = makeModel('Event', [
      {
        name: 'id',
        kind: 'scalar',
        type: 'String',
        isRequired: true,
        isId: true,
        isUnique: false,
        isReadOnly: false,
        isList: false,
        isUpdatedAt: false,
        hasDefaultValue: true,
        default: { name: 'uuid', args: [7] },
        nativeType: null,
      },
    ])

    expect(generateEntityFile(v7Model, [v7Model], [])).toBe(`use sea_orm::entity::prelude::*;
use sea_orm::Set;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "event")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {
    fn new() -> Self {
        Self {
            id: Set(uuid::Uuid::now_v7().to_string()),
            ..ActiveModelTrait::default()
        }
    }
}`)
  })
})

describe('ulid default generation', () => {
  it('generates ActiveModelBehavior::new with a ULID for ulid() primary keys', () => {
    const model: DMMF.Model = {
      name: 'Ticket',
      dbName: null,
      schema: null,
      fields: [
        {
          name: 'id',
          kind: 'scalar',
          type: 'String',
          isRequired: true,
          isId: true,
          isUnique: false,
          isReadOnly: false,
          isList: false,
          isUpdatedAt: false,
          hasDefaultValue: true,
          default: { name: 'ulid', args: [] },
          nativeType: null,
        },
      ],
      uniqueFields: [],
      uniqueIndexes: [],
      primaryKey: null,
    }

    expect(generateEntityFile(model, [model], [])).toBe(`use sea_orm::entity::prelude::*;
use sea_orm::Set;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "ticket")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {
    fn new() -> Self {
        Self {
            id: Set(ulid::Ulid::generate().to_string()),
            ..ActiveModelTrait::default()
        }
    }
}`)
  })
})

describe('implicit many-to-many entity', () => {
  it('pins the Prisma A/B join table columns via column_name', () => {
    expect(generateM2MEntity('Post', 'Tag', 'PostToTag', [])).toBe(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "_PostToTag")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false, column_name = "A")]
    pub post_id: String,
    #[sea_orm(primary_key, auto_increment = false, column_name = "B")]
    pub tag_id: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::post::Entity",
        from = "Column::PostId",
        to = "super::post::Column::Id"
    )]
    Post,
    #[sea_orm(
        belongs_to = "super::tag::Entity",
        from = "Column::TagId",
        to = "super::tag::Column::Id"
    )]
    Tag,
}

impl ActiveModelBehavior for ActiveModel {}`)
  })
})

describe('two relations to the same target', () => {
  it('pins each has_many join with explicit from/to instead of the shared Related impl', () => {
    const makeField = (o: Record<string, unknown>): any => ({
      kind: 'scalar',
      isList: false,
      isRequired: true,
      isUnique: false,
      isId: false,
      isReadOnly: false,
      isGenerated: false,
      isUpdatedAt: false,
      hasDefaultValue: false,
      ...o,
    })
    const account: any = {
      name: 'Account',
      dbName: null,
      primaryKey: null,
      uniqueFields: [],
      uniqueIndexes: [],
      fields: [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
        makeField({
          name: 'followers',
          type: 'Follow',
          kind: 'object',
          isList: true,
          relationName: 'following',
        }),
        makeField({
          name: 'following',
          type: 'Follow',
          kind: 'object',
          isList: true,
          relationName: 'follower',
        }),
      ],
    }
    const follow: any = {
      name: 'Follow',
      dbName: null,
      primaryKey: { name: null, fields: ['followerId', 'followingId'] },
      uniqueFields: [],
      uniqueIndexes: [],
      fields: [
        makeField({ name: 'followerId', type: 'String' }),
        makeField({ name: 'followingId', type: 'String' }),
        makeField({
          name: 'follower',
          type: 'Account',
          kind: 'object',
          relationName: 'follower',
          relationFromFields: ['followerId'],
          relationToFields: ['id'],
        }),
        makeField({
          name: 'following',
          type: 'Account',
          kind: 'object',
          relationName: 'following',
          relationFromFields: ['followingId'],
          relationToFields: ['id'],
        }),
      ],
    }

    expect(generateEntityFile(account, [account, follow], []))
      .toBe(`use sea_orm::entity::prelude::*;
use sea_orm::Set;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "account")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        has_many = "super::follow::Entity",
        from = "Column::Id",
        to = "super::follow::Column::FollowingId"
    )]
    Followers,
    #[sea_orm(
        has_many = "super::follow::Entity",
        from = "Column::Id",
        to = "super::follow::Column::FollowerId"
    )]
    Following,
}

impl Related<super::follow::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Followers.def()
    }
}

impl ActiveModelBehavior for ActiveModel {
    fn new() -> Self {
        Self {
            id: Set(uuid::Uuid::new_v4().to_string()),
            ..ActiveModelTrait::default()
        }
    }
}`)
  })
})

/** Prisma type, the attribute as written, its DMMF nativeType and the sea-orm ColumnType. */
const NATIVE_TYPES: readonly (readonly [
  string,
  string,
  readonly [string, readonly string[]],
  string | null,
])[] = [
  ['String', '@db.VarChar(255)', ['VarChar', ['255']], 'String(StringLen::N(255))'],
  ['String', '@db.VarChar', ['VarChar', []], null],
  ['String', '@db.Char(10)', ['Char', ['10']], 'String(StringLen::N(10))'],
  ['String', '@db.Char', ['Char', []], null],
  ['String', '@db.Text', ['Text', []], 'Text'],
  ['String', '@db.MediumText', ['MediumText', []], 'Text'],
  ['String', '@db.LongText', ['LongText', []], 'Text'],
  ['String', '@db.TinyText', ['TinyText', []], 'Text'],
  ['Int', '@db.SmallInt', ['SmallInt', []], 'SmallInteger'],
  ['Int', '@db.TinyInt', ['TinyInt', []], 'SmallInteger'],
  ['Int', '@db.MediumInt', ['MediumInt', []], 'Integer'],
  ['Float', '@db.DoublePrecision', ['DoublePrecision', []], 'Double'],
  ['Float', '@db.Double', ['Double', []], 'Double'],
  ['Float', '@db.Real', ['Real', []], 'Double'],
  ['Decimal', '@db.Decimal(10, 2)', ['Decimal', ['10', '2']], 'Decimal(Some((10, 2)))'],
  ['Decimal', '@db.Decimal', ['Decimal', []], 'Decimal(None)'],
  ['Decimal', '@db.Money(10, 2)', ['Money', ['10', '2']], 'Decimal(Some((10, 2)))'],
  ['String', '@db.Uuid', ['Uuid', []], 'Uuid'],
  ['DateTime', '@db.Timestamp', ['Timestamp', []], null],
  ['DateTime', '@db.Timestamptz', ['Timestamptz', []], 'TimestampWithTimeZone'],
  ['DateTime', '@db.Date', ['Date', []], 'Date'],
  ['DateTime', '@db.Time', ['Time', []], 'Time'],
  ['DateTime', '@db.Timetz', ['Timetz', []], 'Time'],
  ['Json', '@db.JsonB', ['JsonB', []], 'JsonBinary'],
  ['String', '@db.Xml', ['Xml', []], null],
]

// `@db.*` is the only way a Prisma schema pins a column type. `null` means the Rust type already
// says everything sea-orm needs, so no `column_type` attribute is written at all - which is a
// different statement from "unmapped", and the one this table exists to keep honest.
describe('resolveSeaOrmColumnType', () => {
  it.each(NATIVE_TYPES)('maps %s `%s`', (type, _attribute, nativeType, columnType) => {
    const field: DMMF.Field = {
      name: 'value',
      type,
      nativeType,
      kind: 'scalar',
      isList: false,
      isRequired: true,
      isUnique: false,
      isId: false,
      isReadOnly: false,
      isGenerated: false,
      isUpdatedAt: false,
      hasDefaultValue: false,
    }
    expect(resolveSeaOrmColumnType(field)).toBe(columnType)
  })

  it('writes no column type for a field the schema left unqualified', () => {
    const field: DMMF.Field = {
      name: 'value',
      type: 'String',
      kind: 'scalar',
      isList: false,
      isRequired: true,
      isUnique: false,
      isId: false,
      isReadOnly: false,
      isGenerated: false,
      isUpdatedAt: false,
      hasDefaultValue: false,
    }
    expect(resolveSeaOrmColumnType(field)).toBeNull()
  })
})

// An optional column is an `Option<T>`; an unknown Prisma type falls back to String rather than
// emitting a Rust type that does not exist.
describe('prismaTypeToRustType', () => {
  it.each([
    ['String', true, 'String'],
    ['String', false, 'Option<String>'],
    ['Int', true, 'i32'],
    ['Int', false, 'Option<i32>'],
    ['BigInt', true, 'i64'],
    ['Float', true, 'f64'],
    ['Decimal', true, 'Decimal'],
    ['Boolean', true, 'bool'],
    ['Boolean', false, 'Option<bool>'],
    ['DateTime', true, 'DateTime'],
    ['DateTime', false, 'Option<DateTime>'],
    ['Json', true, 'Json'],
    ['Bytes', true, 'Vec<u8>'],
    ['Unknown', true, 'String'],
    ['Unknown', false, 'Option<String>'],
  ] as readonly (readonly [string, boolean, string])[])(
    'maps %s (required: %s)',
    (type, isRequired, rust) => {
      expect(prismaTypeToRustType(type, isRequired)).toBe(rust)
    },
  )
})
