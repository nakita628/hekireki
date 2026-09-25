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
  seaOrmAttribute,
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
      '    #[sea_orm(primary_key, auto_increment = false)]',
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
    expect(buildSeaOrmAttributes(field, true, false)).toStrictEqual(['    #[sea_orm(primary_key)]'])
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
    expect(buildSeaOrmAttributes(field, false, false)).toStrictEqual(['    #[sea_orm(unique)]'])
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
      '    #[sea_orm(default_value = true)]',
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
      '    #[sea_orm(column_name = "code_name_custom")]',
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
      '    #[sea_orm(column_type = "String(StringLen::N(200))")]',
    ])
  })

  it('puts the arguments on lines of their own once they pass the width rustfmt allows', () => {
    const field = {
      name: 'jsonObj',
      kind: 'scalar' as const,
      type: 'Json',
      isRequired: true,
      isId: false,
      isUnique: false,
      isList: false,
      isUpdatedAt: false,
      hasDefaultValue: true,
      default: '{"a":1,"b":[true,null,"x"]}',
      nativeType: null,
    } as any
    expect(buildSeaOrmAttributes(field, false, false)).toStrictEqual([
      [
        '    #[sea_orm(',
        '        column_name = "jsonObj",',
        '        default_value = "{\\"a\\":1,\\"b\\":[true,null,\\"x\\"]}"',
        '    )]',
      ].join('\n'),
    ])
  })
})

describe('seaOrmAttribute', () => {
  it('keeps two or more arguments on one line while they take at most 70 columns', () => {
    const args = ['column_name = "jsonObj"', `default_value = "${'a'.repeat(27)}"`]
    expect(args.join(', ').length).toBe(70)
    expect(seaOrmAttribute('    ', args)).toBe(`    #[sea_orm(${args.join(', ')})]`)
    expect(seaOrmAttribute('    ', [args[0], `default_value = "${'a'.repeat(28)}"`])).toBe(
      [
        '    #[sea_orm(',
        '        column_name = "jsonObj",',
        `        default_value = "${'a'.repeat(28)}"`,
        '    )]',
      ].join('\n'),
    )
  })

  it('counts a wide character as two columns, as rustfmt does', () => {
    // `a = "x", b = ""` takes 15 columns, 27 wide characters and a narrow one 55 more.
    const fits = ['a = "x"', `b = "${'日'.repeat(27)}a"`]
    expect(seaOrmAttribute('', fits)).toBe(`#[sea_orm(${fits.join(', ')})]`)
    expect(seaOrmAttribute('', ['a = "x"', `b = "${'日'.repeat(28)}"`])).toBe(
      ['#[sea_orm(', '    a = "x",', `    b = "${'日'.repeat(28)}"`, ')]'].join('\n'),
    )
    expect(seaOrmAttribute('', ['a = "x"', `b = "${'🔥'.repeat(28)}"`])).toContain('\n')
  })

  it('keeps one argument on one line while the line fits, one column less on a field', () => {
    const top = `table_name = "${'t'.repeat(73)}"`
    expect(`#[sea_orm(${top})]`.length).toBe(100)
    expect(seaOrmAttribute('', [top])).toBe(`#[sea_orm(${top})]`)
    expect(seaOrmAttribute('', [`${top}t`])).toBe(`#[sea_orm(\n    ${top}t\n)]`)
    const field = `default_value = "${'a'.repeat(65)}"`
    expect(`    #[sea_orm(${field})]`.length).toBe(99)
    expect(seaOrmAttribute('    ', [field])).toBe(`    #[sea_orm(${field})]`)
    expect(seaOrmAttribute('    ', [`${field}a`])).toBe(`    #[sea_orm(\n        ${field}a\n    )]`)
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
    expect(result).toContain('#[sea_orm(table_name = "User")]')
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
#[sea_orm(table_name = "User")]
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
}
`)

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
#[sea_orm(table_name = "Event")]
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
}
`)
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
#[sea_orm(table_name = "Ticket")]
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
}
`)
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

impl ActiveModelBehavior for ActiveModel {}
`)
  })
})

