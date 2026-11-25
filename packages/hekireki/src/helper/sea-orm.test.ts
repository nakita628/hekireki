import type { DMMF } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
import { describe, expect, it } from 'vite-plus/test'

import { prismaBlocks, relationMaps } from '../prisma/schema-text.js'
import {
  buildSeaOrmAttributes,
  canDeriveEq,
  generateEntityFile,
  generateEnum,
  generateM2MEntity,
  generatePreludeRs,
  prismaTypeToRustType,
  resolveSeaOrmColumnType,
  seaOrmAttribute,
} from './sea-orm.js'

/** The datamodel of a schema `getDMMF` parses without error. */
function datamodelOf(source: string) {
  return (getDMMF({ datamodel: [['schema.prisma', source]] }) as DMMF.Document).datamodel
}

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

describe('buildSeaOrmAttributes: a default the database fills (#276)', () => {
  const column = (type: string, def: unknown, nativeType: unknown = null) =>
    ({
      name: 'stamp',
      kind: 'scalar' as const,
      type,
      isRequired: true,
      isId: false,
      isUnique: false,
      isList: false,
      isUpdatedAt: false,
      hasDefaultValue: true,
      default: def,
      nativeType,
    }) as any
  const now = { name: 'now', args: [] }

  it('writes now() as the CURRENT_TIMESTAMP of the table sea-orm creates', () => {
    expect([
      buildSeaOrmAttributes(column('DateTime', now), false, false, undefined, [], 'postgresql'),
      buildSeaOrmAttributes(column('DateTime', now), false, false, undefined, [], 'sqlite'),
    ]).toStrictEqual([
      [
        [
          '    #[sea_orm(',
          '        column_type = "custom(\\"timestamp(3)\\")",',
          '        default_expr = "Expr::current_timestamp()"',
          '    )]',
        ].join('\n'),
      ],
      ['    #[sea_orm(default_expr = "Expr::current_timestamp()")]'],
    ])
  })

  it('writes now() at the column precision on MySQL, which refuses the bare form', () => {
    expect([
      buildSeaOrmAttributes(column('DateTime', now), false, false, undefined, [], 'mysql').at(-1),
      buildSeaOrmAttributes(
        column('DateTime', now, ['Timestamp', ['6']]),
        false,
        false,
        undefined,
        [],
        'mysql',
      ).at(-1),
      buildSeaOrmAttributes(
        column('DateTime', now, ['DateTime', ['0']]),
        false,
        false,
        undefined,
        [],
        'mysql',
      ).at(-1),
    ]).toStrictEqual([
      [
        '    #[sea_orm(',
        '        column_type = "custom(\\"datetime(3)\\")",',
        '        default_expr = "Expr::cust(\\"CURRENT_TIMESTAMP(3)\\")"',
        '    )]',
      ].join('\n'),
      [
        '    #[sea_orm(',
        '        column_type = "custom(\\"timestamp(6)\\")",',
        '        default_expr = "Expr::cust(\\"CURRENT_TIMESTAMP(6)\\")"',
        '    )]',
      ].join('\n'),
      '    #[sea_orm(default_expr = "Expr::current_timestamp()")]',
    ])
  })

  it('writes the SQL of a dbgenerated() default, and nothing for an empty one', () => {
    expect([
      buildSeaOrmAttributes(
        column('String', { name: 'dbgenerated', args: ['gen_random_uuid()::text'] }),
        false,
        false,
        undefined,
        [],
        'postgresql',
      ),
      buildSeaOrmAttributes(
        column('Int', { name: 'dbgenerated', args: ['(unixepoch())'] }),
        false,
        false,
        undefined,
        [],
        'sqlite',
      ),
      buildSeaOrmAttributes(
        column('String', { name: 'dbgenerated', args: [] }),
        false,
        false,
        undefined,
        [],
        'sqlite',
      ),
    ]).toStrictEqual([
      [
        [
          '    #[sea_orm(',
          '        column_type = "Text",',
          '        default_expr = "Expr::cust(\\"gen_random_uuid()::text\\")"',
          '    )]',
        ].join('\n'),
      ],
      ['    #[sea_orm(default_expr = "Expr::cust(\\"(unixepoch())\\")")]'],
      ['    #[sea_orm(column_type = "Text")]'],
    ])
  })
})

describe('seaOrmAttribute', () => {
  it('keeps two or more arguments on one line while they take at most 70 columns', () => {
    const args = ['column_name = "jsonObj"', `default_value = "${'a'.repeat(27)}"`] as const
    expect(args.join(', ')).toHaveLength(70)
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
    expect(`#[sea_orm(${top})]`).toHaveLength(100)
    expect(seaOrmAttribute('', [top])).toBe(`#[sea_orm(${top})]`)
    expect(seaOrmAttribute('', [`${top}t`])).toBe(`#[sea_orm(\n    ${top}t\n)]`)
    const field = `default_value = "${'a'.repeat(65)}"`
    expect(`    #[sea_orm(${field})]`).toHaveLength(99)
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
        to = "super::post::Column::Id",
        fk_name = "_PostToTag_A_fkey"
    )]
    Post,
    #[sea_orm(
        belongs_to = "super::tag::Entity",
        from = "Column::TagId",
        to = "super::tag::Column::Id",
        fk_name = "_PostToTag_B_fkey"
    )]
    Tag,
}

impl ActiveModelBehavior for ActiveModel {}
`)
  })

  it('names the Relation variants in PascalCase when the models are lowercase', () => {
    // Prisma names the relation of `files` and `tags` filesTotags.
    // cspell:ignore Totags
    expect(generateM2MEntity('files', 'tags', 'filesTotags', []))
      .toBe(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "_filesTotags")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false, column_name = "A")]
    pub files_id: String,
    #[sea_orm(primary_key, auto_increment = false, column_name = "B")]
    pub tags_id: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::files::Entity",
        from = "Column::FilesId",
        to = "super::files::Column::Id",
        fk_name = "_filesTotags_A_fkey"
    )]
    Files,
    #[sea_orm(
        belongs_to = "super::tags::Entity",
        from = "Column::TagsId",
        to = "super::tags::Column::Id",
        fk_name = "_filesTotags_B_fkey"
    )]
    Tags,
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
        to = "super::extraordinarily_long_model_name_for_testing_rustfmt_width_limits_in_generated_code::Column::Id",
        fk_name = "_LongToTag_A_fkey"
    )]
    ExtraordinarilyLongModelNameForTestingRustfmtWidthLimitsInGeneratedCode,
    #[sea_orm(
        belongs_to = "super::tag::Entity",
        from = "Column::TagId",
        to = "super::tag::Column::Id",
        fk_name = "_LongToTag_B_fkey"
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

/**
 * The provider, the Prisma type, the attribute as written, its DMMF nativeType and the sea-orm
 * ColumnType of the column Prisma Migrate creates for it. `null` means the Rust type already says
 * everything sea-orm needs, so no `column_type` attribute is written at all - which is a different
 * statement from "unmapped", and the one this table exists to keep honest.
 */
const NATIVE_TYPES: readonly (readonly [
  string,
  string,
  string,
  readonly [string, readonly string[]],
  string | null,
])[] = [
  ['postgresql', 'String', '@db.VarChar(255)', ['VarChar', ['255']], 'String(StringLen::N(255))'],
  ['postgresql', 'String', '@db.VarChar', ['VarChar', []], null],
  ['postgresql', 'String', '@db.Char(10)', ['Char', ['10']], 'Char(Some(10))'],
  ['postgresql', 'String', '@db.Char', ['Char', []], 'Char(None)'],
  ['mysql', 'String', '@db.Char(2)', ['Char', ['2']], 'Char(Some(2))'],
  ['postgresql', 'String', '@db.Text', ['Text', []], 'Text'],
  ['mysql', 'String', '@db.TinyText', ['TinyText', []], 'custom("tinytext")'],
  ['mysql', 'String', '@db.MediumText', ['MediumText', []], 'custom("mediumtext")'],
  ['mysql', 'String', '@db.LongText', ['LongText', []], 'custom("longtext")'],
  ['postgresql', 'String', '@db.Citext', ['Citext', []], 'custom("citext")'],
  ['postgresql', 'String', '@db.Inet', ['Inet', []], 'Inet'],
  ['postgresql', 'String', '@db.Xml', ['Xml', []], 'custom("xml")'],
  ['postgresql', 'String', '@db.Bit(3)', ['Bit', ['3']], 'Bit(Some(3))'],
  ['postgresql', 'String', '@db.Bit', ['Bit', []], 'Bit(None)'],
  ['postgresql', 'String', '@db.VarBit(5)', ['VarBit', ['5']], 'VarBit(5)'],
  ['postgresql', 'String', '@db.VarBit', ['VarBit', []], 'custom("varbit")'],
  ['postgresql', 'String', '@db.Uuid', ['Uuid', []], null],
  ['postgresql', 'Int', '@db.SmallInt', ['SmallInt', []], null],
  ['mysql', 'Int', '@db.TinyInt', ['TinyInt', []], null],
  ['mysql', 'Int', '@db.MediumInt', ['MediumInt', []], 'custom("mediumint")'],
  [
    'mysql',
    'Int',
    '@db.UnsignedMediumInt',
    ['UnsignedMediumInt', []],
    'custom("mediumint unsigned")',
  ],
  ['mysql', 'Int', '@db.UnsignedTinyInt', ['UnsignedTinyInt', []], null],
  ['mysql', 'Int', '@db.UnsignedSmallInt', ['UnsignedSmallInt', []], null],
  ['mysql', 'Int', '@db.UnsignedInt', ['UnsignedInt', []], null],
  ['mysql', 'BigInt', '@db.UnsignedBigInt', ['UnsignedBigInt', []], null],
  ['mysql', 'Int', '@db.Year', ['Year', []], 'Year'],
  ['postgresql', 'Int', '@db.Oid', ['Oid', []], 'custom("oid")'],
  ['postgresql', 'Float', '@db.DoublePrecision', ['DoublePrecision', []], 'Double'],
  ['mysql', 'Float', '@db.Double', ['Double', []], 'Double'],
  ['mysql', 'Float', '@db.Float', ['Float', []], 'Float'],
  ['postgresql', 'Float', '@db.Real', ['Real', []], null],
  [
    'postgresql',
    'Decimal',
    '@db.Decimal(10, 2)',
    ['Decimal', ['10', '2']],
    'Decimal(Some((10, 2)))',
  ],
  ['postgresql', 'Decimal', '@db.Decimal', ['Decimal', []], 'Decimal(None)'],
  ['postgresql', 'Decimal', '@db.Money', ['Money', []], 'Money(None)'],
  ['postgresql', 'DateTime', '@db.Timestamp', ['Timestamp', []], null],
  ['postgresql', 'DateTime', '@db.Timestamp(6)', ['Timestamp', ['6']], null],
  ['postgresql', 'DateTime', '@db.Timestamp(0)', ['Timestamp', ['0']], 'custom("timestamp(0)")'],
  ['postgresql', 'DateTime', '@db.Timestamptz', ['Timestamptz', []], 'TimestampWithTimeZone'],
  [
    'postgresql',
    'DateTime',
    '@db.Timestamptz(3)',
    ['Timestamptz', ['3']],
    'custom("timestamptz(3)")',
  ],
  ['postgresql', 'DateTime', '@db.Date', ['Date', []], 'Date'],
  ['postgresql', 'DateTime', '@db.Time', ['Time', []], 'Time'],
  ['postgresql', 'DateTime', '@db.Time(3)', ['Time', ['3']], 'custom("time(3)")'],
  ['mysql', 'DateTime', '@db.DateTime', ['DateTime', []], null],
  ['mysql', 'DateTime', '@db.DateTime(6)', ['DateTime', ['6']], 'custom("datetime(6)")'],
  ['mysql', 'DateTime', '@db.Time(3)', ['Time', ['3']], 'custom("time(3)")'],
  ['mysql', 'DateTime', '@db.Time(0)', ['Time', ['0']], 'Time'],
  ['mysql', 'DateTime', '@db.Timestamp(3)', ['Timestamp', ['3']], 'custom("timestamp(3)")'],
  ['mysql', 'DateTime', '@db.Timestamp', ['Timestamp', []], null],
  ['mysql', 'Bytes', '@db.VarBinary(16)', ['VarBinary', ['16']], 'VarBinary(StringLen::N(16))'],
  ['mysql', 'Bytes', '@db.Binary(16)', ['Binary', ['16']], 'Binary(16)'],
  ['mysql', 'Bytes', '@db.Blob', ['Blob', []], 'Blob'],
  ['mysql', 'Bytes', '@db.TinyBlob', ['TinyBlob', []], 'custom("tinyblob")'],
  ['mysql', 'Bytes', '@db.MediumBlob', ['MediumBlob', []], 'custom("mediumblob")'],
  ['mysql', 'Bytes', '@db.LongBlob', ['LongBlob', []], 'custom("longblob")'],
  ['mysql', 'Bytes', '@db.Bit(8)', ['Bit', ['8']], null],
  ['mysql', 'Boolean', '@db.Bit(1)', ['Bit', ['1']], 'Bit(Some(1))'],
  ['mysql', 'Boolean', '@db.TinyInt(1)', ['TinyInt', ['1']], null],
  ['postgresql', 'Bytes', '@db.ByteA', ['ByteA', []], null],
  ['postgresql', 'Json', '@db.JsonB', ['JsonB', []], 'JsonBinary'],
  ['postgresql', 'Json', '@db.Json', ['Json', []], null],
]

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
    #[sea_orm(column_type = "custom(\\"timestamp(3)\\")")]
    pub at: DateTime,
    #[sea_orm(
        column_type = "custom(\\"timestamp(3)\\")",
        default_expr = "Expr::current_timestamp()"
    )]
    pub created: DateTime,
    #[sea_orm(column_type = "custom(\\"timestamp(3)\\")")]
    pub literal: DateTime,
    #[sea_orm(column_type = "custom(\\"timestamp(3)\\")")]
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
    #[sea_orm(default_expr = "Expr::current_timestamp()")]
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
  const field = (overrides: Partial<DMMF.Field> & { type: string }): DMMF.Field => ({
    name: 'value',
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

  it.each(NATIVE_TYPES)(
    'maps a %s %s `%s`',
    (provider, type, _attribute, nativeType, columnType) => {
      expect(resolveSeaOrmColumnType(field({ type, nativeType }), provider)).toBe(columnType)
    },
  )

  // Prisma Migrate's column of each scalar without a native type, where it is not the one sea-orm
  // derives from the Rust type.
  it.each([
    ['mysql', 'String', 'String(StringLen::N(191))'],
    ['mysql', 'Decimal', 'Decimal(Some((65, 30)))'],
    ['mysql', 'DateTime', 'custom("datetime(3)")'],
    ['mysql', 'Bytes', 'custom("longblob")'],
    ['mysql', 'Json', null],
    ['mysql', 'Int', null],
    ['mysql', 'Float', null],
    ['postgresql', 'String', 'Text'],
    ['postgresql', 'Decimal', 'Decimal(Some((65, 30)))'],
    ['postgresql', 'DateTime', 'custom("timestamp(3)")'],
    ['postgresql', 'Json', 'JsonBinary'],
    ['postgresql', 'Bytes', null],
    ['postgresql', 'BigInt', null],
    ['sqlite', 'String', 'Text'],
    ['sqlite', 'Bytes', 'Blob'],
    ['sqlite', 'DateTime', null],
    ['sqlite', 'Decimal', null],
  ])('maps a %s %s without a native type', (provider, type, columnType) => {
    expect(resolveSeaOrmColumnType(field({ type }), provider)).toBe(columnType)
  })

  it('makes a list an array of the type', () => {
    expect(
      ['String', 'Decimal', 'DateTime', 'Json', 'Int'].map((type) =>
        resolveSeaOrmColumnType(field({ type, isList: true }), 'postgresql'),
      ),
    ).toStrictEqual([
      'Array(RcOrArc::new(ColumnType::Text))',
      'Array(RcOrArc::new(ColumnType::Decimal(Some((65, 30)))))',
      'Array(RcOrArc::new(ColumnType::custom("timestamp(3)")))',
      'Array(RcOrArc::new(ColumnType::JsonBinary))',
      null,
    ])
    expect(
      resolveSeaOrmColumnType(
        field({ type: 'String', isList: true, nativeType: ['VarChar', ['10']] }),
        'postgresql',
      ),
    ).toBe('Array(RcOrArc::new(ColumnType::String(StringLen::N(10))))')
  })

  it('gives CockroachDB the PostgreSQL column types, and a native type with no arguments', () => {
    expect(resolveSeaOrmColumnType(field({ type: 'String' }), 'cockroachdb')).toBe('Text')
    expect(resolveSeaOrmColumnType(field({ type: 'Json' }), 'cockroachdb')).toBe('JsonBinary')
    expect(
      resolveSeaOrmColumnType(
        field({ type: 'String', nativeType: ['Inet', null as unknown as string[]] }),
        'postgresql',
      ),
    ).toBe('Inet')
  })

  it('writes no column type for an enum', () => {
    expect(resolveSeaOrmColumnType(field({ type: 'Role', kind: 'enum' }), 'mysql')).toBeNull()
  })

  it('writes no column type for a field the schema left unqualified, without a provider', () => {
    expect(resolveSeaOrmColumnType(field({ type: 'String' }))).toBeNull()
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

describe('generatePreludeRs', () => {
  // Amplication has a model named Entity: rustfmt drops the alias that names it as it is.
  it('writes no alias for a model named Entity', () => {
    const model = (name: string): DMMF.Model => ({
      name,
      dbName: null,
      schema: null,
      fields: [],
      uniqueFields: [],
      uniqueIndexes: [],
      primaryKey: null,
      isGenerated: false,
    })
    expect(generatePreludeRs([model('Resource'), model('Entity')])).toBe(
      'pub use super::entity::Entity;\npub use super::resource::Entity as Resource;\n',
    )
  })
})

// A `uuid` column: sqlx-postgres binds a String as `text`, which PostgreSQL does not cast to
// `uuid`, and does not decode a `uuid` into a String.
describe('@db.Uuid', () => {
  const field = (o: Record<string, unknown>): any => ({
    kind: 'scalar',
    type: 'String',
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
  const uuid = { nativeType: ['Uuid', []] }
  const model = (name: string, fields: readonly unknown[]): any => ({
    name,
    dbName: null,
    primaryKey: null,
    uniqueFields: [],
    uniqueIndexes: [],
    fields,
  })
  const owner = model('Owner', [
    field({
      name: 'id',
      isId: true,
      hasDefaultValue: true,
      default: { name: 'uuid', args: [4] },
      ...uuid,
    }),
    field({
      name: 'items',
      type: 'Item',
      kind: 'object',
      isList: true,
      relationName: 'ItemToOwner',
    }),
  ])
  const item = model('Item', [
    field({
      name: 'id',
      isId: true,
      hasDefaultValue: true,
      default: { name: 'dbgenerated', args: ['gen_random_uuid()'] },
      ...uuid,
    }),
    field({ name: 'ownerId', ...uuid }),
    field({ name: 'reviewerId', isRequired: false, ...uuid }),
    field({ name: 'refs', isList: true, ...uuid }),
    field({
      name: 'trace',
      isRequired: false,
      hasDefaultValue: true,
      default: { name: 'uuid', args: [7] },
      ...uuid,
    }),
    field({ name: 'token', hasDefaultValue: true, default: { name: 'uuid', args: [4] } }),
    field({
      name: 'owner',
      type: 'Owner',
      kind: 'object',
      relationName: 'ItemToOwner',
      relationFromFields: ['ownerId'],
      relationToFields: ['id'],
    }),
  ])

  it('declares a key with uuid() as Uuid and sets it to the Uuid itself', () => {
    expect(generateEntityFile(owner, [owner, item], [], {}, 'postgresql'))
      .toBe(`use sea_orm::entity::prelude::*;