describe('lines rustfmt would break', () => {
  // rustfmt breaks a line that runs past 100 columns; each case here is what it writes.
  it('breaks a has_many attribute and a Related header past 100 columns', () => {
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
    const itemName = 'ExtraordinarilyLongInventoryItemNameForTestingRustfmtWidths'
    const id = makeField({
      name: 'id',
      type: 'Int',
      isId: true,
      hasDefaultValue: true,
      default: { name: 'autoincrement', args: [] },
    })
    const shelf: any = {
      name: 'Shelf',
      dbName: null,
      primaryKey: null,
      uniqueFields: [],
      uniqueIndexes: [],
      fields: [
        id,
        makeField({
          name: 'items',
          type: itemName,
          kind: 'object',
          isList: true,
          relationName: 'ShelfItems',
        }),
      ],
    }
    const item: any = {
      name: itemName,
      dbName: null,
      primaryKey: null,
      uniqueFields: [],
      uniqueIndexes: [],
      fields: [
        id,
        makeField({ name: 'shelfId', type: 'Int' }),
        makeField({
          name: 'shelf',
          type: 'Shelf',
          kind: 'object',
          relationName: 'ShelfItems',
          relationFromFields: ['shelfId'],
          relationToFields: ['id'],
        }),
      ],
    }

    expect(generateEntityFile(shelf, [shelf, item], [])).toBe(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "Shelf")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        has_many = "super::extraordinarily_long_inventory_item_name_for_testing_rustfmt_widths::Entity"
    )]
    Items,
}

impl Related<super::extraordinarily_long_inventory_item_name_for_testing_rustfmt_widths::Entity>
    for Entity
{
    fn to() -> RelationDef {
        Relation::Items.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
`)
  })

  it('breaks a long chain and a long assignment in before_save as rustfmt does', () => {
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
      nativeType: null,
      ...o,
    })
    const stamp: any = {
      name: 'Stamp',
      dbName: null,
      primaryKey: null,
      uniqueFields: [],
      uniqueIndexes: [],
      fields: [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'createdAtOfTheRecordAsTheApplicationFirstSawIt',
          type: 'DateTime',
          hasDefaultValue: true,
          default: { name: 'now', args: [] },
        }),
        makeField({
          name: 'publishedAtOfTheRecordAsTheEditorialTeamDecided',
          type: 'DateTime',
          isRequired: false,
          hasDefaultValue: true,
          default: '2020-02-29T23:59:59.999Z',
        }),
        makeField({
          name: 'updatedAtOfTheRecordAsTheApplicationLastSawIt',
          type: 'DateTime',
          isUpdatedAt: true,
        }),
      ],
    }

    expect(generateEntityFile(stamp, [stamp], []))
      .toContain(`impl ActiveModelBehavior for ActiveModel {
    async fn before_save<C>(mut self, _db: &C, insert: bool) -> Result<Self, DbErr>
    where
        C: ConnectionTrait,
    {
        let now = chrono::Utc::now().trunc_subsecs(3);
        if insert
            && self
                .created_at_of_the_record_as_the_application_first_saw_it
                .is_not_set()
        {
            self.created_at_of_the_record_as_the_application_first_saw_it = Set(now.naive_utc());
        }
        if insert
            && self
                .published_at_of_the_record_as_the_editorial_team_decided
                .is_not_set()
        {
            self.published_at_of_the_record_as_the_editorial_team_decided =
                Set(Some("2020-02-29T23:59:59.999".parse().unwrap()));
        }
        if !self
            .updated_at_of_the_record_as_the_application_last_saw_it
            .is_set()
        {
            self.updated_at_of_the_record_as_the_application_last_saw_it = Set(now.naive_utc());
        }
        Ok(self)
    }
}
`)
  })

  it('lays out each generated id in new() as rustfmt does for the length of its name', () => {
    const idField = (name: string, isRequired: boolean, fn: string, args: number[]): any => ({
      name,
      kind: 'scalar',
      type: 'String',
      isList: false,
      isRequired,
      isUnique: false,
      isId: false,
      isReadOnly: false,
      isGenerated: false,
      isUpdatedAt: false,
      hasDefaultValue: true,
      default: { name: fn, args },
      nativeType: null,
    })
    // A name of n characters: 55 and 61 fall either side of where rustfmt breaks inside the uuid
    // call (a name and a call of 93 together), 84 puts Set on the next line, 60 and 80 fall
    // either side of where it stops breaking inside Some.
    const name = (first: string, n: number) => first + 'q'.repeat(n - 1)
    const ident: any = {
      name: 'Ident',
      dbName: null,
      primaryKey: null,
      uniqueFields: [],
      uniqueIndexes: [],
      fields: [
        { ...idField('id', true, 'autoincrement', []), type: 'Int', isId: true },
        idField(name('a', 55), true, 'uuid', [4]),
        idField(name('b', 61), true, 'uuid', [7]),
        idField(name('c', 70), true, 'ulid', []),
        idField(name('d', 84), true, 'ulid', []),
        idField(name('e', 60), false, 'uuid', [4]),
        idField(name('g', 80), false, 'uuid', [7]),
      ],
    }

    expect(generateEntityFile(ident, [ident], []))
      .toContain(`impl ActiveModelBehavior for ActiveModel {
    fn new() -> Self {
        Self {
            aqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq: Set(
                uuid::Uuid::new_v4().to_string()
            ),
            bqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq: Set(uuid::Uuid::now_v7(
            )
            .to_string()),
            cqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq: Set(
                ulid::Ulid::generate().to_string(),
            ),
            dqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq:
                Set(ulid::Ulid::generate().to_string()),
            eqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq: Set(Some(
                uuid::Uuid::new_v4().to_string(),
            )),
            gqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq: Set(
                Some(uuid::Uuid::now_v7().to_string()),
            ),
            ..ActiveModelTrait::default()
        }
    }
}
`)
  })

  it('puts the type of a field on the next line on the next line past 100 columns', () => {
    expect(
      generateM2MEntity(
        'ExtraordinarilyLongModelNameForTestingRustfmtWidthLimitsInGeneratedCode',
        'Tag',
        'LongToTag',
        [],
      ),
    ).toBe(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "_LongToTag")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false, column_name = "A")]
    pub extraordinarily_long_model_name_for_testing_rustfmt_width_limits_in_generated_code_id:
        String,
    #[sea_orm(primary_key, auto_increment = false, column_name = "B")]
    pub tag_id: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::extraordinarily_long_model_name_for_testing_rustfmt_width_limits_in_generated_code::Entity",
        from = "Column::ExtraordinarilyLongModelNameForTestingRustfmtWidthLimitsInGeneratedCodeId",
        to = "super::extraordinarily_long_model_name_for_testing_rustfmt_width_limits_in_generated_code::Column::Id"
    )]
    ExtraordinarilyLongModelNameForTestingRustfmtWidthLimitsInGeneratedCode,
    #[sea_orm(
        belongs_to = "super::tag::Entity",
        from = "Column::TagId",
        to = "super::tag::Column::Id"
    )]
    Tag,
}

impl ActiveModelBehavior for ActiveModel {}
`)
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
#[sea_orm(table_name = "Account")]
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
}
`)
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
  ['Json', '@db.JsonB', ['JsonB', []], 'JsonBinary'],
  ['String', '@db.Xml', ['Xml', []], null],
]

// `@db.*` is the only way a Prisma schema pins a column type. `null` means the Rust type already
// says everything sea-orm needs, so no `column_type` attribute is written at all - which is a
// different statement from "unmapped", and the one this table exists to keep honest.
describe('DateTime defaults and @updatedAt', () => {
  const field = (overrides: Partial<DMMF.Field> & { name: string; type: string }): DMMF.Field => ({
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
  })
  const model: DMMF.Model = {
    name: 'Event',
    dbName: null,
    schema: null,
    uniqueFields: [],
    uniqueIndexes: [],
    primaryKey: null,
    fields: [
      field({
        name: 'id',
        type: 'Int',
        isId: true,
        hasDefaultValue: true,
        default: { name: 'autoincrement', args: [] },
      }),
      field({ name: 'at', type: 'DateTime' }),
      field({
        name: 'created',
        type: 'DateTime',
        hasDefaultValue: true,
        default: { name: 'now', args: [] },
      }),
      field({
        name: 'literal',
        type: 'DateTime',
        hasDefaultValue: true,
        default: '2024-01-15T10:30:00.000Z',
      }),
      field({ name: 'updated', type: 'DateTime', isRequired: false, isUpdatedAt: true }),
    ],
  }

  it('fills now(), a literal and @updatedAt in before_save, at millisecond precision', () => {
    expect(generateEntityFile(model, [model], [], {}, 'postgresql')).toBe(`use chrono::SubsecRound;
use sea_orm::entity::prelude::*;
use sea_orm::Set;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "Event")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub at: DateTime,
    pub created: DateTime,
    pub literal: DateTime,
    pub updated: Option<DateTime>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