use sea_orm::Set;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "Owner")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::item::Entity")]
    Items,
}

impl Related<super::item::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Items.def()
    }
}

impl ActiveModelBehavior for ActiveModel {
    fn new() -> Self {
        Self {
            id: Set(uuid::Uuid::new_v4()),
            ..ActiveModelTrait::default()
        }
    }
}
`)
  })

  it('declares a foreign key, an optional field and a list as Uuid, and leaves a text uuid() a String', () => {
    expect(generateEntityFile(item, [owner, item], [], {}, 'postgresql'))
      .toBe(`use sea_orm::entity::prelude::*;
use sea_orm::Set;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "Item")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    #[sea_orm(default_expr = "Expr::cust(\\"gen_random_uuid()\\")")]
    pub id: Uuid,
    #[sea_orm(column_name = "ownerId")]
    pub owner_id: Uuid,
    #[sea_orm(column_name = "reviewerId")]
    pub reviewer_id: Option<Uuid>,
    pub refs: Vec<Uuid>,
    pub trace: Option<Uuid>,
    #[sea_orm(column_type = "Text")]
    pub token: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::owner::Entity",
        from = "Column::OwnerId",
        to = "super::owner::Column::Id",
        fk_name = "Item_ownerId_fkey"
    )]
    Owner,
}