#[async_trait::async_trait]
impl ActiveModelBehavior for ActiveModel {
    async fn before_save<C>(mut self, _db: &C, insert: bool) -> Result<Self, DbErr>
    where
        C: ConnectionTrait,
    {
        let now = chrono::Utc::now().trunc_subsecs(3);
        if insert && self.created.is_not_set() {
            self.created = Set(now.naive_utc());
        }
        if insert && self.literal.is_not_set() {
            self.literal = Set("2024-01-15T10:30:00.000".parse().unwrap());
        }
        if !self.updated.is_set() {
            self.updated = Set(Some(now.naive_utc()));
        }
        Ok(self)
    }
}
`)
  })

  it('declares a SQLite DateTime as PrismaDateTime, which writes the text Prisma writes', () => {
    expect(generateEntityFile(model, [model], [], {}, 'sqlite'))
      .toBe(`use super::prisma_date_time::PrismaDateTime;
use chrono::SubsecRound;
use sea_orm::entity::prelude::*;
use sea_orm::Set;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "Event")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub at: PrismaDateTime,
    pub created: PrismaDateTime,
    pub literal: PrismaDateTime,
    pub updated: Option<PrismaDateTime>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

#[async_trait::async_trait]
impl ActiveModelBehavior for ActiveModel {
    async fn before_save<C>(mut self, _db: &C, insert: bool) -> Result<Self, DbErr>
    where
        C: ConnectionTrait,
    {
        let now = chrono::Utc::now().trunc_subsecs(3);
        if insert && self.created.is_not_set() {
            self.created = Set(now.into());
        }
        if insert && self.literal.is_not_set() {
            self.literal = Set("2024-01-15T10:30:00.000Z".parse().unwrap());
        }
        if !self.updated.is_set() {
            self.updated = Set(Some(now.into()));
        }
        Ok(self)
    }
}
`)
  })
})

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