impl Related<super::owner::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Owner.def()
    }
}

impl ActiveModelBehavior for ActiveModel {
    fn new() -> Self {
        Self {
            trace: Set(Some(uuid::Uuid::now_v7())),
            token: Set(uuid::Uuid::new_v4().to_string()),
            ..ActiveModelTrait::default()
        }
    }
}
`)
  })

  it('generates nothing for ulid(), whose text is not a uuid', () => {
    const ticket = model('Ticket', [
      field({
        name: 'id',
        isId: true,
        hasDefaultValue: true,
        default: { name: 'ulid', args: [] },
        ...uuid,
      }),
    ])
    expect(generateEntityFile(ticket, [ticket], [])).toContain(
      'impl ActiveModelBehavior for ActiveModel {}',
    )
  })

  it('lays out a generated Uuid in new() as rustfmt does for the length of its name', () => {
    const name = (first: string, n: number) => first + 'q'.repeat(n - 1)
    const generated = (n: string, isRequired: boolean) =>
      field({
        name: n,
        isRequired,
        hasDefaultValue: true,
        default: { name: 'uuid', args: [4] },
        ...uuid,
      })
    const ident = model('Ident', [
      field({ name: 'id', type: 'Int', isId: true }),
      generated(name('a', 61), true),
      generated(name('b', 62), true),
      generated(name('c', 83), true),
      generated(name('d', 75), false),
      generated(name('e', 76), false),
    ])
    expect(generateEntityFile(ident, [ident], [])).toContain(`    fn new() -> Self {
        Self {
            a${'q'.repeat(60)}: Set(uuid::Uuid::new_v4()),
            b${'q'.repeat(61)}: Set(
                uuid::Uuid::new_v4(),
            ),
            c${'q'.repeat(82)}:
                Set(uuid::Uuid::new_v4()),
            d${'q'.repeat(74)}: Set(Some(
                uuid::Uuid::new_v4(),
            )),
            e${'q'.repeat(75)}: Set(
                Some(uuid::Uuid::new_v4()),
            ),
            ..ActiveModelTrait::default()
        }
    }
`)
  })

  it('gives the join table of an implicit many-to-many the Uuid of each key', () => {
    const tag = model('Tag', [field({ name: 'id', type: 'Int', isId: true })])
    expect(generateM2MEntity('Owner', 'Tag', 'OwnerToTag', [owner, tag]))
      .toContain(`pub struct Model {
    #[sea_orm(primary_key, auto_increment = false, column_name = "A")]
    pub owner_id: Uuid,
    #[sea_orm(primary_key, auto_increment = false, column_name = "B")]
    pub tag_id: i32,
}
`)
  })
})

// sqlx-postgres decodes a `smallint` only into an i16, and sqlx-mysql a `TINYINT` only into an i8.
describe('@db.SmallInt and @db.TinyInt', () => {
  const field = (o: Record<string, unknown>): any => ({
    kind: 'scalar',
    type: 'Int',
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
  const model: any = {
    name: 'Log',
    dbName: null,
    primaryKey: null,
    uniqueFields: [],
    uniqueIndexes: [],
    fields: [
      field({
        name: 'id',
        isId: true,
        hasDefaultValue: true,
        default: { name: 'autoincrement', args: [] },
      }),
      field({ name: 'action_flag', nativeType: ['SmallInt', []] }),
      field({ name: 'max_width', isRequired: false, nativeType: ['SmallInt', []] }),
      field({ name: 'level', nativeType: ['TinyInt', []] }),
      field({ name: 'rank', isRequired: false, nativeType: ['TinyInt', []] }),
    ],
  }

  it('declares a smallint column i16 and a TINYINT column i8', () => {
    expect(generateEntityFile(model, [model], [], {}, 'mysql'))
      .toBe(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "Log")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub action_flag: i16,
    pub max_width: Option<i16>,
    pub level: i8,
    pub rank: Option<i8>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
`)
  })

  it('leaves a Boolean @db.TinyInt(1) a bool', () => {
    const flag = {
      ...model,
      fields: [
        model.fields[0],
        field({ name: 'active', type: 'Boolean', nativeType: ['TinyInt', ['1']] }),
      ],
    }
    expect(generateEntityFile(flag, [flag], [], {}, 'mysql')).toContain('    pub active: bool,\n')
  })

  it('gives the join table of an implicit many-to-many the i16 of a @db.SmallInt key', () => {
    const tag: any = {
      ...model,
      name: 'Tag',
      fields: [field({ name: 'id', isId: true, nativeType: ['SmallInt', []] })],
    }
    expect(generateM2MEntity('Log', 'Tag', 'LogToTag', [model, tag])).toContain(`pub struct Model {
    #[sea_orm(primary_key, auto_increment = false, column_name = "A")]
    pub log_id: i32,
    #[sea_orm(primary_key, auto_increment = false, column_name = "B")]
    pub tag_id: i16,
}
`)
  })
})

// `Schema::create_table_from_entity` creates the column Prisma Migrate creates: the column type
// where sea-orm would derive another from the Rust type, and the Rust type sqlx decodes the
// column into.
describe('the column Prisma Migrate creates', () => {
  const field = (o: Record<string, unknown>): any => ({
    kind: 'scalar',
    type: 'String',
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
  const model = (name: string, fields: readonly unknown[]): any => ({
    name,
    dbName: null,
    primaryKey: null,
    uniqueFields: [],
    uniqueIndexes: [],
    fields,
  })
  const native = (name: string, ...args: string[]) => ({ nativeType: [name, args] })
  const id = (o: Record<string, unknown> = {}) =>
    field({
      name: 'id',
      type: 'Int',
      isId: true,
      hasDefaultValue: true,
      default: { name: 'autoincrement', args: [] },
      ...o,
    })

  it('gives a MySQL column the type, the precision and the width Prisma gives it', () => {
    const item = model('Item', [
      id(native('UnsignedInt')),
      field({ name: 'name' }),
      field({ name: 'code', ...native('Char', '2') }),
      field({ name: 'note', isRequired: false, ...native('TinyText') }),
      field({ name: 'summary', ...native('MediumText') }),
      field({ name: 'body', ...native('LongText') }),
      field({ name: 'price', type: 'Decimal' }),
      field({ name: 'at', type: 'DateTime', isRequired: false }),
      field({ name: 'clock', type: 'DateTime', ...native('Time', '3') }),
      field({ name: 'stamp', type: 'DateTime', ...native('Timestamp', '3') }),
      field({ name: 'data', type: 'Bytes' }),
      field({ name: 'digest', type: 'Bytes', ...native('Binary', '16') }),
      field({ name: 'key', type: 'Bytes', ...native('VarBinary', '16') }),
      field({ name: 'blob', type: 'Bytes', ...native('Blob') }),
      field({ name: 'thumb', type: 'Bytes', ...native('TinyBlob') }),
      field({ name: 'image', type: 'Bytes', ...native('MediumBlob') }),
      field({ name: 'rank', type: 'Int', ...native('MediumInt') }),
      field({ name: 'stock', type: 'Int', ...native('UnsignedMediumInt') }),
      field({ name: 'level', type: 'Int', ...native('UnsignedTinyInt') }),
      field({ name: 'port', type: 'Int', ...native('UnsignedSmallInt') }),
      field({
        name: 'views',
        type: 'Int',
        isRequired: false,
        hasDefaultValue: true,
        default: 0,
        ...native('UnsignedInt'),
      }),
      field({ name: 'bytes', type: 'BigInt', ...native('UnsignedBigInt') }),
      field({ name: 'year', type: 'Int', ...native('Year') }),
      field({ name: 'ratio', type: 'Float', ...native('Float') }),
      field({ name: 'active', type: 'Boolean', ...native('Bit', '1') }),
    ])
    expect(generateEntityFile(item, [item], [], {}, 'mysql')).toBe(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "Item")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: u32,
    #[sea_orm(column_type = "String(StringLen::N(191))")]
    pub name: String,
    #[sea_orm(column_type = "Char(Some(2))")]
    pub code: String,
    #[sea_orm(column_type = "custom(\\"tinytext\\")")]
    pub note: Option<String>,
    #[sea_orm(column_type = "custom(\\"mediumtext\\")")]
    pub summary: String,
    #[sea_orm(column_type = "custom(\\"longtext\\")")]
    pub body: String,
    #[sea_orm(column_type = "Decimal(Some((65, 30)))")]
    pub price: Decimal,
    #[sea_orm(column_type = "custom(\\"datetime(3)\\")")]
    pub at: Option<DateTime>,
    #[sea_orm(column_type = "custom(\\"time(3)\\")")]
    pub clock: Time,
    #[sea_orm(column_type = "custom(\\"timestamp(3)\\")")]
    pub stamp: DateTimeUtc,
    #[sea_orm(column_type = "custom(\\"longblob\\")")]
    pub data: Vec<u8>,
    #[sea_orm(column_type = "Binary(16)")]
    pub digest: Vec<u8>,
    #[sea_orm(column_type = "VarBinary(StringLen::N(16))")]
    pub key: Vec<u8>,
    #[sea_orm(column_type = "Blob")]
    pub blob: Vec<u8>,
    #[sea_orm(column_type = "custom(\\"tinyblob\\")")]
    pub thumb: Vec<u8>,
    #[sea_orm(column_type = "custom(\\"mediumblob\\")")]
    pub image: Vec<u8>,
    #[sea_orm(column_type = "custom(\\"mediumint\\")")]
    pub rank: i32,
    #[sea_orm(column_type = "custom(\\"mediumint unsigned\\")")]
    pub stock: u32,
    pub level: u8,
    pub port: u16,
    #[sea_orm(default_value = 0)]
    pub views: Option<u32>,
    pub bytes: u64,
    #[sea_orm(column_type = "Year")]
    pub year: u16,
    #[sea_orm(column_type = "Float")]
    pub ratio: f64,
    #[sea_orm(column_type = "Bit(Some(1))")]
    pub active: bool,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
`)
  })

  it('gives a PostgreSQL column its type, and casts a String column sqlx cannot bind or decode', () => {
    const host = model('Host', [
      id(),
      field({ name: 'name' }),
      field({ name: 'aliases', isList: true }),
      field({ name: 'code', ...native('Char', '2') }),
      field({ name: 'address', ...native('Inet') }),
      field({ name: 'peers', isList: true, ...native('Inet') }),
      field({ name: 'config', ...native('Xml') }),
      field({ name: 'flags', ...native('Bit', '3') }),
      field({ name: 'mask', isRequired: false, ...native('VarBit') }),
      field({ name: 'meta', type: 'Json' }),
      field({ name: 'price', type: 'Decimal' }),
      field({ name: 'fee', type: 'Decimal', ...native('Money') }),
      field({ name: 'load', type: 'Float', ...native('Real') }),
      field({ name: 'owner', type: 'Int', ...native('Oid') }),
      field({ name: 'seen', type: 'DateTime' }),
    ])
    expect(generateEntityFile(host, [host], [], {}, 'postgresql'))
      .toBe(`use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "Host")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    #[sea_orm(column_type = "Text")]
    pub name: String,
    #[sea_orm(column_type = "Array(RcOrArc::new(ColumnType::Text))")]
    pub aliases: Vec<String>,
    #[sea_orm(column_type = "Char(Some(2))")]
    pub code: String,
    #[sea_orm(column_type = "Inet", select_as = "name", save_as = "inet")]
    pub address: String,
    #[sea_orm(
        column_type = "Array(RcOrArc::new(ColumnType::Inet))",
        select_as = "name[]",
        save_as = "inet[]"
    )]
    pub peers: Vec<String>,
    #[sea_orm(column_type = "custom(\\"xml\\")", select_as = "text", save_as = "xml")]
    pub config: String,
    #[sea_orm(column_type = "Bit(Some(3))", select_as = "text", save_as = "bit(3)")]
    pub flags: String,
    #[sea_orm(
        column_type = "custom(\\"varbit\\")",
        select_as = "text",
        save_as = "varbit"
    )]
    pub mask: Option<String>,
    #[sea_orm(column_type = "JsonBinary")]
    pub meta: Json,
    #[sea_orm(column_type = "Decimal(Some((65, 30)))")]
    pub price: Decimal,
    #[sea_orm(column_type = "Money(None)", select_as = "numeric", save_as = "money")]
    pub fee: Decimal,
    pub load: f32,
    #[sea_orm(column_type = "custom(\\"oid\\")")]
    pub owner: u32,
    #[sea_orm(column_type = "custom(\\"timestamp(3)\\")")]
    pub seen: DateTime,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
`)
  })

  it('names a SQLite String TEXT and a Bytes BLOB, as Prisma does', () => {
    const file = model('File', [
      id(),
      field({ name: 'name' }),
      field({ name: 'data', type: 'Bytes' }),
    ])
    expect(generateEntityFile(file, [file], [], {}, 'sqlite')).toContain(`pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    #[sea_orm(column_type = "Text")]
    pub name: String,
    #[sea_orm(column_type = "Blob")]
    pub data: Vec<u8>,
}
`)
  })

  it('casts the join column of an inet key as the key is cast on its entity', () => {
    const host = model('Host', [id({ ...native('Inet'), type: 'String', default: undefined })])
    const tag = model('Tag', [field({ name: 'id', isId: true })])
    expect(generateM2MEntity('Host', 'Tag', 'HostToTag', [host, tag], {}, 'postgresql')).toContain(
      'select_as = "name",\n        save_as = "inet"',
    )
  })

  it("gives the join table of an implicit many-to-many each key's column", () => {
    const post = model('Post', [id(native('UnsignedInt'))])
    const tag = model('Tag', [field({ name: 'id', isId: true })])
    expect(generateM2MEntity('Post', 'Tag', 'PostToTag', [post, tag], {}, 'mysql'))
      .toContain(`pub struct Model {
    #[sea_orm(primary_key, auto_increment = false, column_name = "A")]
    pub post_id: u32,
    #[sea_orm(
        primary_key,
        auto_increment = false,
        column_name = "B",
        column_type = "String(StringLen::N(191))"
    )]
    pub tag_id: String,
}
`)
    expect(generateM2MEntity('Post', 'Tag', 'PostToTag', [post, tag], {}, 'postgresql'))
      .toContain(`    #[sea_orm(
        primary_key,
        auto_increment = false,
        column_name = "B",
        column_type = "Text"
    )]
    pub tag_id: String,
`)
  })
})

describe('foreign key names', () => {
  const source = `datasource db {
  provider = "postgresql"
}

model auth_group {
  id          Int                      @id @default(autoincrement())
  permissions auth_group_permissions[]
  members     auth_membership[]
}

model auth_group_permissions {
  id       Int        @id @default(autoincrement())
  group_id Int
  group    auth_group @relation(fields: [group_id], references: [id], map: "auth_group_permissions_group_id_b120cbf9_fk_auth_group_id")
}

model auth_membership {
  id      Int        @id @default(autoincrement())
  groupId Int        @map("group_id")
  group   auth_group @relation(fields: [groupId], references: [id])

  @@map("auth_memberships")
}
`
  const datamodel = datamodelOf(source)
  const maps = relationMaps(prismaBlocks(source))
  const entity = (name: string) =>
    datamodel.models
      .filter((model) => model.name === name)
      .map((model) =>
        generateEntityFile(model, datamodel.models, [], {}, 'postgresql', new Set(), maps),
      )
      .join('')

  it('names a foreign key with the name @relation(map:) gives it', () => {
    expect(entity('auth_group_permissions')).toContain(`    #[sea_orm(
        belongs_to = "super::auth_group::Entity",
        from = "Column::GroupId",
        to = "super::auth_group::Column::Id",
        fk_name = "auth_group_permissions_group_id_b120cbf9_fk_auth_group_id"
    )]
    Group,`)
  })

  it('names a foreign key the schema does not name as Prisma does: <table>_<columns>_fkey', () => {
    expect(entity('auth_membership')).toContain(`    #[sea_orm(
        belongs_to = "super::auth_group::Entity",
        from = "Column::GroupId",
        to = "super::auth_group::Column::Id",
        fk_name = "auth_memberships_group_id_fkey"
    )]
    Group,`)
  })
})

// The name is written as a Rust string: a quote or a backslash in it is escaped.
describe('foreign key name escaping', () => {
  it('escapes a @relation(map:) name for Rust', () => {
    const source = `datasource db {
  provider = "postgresql"
}

model a {
  id Int @id
  bs b[]
}

model b {
  id   Int @id
  a_id Int
  a    a   @relation(fields: [a_id], references: [id], map: "fk_\\"q\\\\b'")
}
`
    const datamodel = datamodelOf(source)
    const maps = relationMaps(prismaBlocks(source))
    const code = datamodel.models
      .filter((model) => model.name === 'b')
      .map((model) =>
        generateEntityFile(model, datamodel.models, [], {}, 'postgresql', new Set(), maps),
      )
      .join('')
    expect(code).toContain(`fk_name = "fk_\\"q\\\\b'"`)
  })
})
