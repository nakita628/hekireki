import type { DMMF } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
import { describe, expect, it } from 'vite-plus/test'

import { generateGormModels } from '../generator/gorm.js'
import { partialIndexWhere } from '../prisma/partial-index.js'
import { prismaBlocks, relationMaps } from '../prisma/schema-text.js'
import { buildGormTags, goFieldName, gormProblems, prismaTypeToGoType } from './gorm.js'

/** The datamodel of a schema the test expects Prisma to parse. */
function datamodelOf(result: ReturnType<typeof getDMMF>) {
  if ('type' in result) throw new Error(result.error.message)
  return result.datamodel
}

describe('prismaTypeToGoType', () => {
  it('maps String to string', () => {
    expect(prismaTypeToGoType('String', true)).toBe('string')
  })

  it('maps optional String to *string', () => {
    expect(prismaTypeToGoType('String', false)).toBe('*string')
  })

  it('maps Int to int', () => {
    expect(prismaTypeToGoType('Int', true)).toBe('int')
  })

  it('maps optional Int to *int', () => {
    expect(prismaTypeToGoType('Int', false)).toBe('*int')
  })

  it('maps BigInt to int64', () => {
    expect(prismaTypeToGoType('BigInt', true)).toBe('int64')
  })

  it('maps Float to float64', () => {
    expect(prismaTypeToGoType('Float', true)).toBe('float64')
  })

  it('maps Decimal to float64', () => {
    expect(prismaTypeToGoType('Decimal', true)).toBe('float64')
  })

  it('maps Boolean to bool', () => {
    expect(prismaTypeToGoType('Boolean', true)).toBe('bool')
  })

  it('maps optional Boolean to *bool', () => {
    expect(prismaTypeToGoType('Boolean', false)).toBe('*bool')
  })

  it('maps DateTime to time.Time', () => {
    expect(prismaTypeToGoType('DateTime', true)).toBe('time.Time')
  })

  it('maps optional DateTime to *time.Time', () => {
    expect(prismaTypeToGoType('DateTime', false)).toBe('*time.Time')
  })

  it('maps Json to datatypes.JSON', () => {
    expect(prismaTypeToGoType('Json', true)).toBe('datatypes.JSON')
  })

  it('maps optional Json to datatypes.JSON (no pointer for JSON)', () => {
    expect(prismaTypeToGoType('Json', false)).toBe('datatypes.JSON')
  })

  it('maps Bytes to []byte', () => {
    expect(prismaTypeToGoType('Bytes', true)).toBe('[]byte')
  })

  it('maps optional Bytes to []byte (no pointer for slice)', () => {
    expect(prismaTypeToGoType('Bytes', false)).toBe('[]byte')
  })

  it('maps unknown type to string', () => {
    expect(prismaTypeToGoType('Unknown', true)).toBe('string')
  })
})

describe('goFieldName — Go initialism conventions', () => {
  it('converts id to ID', () => {
    expect(goFieldName('id')).toBe('ID')
  })

  it('converts userId to UserID', () => {
    expect(goFieldName('userId')).toBe('UserID')
  })

  it('converts postId to PostID', () => {
    expect(goFieldName('postId')).toBe('PostID')
  })

  it('converts avatarUrl to AvatarURL', () => {
    expect(goFieldName('avatarUrl')).toBe('AvatarURL')
  })

  it('converts ipAddress to IPAddress', () => {
    expect(goFieldName('ipAddress')).toBe('IPAddress')
  })

  it('converts providerAccountId to ProviderAccountID', () => {
    expect(goFieldName('providerAccountId')).toBe('ProviderAccountID')
  })

  it('converts createdAt to CreatedAt (no initialism)', () => {
    expect(goFieldName('createdAt')).toBe('CreatedAt')
  })

  it('converts name to Name (simple case)', () => {
    expect(goFieldName('name')).toBe('Name')
  })

  it('converts email to Email (no initialism)', () => {
    expect(goFieldName('email')).toBe('Email')
  })

  it('converts hashedPassword to HashedPassword', () => {
    expect(goFieldName('hashedPassword')).toBe('HashedPassword')
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
    expect(buildGormTags(field, true, false, [])).toBe(
      '`gorm:"column:id;primaryKey;type:char(36)" json:"id"`',
    )
  })

  it('writes a dbgenerated() expression that spans lines on one line Go can read', () => {
    const field = (expression: string) =>
      ({
        name: 'classification',
        kind: 'scalar' as const,
        type: 'String',
        isRequired: false,
        isId: false,
        isUnique: false,
        isList: false,
        isUpdatedAt: false,
        hasDefaultValue: true,
        default: { name: 'dbgenerated', args: [expression] },
      }) as any
    // The line breaks are written \n, which reflect.StructTag gives back as they were.
    expect(
      buildGormTags(
        field(
          "\nCASE\n    WHEN (kind = 'Loan') THEN 'liability'::text\n    ELSE 'asset'::text\nEND",
        ),
        false,
        false,
        [],
        [],
        'postgresql',
      ),
    ).toBe(
      String.raw`${'`'}gorm:"column:classification;default:\nCASE\n    WHEN (kind = 'Loan') THEN 'liability'::text\n    ELSE 'asset'::text\nEND" json:"classification"${'`'}`,
    )
    // A `;`, a `"`, a tab and a `--` comment's line end are escaped for the tag.
    expect(
      buildGormTags(field('concat(\'a;\',\t"x", -- why\n 0)'), false, false, [], [], 'postgresql'),
    ).toBe(
      String.raw`${'`'}gorm:"column:classification;default:concat('a\\;',\t\"x\", -- why\n 0)" json:"classification"${'`'}`,
    )
    // A backtick (MySQL quotes an identifier with it) would end a raw string, so the tag is an
    // interpreted string literal.
    expect(buildGormTags(field('(`a` + 1)'), false, false, [], [], 'mysql')).toBe(
      String.raw`"gorm:\"column:classification;type:varchar(191);default:(${'`'}a${'`'} + 1)\" json:\"classification\""`,
    )
  })

  it('writes a json name encoding/json reads as the key: "-," for a "-", the field name for one with a ","', () => {
    const field = (dbName: string) =>
      ({
        name: 'label',
        dbName,
        kind: 'scalar' as const,
        type: 'String',
        isRequired: true,
        isId: false,
        isUnique: false,
        isList: false,
        isUpdatedAt: false,
        hasDefaultValue: false,
      }) as any
    expect(buildGormTags(field('-'), false, false, [], [], 'postgresql')).toBe(
      '`gorm:"column:-;not null" json:"-,"`',
    )
    expect(buildGormTags(field('id,string'), false, false, [], [], 'postgresql')).toBe(
      '`gorm:"column:id,string;not null" json:"Label"`',
    )
  })

  it('writes a dbgenerated() default ending in a backslash last, as GORM joins it to the next setting', () => {
    const field = (expression: string) =>
      ({
        name: 'path',
        kind: 'scalar' as const,
        type: 'Int',
        isRequired: true,
        isId: false,
        isUnique: false,
        isList: false,
        isUpdatedAt: false,
        hasDefaultValue: true,
        default: { name: 'dbgenerated', args: [expression] },
      }) as any
    expect(buildGormTags(field('x\\'), false, false, [], [], 'postgresql')).toBe(
      String.raw`${'`'}gorm:"column:path;size:32;not null;default:x\\" json:"path"${'`'}`,
    )
    expect(buildGormTags(field('x + 1'), false, false, [], [], 'postgresql')).toBe(
      '`gorm:"column:path;size:32;default:x + 1;not null" json:"path"`',
    )
  })

  it('escapes a mapped column name for the struct tag, so GORM reads the column and every setting after it', () => {
    const field = (dbName: string) =>
      ({
        name: 'label',
        dbName,
        kind: 'scalar' as const,
        type: 'String',
        isRequired: true,
        isId: false,
        isUnique: false,
        isList: false,
        isUpdatedAt: false,
        hasDefaultValue: false,
      }) as any
    // reflect.StructTag unquotes a `\"`, a `\\` and a `\n`, and the tag stays on one line. None of
    // them is a json key encoding/json takes, so the json name is the field's, as it would be.
    expect(buildGormTags(field('a\nb'), false, false, [], [], 'postgresql')).toBe(
      String.raw`${'`'}gorm:"column:a\nb;not null" json:"Label"${'`'}`,
    )
    expect(buildGormTags(field('a"b'), false, false, [], [], 'postgresql')).toBe(
      String.raw`${'`'}gorm:"column:a\"b;not null" json:"Label"${'`'}`,
    )
    expect(buildGormTags(field('a\\b'), false, false, [], [], 'postgresql')).toBe(
      String.raw`${'`'}gorm:"column:a\\b;not null" json:"Label"${'`'}`,
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
    expect(buildGormTags(field, true, false, [])).toBe(
      '`gorm:"column:id;primaryKey;autoIncrement;size:32" json:"id"`',
    )
  })

  it('gives a String with no native type VARCHAR(191) on MySQL, as Prisma Migrate does', () => {
    const string = (over: object) =>
      ({
        name: 'email',
        kind: 'scalar' as const,
        type: 'String',
        isRequired: false,
        isId: false,
        isUnique: true,
        isList: false,
        isUpdatedAt: false,
        hasDefaultValue: false,
        ...over,
      }) as any
    expect(buildGormTags(string({}), false, false, [], [], 'mysql')).toBe(
      '`gorm:"column:email;uniqueIndex;type:varchar(191)" json:"email"`',
    )
    // A cuid() or uuid() key is a String too, VARCHAR(191) as Prisma makes it on MySQL.
    const cuidKey = string({
      name: 'id',
      isId: true,
      isUnique: false,
      isRequired: true,
      default: { name: 'cuid', args: [] },
    })
    expect(buildGormTags(cuidKey, true, false, [], [], 'mysql')).toBe(
      '`gorm:"column:id;primaryKey;type:varchar(191)" json:"id"`',
    )
    const uuidKey = string({
      name: 'id',
      isId: true,
      isUnique: false,
      isRequired: true,
      default: { name: 'uuid', args: [] },
    })
    expect(buildGormTags(uuidKey, true, false, [], [], 'mysql')).toBe(
      '`gorm:"column:id;primaryKey;type:varchar(191)" json:"id"`',
    )
    expect(buildGormTags(uuidKey, true, false, [], [], 'postgresql')).toBe(
      '`gorm:"column:id;primaryKey" json:"id"`',
    )
    // A ulid() key with a native type takes the native type, as Prisma Migrate does.
    const ulidKey = string({
      name: 'id',
      isId: true,
      isUnique: false,
      isRequired: true,
      nativeType: ['VarChar', ['26']],
      default: { name: 'ulid', args: [] },
    })
    expect(buildGormTags(ulidKey, true, false, [], [], 'postgresql')).toBe(
      '`gorm:"column:id;primaryKey;type:varchar(26)" json:"id"`',
    )
    // A native type wins, and other databases keep GORM's own string type.
    expect(buildGormTags(string({ nativeType: ['Text', []] }), false, false, [], [], 'mysql')).toBe(
      '`gorm:"column:email;uniqueIndex;type:text" json:"email"`',
    )
    expect(buildGormTags(string({}), false, false, [], [], 'postgresql')).toBe(
      '`gorm:"column:email;uniqueIndex" json:"email"`',
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
    expect(buildGormTags(field, false, false, [])).toBe(
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
    expect(buildGormTags(field, false, false, [])).toBe(
      '`gorm:"column:updatedAt;autoUpdateTime:false;not null" json:"updatedAt"`',
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
    expect(buildGormTags(field, false, false, [])).toBe(
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
    expect(buildGormTags(field, false, false, [])).toBe('`gorm:"column:name" json:"name"`')
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
    ).toBe(
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
    expect(buildGormTags(field, false, false, ['index:idx_user_id'])).toBe(
      '`gorm:"column:userId;index:idx_user_id;not null" json:"userId"`',
    )
  })
})

describe('generateGormModels uuid defaults', () => {
  const makeUuidModel = (name: string, version: number): DMMF.Model => ({
    name,
    dbName: null,
    fields: [
      {
        name: 'id',
        kind: 'scalar',
        type: 'String',
        isRequired: true,
        isUnique: false,
        isId: true,
        isReadOnly: false,
        isGenerated: false,
        isUpdatedAt: false,
        isList: false,
        hasDefaultValue: true,
        default: { name: 'uuid', args: [version] },
      },
    ],
    uniqueFields: [],
    uniqueIndexes: [],
    primaryKey: null,
    isGenerated: false,
    schema: null,
  })

  it('generates BeforeCreate hooks for uuid() and uuid(7) defaults', () => {
    const models = [makeUuidModel('User', 4), makeUuidModel('Event', 7)]

    expect(generateGormModels(models)).toBe(`package model

import (
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type User struct {
	ID string \`gorm:"column:id;primaryKey;type:char(36)" json:"id"\`
}

func (User) TableName() string {
	return "User"
}

func (m *User) BeforeCreate(_ *gorm.DB) error {
	if m.ID == "" {
		m.ID = uuid.NewString()
	}
	return nil
}

type Event struct {
	ID string \`gorm:"column:id;primaryKey;type:char(36)" json:"id"\`
}

func (Event) TableName() string {
	return "Event"
}

func (m *Event) BeforeCreate(_ *gorm.DB) error {
	if m.ID == "" {
		m.ID = uuid.Must(uuid.NewV7()).String()
	}
	return nil
}
`)
  })
})

describe('generateGormModels ulid defaults', () => {
  it('generates a BeforeCreate hook with crypto/rand-fed ulid.MustNew for ulid() defaults', () => {
    const ticket: DMMF.Model = {
      name: 'Ticket',
      dbName: null,
      fields: [
        {
          name: 'id',
          kind: 'scalar',
          type: 'String',
          isRequired: true,
          isUnique: false,
          isId: true,
          isReadOnly: false,
          isGenerated: false,
          isUpdatedAt: false,
          isList: false,
          hasDefaultValue: true,
          default: { name: 'ulid', args: [] },
        },
      ],
      uniqueFields: [],
      uniqueIndexes: [],
      primaryKey: null,
      isGenerated: false,
      schema: null,
    }

    expect(generateGormModels([ticket])).toBe(`package model

import (
	"crypto/rand"

	"github.com/oklog/ulid/v2"
	"gorm.io/gorm"
)

type Ticket struct {
	ID string \`gorm:"column:id;primaryKey;type:char(26)" json:"id"\`
}

func (Ticket) TableName() string {
	return "Ticket"
}

func (m *Ticket) BeforeCreate(_ *gorm.DB) error {
	if m.ID == "" {
		m.ID = ulid.MustNew(ulid.Now(), rand.Reader).String()
	}
	return nil
}
`)
  })
})

/** Prisma type, the attribute as it is written, its DMMF nativeType and the tag GORM is given. */
const NATIVE_TYPES: readonly (readonly [
  string,
  string,
  readonly [string, readonly string[]],
  string,
])[] = [
  [
    'String',
    '@db.VarChar(255)',
    ['VarChar', ['255']],
    '`gorm:"column:value;type:varchar(255);not null" json:"value"`',
  ],
  ['String', '@db.VarChar', ['VarChar', []], '`gorm:"column:value;not null" json:"value"`'],
  [
    'String',
    '@db.Char(10)',
    ['Char', ['10']],
    '`gorm:"column:value;type:varchar(10);not null" json:"value"`',
  ],
  ['String', '@db.Char', ['Char', []], '`gorm:"column:value;not null" json:"value"`'],
  ['String', '@db.Text', ['Text', []], '`gorm:"column:value;type:text;not null" json:"value"`'],
  [
    'String',
    '@db.MediumText',
    ['MediumText', []],
    '`gorm:"column:value;type:text;not null" json:"value"`',
  ],
  [
    'String',
    '@db.LongText',
    ['LongText', []],
    '`gorm:"column:value;type:text;not null" json:"value"`',
  ],
  [
    'String',
    '@db.TinyText',
    ['TinyText', []],
    '`gorm:"column:value;type:text;not null" json:"value"`',
  ],
  [
    'Int',
    '@db.SmallInt',
    ['SmallInt', []],
    '`gorm:"column:value;type:smallint;not null" json:"value"`',
  ],
  [
    'Int',
    '@db.TinyInt',
    ['TinyInt', []],
    '`gorm:"column:value;type:smallint;not null" json:"value"`',
  ],
  [
    'Int',
    '@db.MediumInt',
    ['MediumInt', []],
    '`gorm:"column:value;type:mediumint;not null" json:"value"`',
  ],
  [
    'Float',
    '@db.DoublePrecision',
    ['DoublePrecision', []],
    '`gorm:"column:value;type:double precision;not null" json:"value"`',
  ],
  [
    'Float',
    '@db.Double',
    ['Double', []],
    '`gorm:"column:value;type:double precision;not null" json:"value"`',
  ],
  [
    'Float',
    '@db.Real',
    ['Real', []],
    '`gorm:"column:value;type:double precision;not null" json:"value"`',
  ],
  [
    'Decimal',
    '@db.Decimal(10, 2)',
    ['Decimal', ['10', '2']],
    '`gorm:"column:value;type:decimal(10,2);not null" json:"value"`',
  ],
  [
    'Decimal',
    '@db.Decimal(10)',
    ['Decimal', ['10']],
    '`gorm:"column:value;type:decimal;not null" json:"value"`',
  ],
  [
    'Decimal',
    '@db.Money(10, 2)',
    ['Money', ['10', '2']],
    '`gorm:"column:value;type:decimal(10,2);not null" json:"value"`',
  ],
  ['String', '@db.Uuid', ['Uuid', []], '`gorm:"column:value;type:char(36);not null" json:"value"`'],
  [
    'DateTime',
    '@db.Timestamp',
    ['Timestamp', []],
    '`gorm:"column:value;type:timestamp;not null" json:"value"`',
  ],
  [
    'DateTime',
    '@db.Timestamptz',
    ['Timestamptz', []],
    '`gorm:"column:value;type:timestamptz;not null" json:"value"`',
  ],
  ['DateTime', '@db.Date', ['Date', []], '`gorm:"column:value;type:date;not null" json:"value"`'],
  ['DateTime', '@db.Time', ['Time', []], '`gorm:"column:value;type:time;not null" json:"value"`'],
  [
    'DateTime',
    '@db.Timetz',
    ['Timetz', []],
    '`gorm:"column:value;type:timetz;not null" json:"value"`',
  ],
  ['Json', '@db.JsonB', ['JsonB', []], '`gorm:"column:value;type:jsonb;not null" json:"value"`'],
  ['String', '@db.Xml', ['Xml', []], '`gorm:"column:value;type:xml;not null" json:"value"`'],
  ['String', '@db.Nope', ['Nope', []], '`gorm:"column:value;not null" json:"value"`'],
]

// `@db.*` is the only way a schema pins a column type, and GORM reads it back out of the struct
// tag. Nothing else covers this table, so a dropped case would silently widen a column.
describe('buildGormTags native types', () => {
  it.each(NATIVE_TYPES)(
    'writes %s `%s` into the column type',
    (type, _attribute, nativeType, tag) => {
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
      expect(buildGormTags(field, false, false, [])).toBe(tag)
    },
  )
})

function gormFor(schema: string, provider = 'sqlite') {
  const source = `datasource db {\n  provider = "${provider}"\n}\n${schema}`
  const result = getDMMF({ datamodel: [['schema.prisma', source]] })
  if ('type' in result) throw new Error(result.error.message)
  return generateGormModels(
    result.datamodel.models,
    result.datamodel.enums,
    result.datamodel.indexes,
    'model',
    provider,
    relationMaps(prismaBlocks(source)),
    new Set(),
    prismaBlocks(source),
  )
}

// GORM's postgres driver makes a Go int a bigint, a float64 a decimal and a time a timestamptz;
// the tags give AutoMigrate the columns, defaults, keys and names Prisma Migrate makes.
describe('generateGormModels columns as Prisma Migrate makes them on PostgreSQL', () => {
  it("writes Prisma's types, the now() default, the unique and foreign key names and actions", () => {
    const code = gormFor(
      `
model User {
  id        String   @id @default(uuid())
  email     String?  @unique
  credits   Int      @default(3)
  ratio     Float
  amount    Decimal
  createdAt DateTime @default(now())
  tasks     Task[]
}

model Task {
  id     Int    @id @default(autoincrement())
  userId String
  user   User   @relation(fields: [userId], references: [id])
}
`,
      'postgresql',
    )
    expect(code).toContain(
      [
        '	ID        string   `gorm:"column:id;primaryKey" json:"id"`',
        '	Email     *string  `gorm:"column:email;uniqueIndex:User_email_key" json:"email"`',
        '	Credits   *int     `gorm:"column:credits;size:32;default:3;not null" json:"credits"`',
        '	Ratio     float64  `gorm:"column:ratio;type:double precision;not null" json:"ratio"`',
        '	Amount    float64  `gorm:"column:amount;type:decimal(65,30);not null" json:"amount"`',
        '	CreatedAt DateTime `gorm:"column:createdAt;type:timestamp(3);default:CURRENT_TIMESTAMP;autoCreateTime:false;not null" json:"createdAt"`',
        '	Tasks     []Task   `gorm:"foreignKey:UserID;constraint:Task_userId_fkey,OnUpdate:CASCADE,OnDelete:RESTRICT"`',
      ].join('\n'),
    )
    expect(code).toContain(
      '\tID     int    `gorm:"column:id;primaryKey;autoIncrement;size:32" json:"id"`',
    )
  })

  it('leaves a now() default to the hook elsewhere, and a name GORM cannot read to GORM', () => {
    const code = gormFor(
      `
model User {
  id        Int      @id
  createdAt DateTime @default(now())
  posts     Post[]
}

model Post {
  id       Int  @id
  authorId Int? @map("author id")
  author   User? @relation(fields: [authorId], references: [id], onDelete: Cascade)
}
`,
      'sqlite',
    )
    expect(code).toContain(
      '\tCreatedAt DateTime `gorm:"column:createdAt;autoCreateTime:false;not null" json:"createdAt"`',
    )
    expect(code).toContain(
      '`gorm:"foreignKey:AuthorID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE"`',
    )
  })

  it("keeps the names @relation(map:) and @@unique(map:) give, and CockroachDB's Int as it was", () => {
    const schema = `
model User {
  id    Int    @id
  a     Int
  b     Int
  posts Post[]

  @@unique([a, b], map: "user_pair")
}

model Post {
  id       Int  @id
  authorId Int
  author   User @relation(fields: [authorId], references: [id], map: "post_author")
}
`
    const code = gormFor(schema, 'cockroachdb')
    expect(code).toContain('constraint:post_author,OnUpdate:CASCADE,OnDelete:RESTRICT')
    expect(code).toContain('`gorm:"column:a;uniqueIndex:user_pair,priority:1;not null" json:"a"`')
    expect(code).not.toContain('size:32')
  })

  it("cuts names at 128 on SQL Server and leaves a name the tag cannot hold to Prisma's default", () => {
    const code = gormFor(
      `
model customer_order_line_items {
  id                        Int    @id
  warehouse_location_code   String
  supplier_reference_number String
  a                         Int
  b                         Int

  @@unique([warehouse_location_code, supplier_reference_number])
  @@unique([a, b], map: "pair,v2")
}
`,
      'sqlserver',
    )
    expect(code).toContain(
      'uniqueIndex:customer_order_line_items_warehouse_location_code_supplier_reference_number_key',
    )
    expect(code).toContain('uniqueIndex:customer_order_line_items_a_b_key')
    expect(code).not.toContain('pair,v2')
  })

  it('falls back to NO ACTION for a required relation on SQL Server, which has no RESTRICT', () => {
    const code = gormFor(
      `
model User {
  id    Int    @id
  posts Post[]
}

model Post {
  id       Int  @id
  authorId Int
  author   User @relation(fields: [authorId], references: [id])
}
`,
      'sqlserver',
    )
    expect(code).toContain(
      '`gorm:"foreignKey:AuthorID;constraint:Post_authorId_fkey,OnUpdate:CASCADE,OnDelete:NO ACTION"`',
    )
  })

  it('makes an Int @db.Int on SQL Server an INT, as a plain Int', () => {
    const code = gormFor('model A {\n  id Int @id @db.Int\n  n  Int\n}\n', 'sqlserver')
    expect(code).toContain('`gorm:"column:id;primaryKey;size:32" json:"id"`')
    expect(code).toContain('`gorm:"column:n;size:32;not null" json:"n"`')
  })

  it('gives a CockroachDB native type the column Prisma Migrate makes', () => {
    const code = gormFor(
      `
model A {
  id String @id @db.Uuid
  ch String @db.Char(2)
  ip String @db.Inet
  b  String @db.Bit(3)
  vb String @db.VarBit(4)
}
`,
      'cockroachdb',
    )
    expect(code).toContain('`gorm:"column:id;primaryKey;type:uuid" json:"id"`')
    expect(code).toContain('`gorm:"column:ch;type:char(2);not null" json:"ch"`')
    expect(code).toContain('`gorm:"column:ip;type:inet;not null" json:"ip"`')
    expect(code).toContain('`gorm:"column:b;type:bit(3);not null" json:"b"`')
    expect(code).toContain('`gorm:"column:vb;type:varbit(4);not null" json:"vb"`')
  })
})

/** The models of a PostgreSQL schema holding one model of the given name, with a String[]. */
function listModels(name: string) {
  const result = getDMMF({
    datamodel: [
      [
        'schema.prisma',
        `datasource db {\n  provider = "postgresql"\n}\nmodel ${name} {\n  id Int @id\n  tags String[]\n}\n`,
      ],
    ],
  })
  if ('type' in result) throw new Error(result.error.message)
  return result.datamodel.models
}

// The column `prisma migrate diff --from-empty` makes of each type is in the comment beside it.
describe('generateGormModels native types as Prisma Migrate makes them on MySQL and PostgreSQL', () => {
  it('gives a MySQL column the type Prisma makes, where GORM would make another', () => {
    const code = gormFor(
      `
model Item {
  id    Int     @id @default(autoincrement()) @db.UnsignedInt
  price Decimal
  mt    String  @db.MediumText
  lt    String  @db.LongText
  tt    String  @db.TinyText
  ch    String  @db.Char(2)
  ti    Int     @db.TinyInt
  flag  Boolean @db.TinyInt
  ui    Int     @db.UnsignedInt
  us    Int     @db.UnsignedSmallInt
  ut    Int     @db.UnsignedTinyInt
  um    Int     @db.UnsignedMediumInt
  yr    Int     @db.Year
  ub    BigInt  @db.UnsignedBigInt
  fl    Float   @db.Float
  ii    Int     @db.Int
  vb    Bytes   @db.VarBinary(16)
  bi    Bytes   @db.Binary(16)
  bl    Bytes   @db.Blob
  tb    Bytes   @db.TinyBlob
  mb    Bytes   @db.MediumBlob
  lb    Bytes   @db.LongBlob
}
`,
      'mysql',
    )
    expect(code).toContain(
      [
        // INTEGER UNSIGNED NOT NULL AUTO_INCREMENT
        '\tID    int     `gorm:"column:id;primaryKey;autoIncrement;type:int unsigned" json:"id"`',
        // DECIMAL(65, 30)
        '\tPrice float64 `gorm:"column:price;type:decimal(65,30);not null" json:"price"`',
        '\tMt    string  `gorm:"column:mt;type:mediumtext;not null" json:"mt"`',
        '\tLt    string  `gorm:"column:lt;type:longtext;not null" json:"lt"`',
        '\tTt    string  `gorm:"column:tt;type:tinytext;not null" json:"tt"`',
        '\tCh    string  `gorm:"column:ch;type:char(2);not null" json:"ch"`',
        '\tTi    int     `gorm:"column:ti;type:tinyint;not null" json:"ti"`',
        // BOOLEAN, which GORM makes of a bool
        '\tFlag  bool    `gorm:"column:flag;not null" json:"flag"`',
        '\tUI    int     `gorm:"column:ui;type:int unsigned;not null" json:"ui"`',
        '\tUs    int     `gorm:"column:us;type:smallint unsigned;not null" json:"us"`',
        '\tUt    int     `gorm:"column:ut;type:tinyint unsigned;not null" json:"ut"`',
        '\tUm    int     `gorm:"column:um;type:mediumint unsigned;not null" json:"um"`',
        '\tYr    int     `gorm:"column:yr;type:year;not null" json:"yr"`',
        '\tUb    int64   `gorm:"column:ub;type:bigint unsigned;not null" json:"ub"`',
        // FLOAT: GORM makes a float64 of size 32 a float
        '\tFl    float64 `gorm:"column:fl;size:32;not null" json:"fl"`',
        // INTEGER
        '\tIi    int     `gorm:"column:ii;size:32;not null" json:"ii"`',
        '\tVb    []byte  `gorm:"column:vb;type:varbinary(16);not null" json:"vb"`',
        '\tBi    []byte  `gorm:"column:bi;type:binary(16);not null" json:"bi"`',
        '\tBl    []byte  `gorm:"column:bl;type:blob;not null" json:"bl"`',
        '\tTb    []byte  `gorm:"column:tb;type:tinyblob;not null" json:"tb"`',
        '\tMb    []byte  `gorm:"column:mb;type:mediumblob;not null" json:"mb"`',
        // LONGBLOB, GORM's own
        '\tLb    []byte  `gorm:"column:lb;not null" json:"lb"`',
      ].join('\n'),
    )
  })

  it('gives a PostgreSQL column the type Prisma makes, a uuid key and its foreign key alike', () => {
    const code = gormFor(
      `
model Item {
  id    String  @id @default(uuid()) @db.Uuid
  vc    String  @unique @db.VarChar
  ch    String  @db.Char(2)
  inet  String  @db.Inet
  bit   String  @db.Bit(3)
  bits  String  @db.VarBit
  re    Float   @db.Real
  oid   Int     @db.Oid
  ii    Int     @db.Integer
  parts Part[]
}

model Part {
  id     Int    @id @default(autoincrement()) @db.Integer
  itemId String @db.Uuid
  item   Item   @relation(fields: [itemId], references: [id])
}
`,
      'postgresql',
    )
    expect(code).toContain(
      [
        '\tID    string  `gorm:"column:id;primaryKey;type:uuid" json:"id"`',
        // VARCHAR
        '\tVc    string  `gorm:"column:vc;uniqueIndex:Item_vc_key;type:varchar;not null" json:"vc"`',
        '\tCh    string  `gorm:"column:ch;type:char(2);not null" json:"ch"`',
        '\tInet  string  `gorm:"column:inet;type:inet;not null" json:"inet"`',
        '\tBit   string  `gorm:"column:bit;type:bit(3);not null" json:"bit"`',
        '\tBits  string  `gorm:"column:bits;type:varbit;not null" json:"bits"`',
        '\tRe    float64 `gorm:"column:re;type:real;not null" json:"re"`',
        '\tOid   int     `gorm:"column:oid;type:oid;not null" json:"oid"`',
        // INTEGER
        '\tIi    int     `gorm:"column:ii;size:32;not null" json:"ii"`',
      ].join('\n'),
    )
    expect(code).toContain(
      [
        '\tID     int    `gorm:"column:id;primaryKey;autoIncrement;size:32" json:"id"`',
        '\tItemID string `gorm:"column:itemId;type:uuid;not null" json:"itemId"`',
      ].join('\n'),
    )
    // The key's uuid() is still made in BeforeCreate.
    expect(code).toContain('uuid.NewString()')
  })
})

// Prisma makes every scalar list a PostgreSQL array column, which takes no JSON text: each list is
// a ScalarList written and read in the array's text form.
describe('generateGormModels scalar lists on PostgreSQL', () => {
  const schema = `
enum Role {
  ADMIN
  VIEWER
}

model Team {
  id     String   @id
  names  String[]
  counts Int[]
  bigs   BigInt[]
  ratios Float[]
  prices Decimal[]
  flags  Boolean[]
  roles  Role[]
  codes  String[] @db.VarChar(10)
  blobs  Json[]
}
`

  it('holds each list in a ScalarList of its element, typed as the array column Prisma makes', () => {
    const code = gormFor(schema, 'postgresql')
    expect(code).toContain(
      [
        '\tNames  ScalarList[string]  `gorm:"column:names;type:text[]" json:"names"`',
        '\tCounts ScalarList[int]     `gorm:"column:counts;type:integer[]" json:"counts"`',
        '\tBigs   ScalarList[int64]   `gorm:"column:bigs;type:bigint[]" json:"bigs"`',
        '\tRatios ScalarList[float64] `gorm:"column:ratios;type:double precision[]" json:"ratios"`',
        '\tPrices ScalarList[float64] `gorm:"column:prices;type:decimal(65,30)[]" json:"prices"`',
        '\tFlags  ScalarList[bool]    `gorm:"column:flags;type:boolean[]" json:"flags"`',
        '\tRoles  ScalarList[string]  `gorm:"column:roles;type:text[]" json:"roles"`',
        '\tCodes  ScalarList[string]  `gorm:"column:codes;type:varchar(10)[]" json:"codes"`',
      ].join('\n'),
    )
    // A Json[] has no ScalarList element and keeps the json serializer.
    expect(code).toContain('`gorm:"column:blobs;serializer:json" json:"blobs"`')
    expect(code).toContain('type ScalarList[T string | int | int64 | float64 | bool] []T')
    expect(code).toContain('func arrayItems(text string) ([]string, error) {')
    expect(code).toMatch(/^\t"strings"$/mu)
  })

  it('names a model whose Go name is the list type, where the schema has a list', () => {
    expect(gormProblems(listModels('ScalarList'), 'postgresql')).toStrictEqual([
      'model ScalarList: its Go name is ScalarList, what the models hold a scalar list in; rename the model and keep its table with @@map',
    ])
    expect(gormProblems(listModels('Tag'), 'postgresql')).toStrictEqual([])
  })

  it('names a column whose mapped name ends in a backslash, which GORM joins to the next setting', () => {
    const models = datamodelOf(
      getDMMF({
        datamodel: `datasource db {
  provider = "postgresql"
}

model Note {
  id    Int    @id
  label String @map("label\\\\")
  body  String @map("a\\\\b")
  title String @map("a;index")
}
`,
      }),
    ).models
    expect(gormProblems(models, 'postgresql')).toStrictEqual([
      "model Note: the column of label ends in \\, which GORM's tag cannot hold; change its @map",
      'model Note: the column of title holds a ";", at which GORM splits the tag; change its @map',
    ])
  })

  it('names an index whose name in the tag holds a "," or ";"', () => {
    const datamodel = datamodelOf(
      getDMMF({
        datamodel: `datasource db {
  provider = "postgresql"
}

model Note {
  id    Int    @id
  pair  String @unique @map("a,b")
  named String @unique(map: "note_named_key") @map("c,d")
}

model Tag {
  id    Int    @id
  label String
  slug  String

  @@index([label])
  @@index([slug], map: "tag_slug_idx")
  @@map("tag;s")
}
`,
      }),
    )
    expect(gormProblems(datamodel.models, 'postgresql', datamodel.indexes)).toStrictEqual([
      'model Note: the index on pair is named "Note_a,b_key", which GORM cannot write (a ","); change the @map of its column or table, or give it a name with map:',
      'model Tag: the index on label is named "tag;s_label_idx", which GORM cannot write (a ";"); change the @map of its column or table, or give it a name with map:',
    ])
  })

  it('passes over an index left out with a note, and names a map: name the tag cannot hold', () => {
    const source = `datasource db {
  provider = "postgresql"
}

generator client {
  provider        = "prisma-client"
  output          = "./generated"
  previewFeatures = ["partialIndexes"]
}

model Item {
  id   Int    @id
  slug String
  code String @map("c,d")

  @@index([slug], where: raw("slug <> 'a;b'"))
  @@index([code], map: "item,code")
  @@map("item,s")
}
`
    const datamodel = datamodelOf(getDMMF({ datamodel: source }))
    expect(
      gormProblems(
        datamodel.models,
        'postgresql',
        datamodel.indexes,
        partialIndexWhere(prismaBlocks(source), 'postgresql'),
      ),
    ).toStrictEqual([
      'model Item: the index on code is named "item,code", which GORM cannot write (a ","); change it',
    ])
  })

  it('names a map: name the tag cannot hold even where the name Prisma would give fits, and two fields written under one json name', () => {
    const datamodel = datamodelOf(
      getDMMF({
        datamodel: `datasource db {
  provider = "postgresql"
}

model Item {
  id    Int    @id
  code  String @unique(map: "a,b")
  slug  String
  label String @map("x,y")
  other String @map("Label")

  @@index([slug], map: "slug;idx")
}
`,
      }),
    )
    expect(gormProblems(datamodel.models, 'postgresql', datamodel.indexes)).toStrictEqual([
      'model Item: the index on code is named "a,b", which GORM cannot write (a ","); change it',
      'model Item: the index on slug is named "slug;idx", which GORM cannot write (a ";"); change it',
      'model Item: label and other are both written json:"Label", and encoding/json drops one or both; change the @map of one',
    ])
  })

  it('names an index name the dialector would quote as another: a ".", a quote at its start, two quotes in a row', () => {
    const datamodel = datamodelOf(
      getDMMF({
        datamodel: `datasource db {
  provider = "postgresql"
}

model Item {
  id    Int    @id
  code  String @unique(map: "\\"code_key")
  slug  String
  tag   String
  mark  String @unique(map: "item\`mark")
  note  String @unique(map: "item\\"note")
  label String

  @@index([slug], map: "item.slug_idx")
  @@index([tag], map: "item\\"\\"tag")
}

model Box {
  id   Int    @id
  code String @unique

  @@map("\\"boxes")
}
`,
      }),
    )
    expect(gormProblems(datamodel.models, 'postgresql', datamodel.indexes)).toStrictEqual([
      'model Item: the index on code is named "\\"code_key", which GORM cannot write (a quote at its start); change it',
      'model Item: the index on slug is named "item.slug_idx", which GORM cannot write (a "."); change it',
      'model Item: the index on tag is named "item\\"\\"tag", which GORM cannot write (two quotes in a row); change it',
      'model Box: its table is named "\\"boxes", which GORM cannot write (a quote at its start); change its @@map',
      'model Box: the index on code is named "\\"boxes_code_key", which GORM cannot write (a quote at its start); change the @map of its column or table, or give it a name with map:',
    ])
  })

  it('escapes a " or \\ of the table name in TableName()', () => {
    const code = gormFor(
      `
model Crate {
  id Int @id

  @@map("cr\\"a\\\\te")
}
`,
      'postgresql',
    )
    expect(code).toContain('\treturn "cr\\"a\\\\te"\n')
  })

  it('names the join table of an implicit many-to-many relation the dialector would quote as another', () => {
    const datamodel = datamodelOf(
      getDMMF({
        datamodel: `datasource db {
  provider = "postgresql"
}

model Post {
  id     Int    @id
  tags   Tag[]  @relation("post.tags")
  labels Tag[]  @relation("labels\\\\")
  notes  Tag[]  @relation("no\\"\\"tes")
  marks  Tag[]  @relation("ma;r\\"ks")
}

model Tag {
  id     Int    @id
  posts  Post[] @relation("post.tags")
  labels Post[] @relation("labels\\\\")
  notes  Post[] @relation("no\\"\\"tes")
  marks  Post[] @relation("ma;r\\"ks")
}
`,
      }),
    )
    expect(gormProblems(datamodel.models, 'postgresql', datamodel.indexes)).toStrictEqual([
      'model Post: the join table of tags is named "_post.tags", which GORM cannot write (a "."); change the name of its @relation',
      'model Post: the join table of labels is named "_labels\\\\", which GORM cannot write (a \\ at its end); change the name of its @relation',
      'model Post: the join table of notes is named "_no\\"\\"tes", which GORM cannot write (two quotes in a row); change the name of its @relation',
    ])
  })

  it('names a column or table name the dialector would quote as another', () => {
    const problemsOf = (provider: string, body: string) => {
      const datamodel = datamodelOf(
        getDMMF({ datamodel: `datasource db {\n  provider = "${provider}"\n}\n${body}` }),
      )
      return gormProblems(datamodel.models, provider, datamodel.indexes)
    }
    expect(
      problemsOf(
        'postgresql',
        `
model Item {
  id    Int    @id
  dot   String @map("a.b")
  lead  String @map("\\"lead")
  twice String @map("a\\"\\"b")
  tick  String @map("\`tick")
  mid   String @map("a\\"b")
  comma String @map("a,b")
}

model Box {
  id Int @id

  @@map("box.es")
}

model Crate {
  id Int @id

  @@map("cr\\"ate")
}
`,
      ),
    ).toStrictEqual([
      'model Item: the column of dot is named "a.b", which GORM cannot write (a "."); change its @map',
      'model Item: the column of lead is named "\\"lead", which GORM cannot write (a quote at its start); change its @map',
      'model Item: the column of twice is named "a\\"\\"b", which GORM cannot write (two quotes in a row); change its @map',
      'model Box: its table is named "box.es", which GORM cannot write (a "."); change its @@map',
    ])
    expect(
      problemsOf(
        'mysql',
        `
model Item {
  id   Int    @id
  tick String @map("\`tick")
  lead String @map("\\"lead")

  @@map("it\`\`ems")
}
`,
      ),
    ).toStrictEqual([
      'model Item: its table is named "it``ems", which GORM cannot write (two quotes in a row); change its @@map',
      'model Item: the column of tick is named "`tick", which GORM cannot write (a quote at its start); change its @map',
    ])
    expect(
      problemsOf(
        'sqlserver',
        `
model Item {
  id  Int    @id
  mid String @map("a\\"b")
  tick String @map("a\`b")
}
`,
      ),
    ).toStrictEqual([
      'model Item: the column of mid is named "a\\"b", which GORM cannot write (a double quote); change its @map',
    ])
  })

  it("checks the quote of the provider's dialector only: a backtick on MySQL, a double quote elsewhere", () => {
    const datamodel = datamodelOf(
      getDMMF({
        datamodel: `datasource db {
  provider = "mysql"
}

model Item {
  id   Int    @id
  code String @unique(map: "\`code_key")
  slug String @unique(map: "\\"slug_key")
}
`,
      }),
    )
    expect(gormProblems(datamodel.models, 'mysql', datamodel.indexes)).toStrictEqual([
      'model Item: the index on code is named "`code_key", which GORM cannot write (a quote at its start); change it',
    ])
  })

  it('names a double quote anywhere in an index name on SQL Server, whose QuoteTo does not escape it', () => {
    const datamodel = datamodelOf(
      getDMMF({
        datamodel: `datasource db {
  provider = "sqlserver"
}

model Item {
  id   Int    @id
  note String @unique(map: "item\\"note")
  slug String @unique(map: "item\`slug")
}
`,
      }),
    )
    expect(gormProblems(datamodel.models, 'sqlserver', datamodel.indexes)).toStrictEqual([
      'model Item: the index on note is named "item\\"note", which GORM cannot write (a double quote); change it',
    ])
  })

  it('names a relation whose Go name a column takes as its json name', () => {
    const datamodel = datamodelOf(
      getDMMF({
        datamodel: `datasource db {
  provider = "postgresql"
}

model User {
  id    Int    @id
  posts Post[]
}

model Post {
  id         Int    @id
  authorId   Int
  authorName String @map("Author")
  author     User   @relation(fields: [authorId], references: [id])
}
`,
      }),
    )
    expect(gormProblems(datamodel.models, 'postgresql', datamodel.indexes)).toStrictEqual([
      'model Post: authorName and author are both written json:"Author", and encoding/json drops one or both; change the @map of one',
    ])
  })

  it('compares json names as encoding/json takes them: the field name for a column it cannot take, the Go name the struct gives', () => {
    const datamodel = datamodelOf(
      getDMMF({
        datamodel: `datasource db {
  provider = "postgresql"
}

model Item {
  id    Int    @id
  label String @map("it's")
  other String @map("Label")
  a_b   String @map("x,1")
  aB    String @map("x,2")
}
`,
      }),
    )
    expect(gormProblems(datamodel.models, 'postgresql', datamodel.indexes)).toStrictEqual([
      'model Item: label and other are both written json:"Label", and encoding/json drops one or both; change the @map of one',
    ])
  })

  it('escapes an index name made from a mapped column for the struct tag', () => {
    const code = gormFor(
      `model Note {
  id    Int    @id
  quote String @unique @map("a\\"b")
  path  String @map("a\\\\c")

  @@index([path])
}
`,
      'postgresql',
    )
    expect(code).toContain(
      String.raw`${'`'}gorm:"column:a\"b;uniqueIndex:Note_a\"b_key;not null" json:"Quote"${'`'}`,
    )
    expect(code).toContain(
      String.raw`${'`'}gorm:"column:a\\c;index:Note_a\\c_idx;not null" json:"Path"${'`'}`,
    )
  })

  it('leaves a mapped index name ending in a backslash for Prisma default, as GORM joins it to the next setting', () => {
    const code = gormFor(
      `model Note {
  id    Int    @id
  code  String @unique(map: "code\\\\")
  title String

  @@index([title], map: "title\\\\")
}
`,
      'postgresql',
    )
    expect(code).toContain('`gorm:"column:code;uniqueIndex:Note_code_key;not null" json:"code"`')
    expect(code).toContain('`gorm:"column:title;index:Note_title_idx;not null" json:"title"`')
  })

  it('types a native list as Prisma names it, and an Int list on CockroachDB as INT4', () => {
    const native = gormFor(
      `
model Box {
  id    Int      @id
  ids   String[] @db.Uuid
  ratio Float[]  @db.Real
  tags  String[] @db.Char(2)
  wide  Float[]  @db.DoublePrecision
}
`,
      'postgresql',
    )
    expect(native).toContain('`gorm:"column:ids;type:uuid[]" json:"ids"`')
    expect(native).toContain('`gorm:"column:ratio;type:real[]" json:"ratio"`')
    expect(native).toContain('`gorm:"column:tags;type:char(2)[]" json:"tags"`')
    expect(native).toContain('`gorm:"column:wide;type:double precision[]" json:"wide"`')
    const cockroach = gormFor(
      'model A {\n  id Int @id\n  n  Int[]\n  c  String[] @db.CatalogSingleChar\n}\n',
      'cockroachdb',
    )
    expect(cockroach).toContain('`gorm:"column:n;type:int4[]" json:"n"`')
    expect(cockroach).toContain('`gorm:"column:c;type:\\"char\\"[]" json:"c"`')
    // PostgreSQL prints money with a currency symbol, which a float list cannot read.
    expect(
      gormFor('model M {\n  id Int @id\n  m  Decimal[] @db.Money\n}\n', 'postgresql'),
    ).toContain('`gorm:"column:m;type:decimal;serializer:json" json:"m"`')
  })

  it('refuses a NULL element and a token that is not a boolean, as no Prisma list holds one', () => {
    const code = gormFor(schema, 'postgresql')
    expect(code).toContain('return fmt.Errorf("an array column held a NULL element: %q", text)')
    expect(code).toContain('parseErr = fmt.Errorf("%q is not a boolean", item)')
    expect(code).toContain('\tif strings.HasPrefix(text, "[") {')
  })

  it('writes no ScalarList for a schema without lists', () => {
    expect(gormFor('model A {\n  id Int @id\n}\n', 'postgresql')).not.toContain('ScalarList')
  })
})

// GORM guesses a struct field's relation as has-one first, and takes it when the referenced model
// has a field the key resolves to; `belongsTo` makes each belongs-to one whatever the names.
describe('generateGormModels belongs-to that GORM would take for has-one', () => {
  it('marks every belongs-to, as the Website and BackgroundJobTask relations of umami and documenso need', () => {
    const code = gormFor(
      `
model User {
  id        String    @id @map("user_id")
  websites  Website[] @relation("user")
  createdBy Website[] @relation("createUser")
}

model Website {
  id         String  @id @map("website_id")
  userId     String? @map("user_id")
  createdBy  String? @map("created_by")
  user       User?   @relation("user", fields: [userId], references: [id])
  createUser User?   @relation("createUser", fields: [createdBy], references: [id])
}

model BackgroundJob {
  id    String              @id
  jobId String
  tasks BackgroundJobTask[]
}

model BackgroundJobTask {
  id            String        @id
  jobId         String
  backgroundJob BackgroundJob @relation(fields: [jobId], references: [id])
}
`,
      'postgresql',
    )
    expect(code).toContain('\tUser       *User   `gorm:"foreignKey:UserID;belongsTo"`')
    expect(code).toContain('\tCreateUser *User   `gorm:"foreignKey:CreatedBy;belongsTo"`')
    expect(code).toContain('\tBackgroundJob *BackgroundJob `gorm:"foreignKey:JobID;belongsTo"`')
    // A has-many is a slice, which GORM never takes for a belongs-to.
    expect(code).not.toMatch(/\[\][A-Za-z]+ +`gorm:"[^"]*belongsTo/u)
  })
})

// What these write was checked against GORM 1.31 on the tables `prisma db push` makes, in
// examples/gorm; each was a runtime error or a wrong row before.
describe('generateGormModels against the tables Prisma makes', () => {
  it('lays the struct out and groups the imports as gofmt does', () => {
    expect(
      gormFor(`
model Post {
  id        Int       @id @default(autoincrement())
  userId    String?
  user      User?     @relation(fields: [userId], references: [id])
  createdAt DateTime  @default(now())
  comments  Comment[]
}

model User {
  id    String @id @default(uuid())
  posts Post[]
}

model Comment {
  id     Int  @id
  postId Int
  post   Post @relation(fields: [postId], references: [id])
}
`),
    ).toBe(`package model

import (
	"database/sql/driver"
	"fmt"
	"strconv"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Post struct {
	ID        int       \`gorm:"column:id;primaryKey;autoIncrement;size:32" json:"id"\`
	UserID    *string   \`gorm:"column:userId" json:"userId"\`
	CreatedAt DateTime  \`gorm:"column:createdAt;autoCreateTime:false;not null" json:"createdAt"\`
	User      *User     \`gorm:"belongsTo"\`
	Comments  []Comment \`gorm:"foreignKey:PostID;constraint:Comment_postId_fkey,OnUpdate:CASCADE,OnDelete:RESTRICT"\`
}

func (Post) TableName() string {
	return "Post"
}

func (m *Post) BeforeCreate(tx *gorm.DB) error {
	now := tx.NowFunc().UTC().Truncate(time.Millisecond)
	if m.CreatedAt.IsZero() {
		m.CreatedAt = DateTime{Time: now}
	}
	return nil
}

type User struct {
	ID    string \`gorm:"column:id;primaryKey;type:char(36);not null" json:"id"\`
	Posts []Post \`gorm:"foreignKey:UserID;constraint:Post_userId_fkey,OnUpdate:CASCADE,OnDelete:SET NULL"\`
}

func (User) TableName() string {
	return "User"
}

func (m *User) BeforeCreate(_ *gorm.DB) error {
	if m.ID == "" {
		m.ID = uuid.NewString()
	}
	return nil
}

type Comment struct {
	ID     int   \`gorm:"column:id;primaryKey;size:32;not null" json:"id"\`
	PostID int   \`gorm:"column:postId;size:32;not null" json:"postId"\`
	Post   *Post \`gorm:"belongsTo"\`
}

func (Comment) TableName() string {
	return "Comment"
}

type DateTime struct{ time.Time }

func (DateTime) GormDataType() string {
	return "time"
}

func (dateTime DateTime) Value() (driver.Value, error) {
	return dateTime.UTC().Truncate(time.Millisecond).Format("2006-01-02T15:04:05.000-07:00"), nil
}

func (dateTime *DateTime) Scan(src any) error {
	read, err := readPrismaTime(src)
	dateTime.Time = read
	return err
}

var prismaTimeLayouts = []string{
	"2006-01-02T15:04:05.999999999Z07:00",
	"2006-01-02 15:04:05.999999999Z07:00",
	"2006-01-02 15:04:05.999999999Z07",
	"2006-01-02T15:04:05.999999999",
	"2006-01-02 15:04:05.999999999",
	"2006-01-02",
}

func readPrismaTime(src any) (time.Time, error) {
	switch value := src.(type) {
	case nil:
		return time.Time{}, nil
	case time.Time:
		return value.UTC().Truncate(time.Millisecond), nil
	case int64:
		return time.UnixMilli(value).UTC(), nil
	case []byte:
		return readPrismaTime(string(value))
	case string:
		if millis, err := strconv.ParseInt(value, 10, 64); err == nil {
			return time.UnixMilli(millis).UTC(), nil
		}
		for _, layout := range prismaTimeLayouts {
			if read, err := time.Parse(layout, value); err == nil {
				return read.UTC().Truncate(time.Millisecond), nil
			}
		}
		return time.Time{}, fmt.Errorf("a DateTime column held %q", value)
	}
	return time.Time{}, fmt.Errorf("a DateTime column held %T", src)
}
`)
  })

  // GORM guesses `User` + `ID`; without the tag, parsing Profile fails with "define a valid
  // foreign key for relations".
  it('names a belongs-to key GORM would not guess from the field', () => {
    expect(
      gormFor(`
model User {
  id      Int      @id @default(autoincrement())
  profile Profile?
}

model Profile {
  id      Int  @id @default(autoincrement())
  ownerId Int  @unique
  user    User @relation(fields: [ownerId], references: [id])
}
`),
    ).toBe(`package model

type User struct {
	ID      int      \`gorm:"column:id;primaryKey;autoIncrement;size:32" json:"id"\`
	Profile *Profile \`gorm:"foreignKey:OwnerID;constraint:Profile_ownerId_fkey,OnUpdate:CASCADE,OnDelete:RESTRICT"\`
}

func (User) TableName() string {
	return "User"
}

type Profile struct {
	ID      int   \`gorm:"column:id;primaryKey;autoIncrement;size:32" json:"id"\`
	OwnerID int   \`gorm:"column:ownerId;uniqueIndex:Profile_ownerId_key;size:32;not null" json:"ownerId"\`
	User    *User \`gorm:"foreignKey:OwnerID;belongsTo"\`
}

func (Profile) TableName() string {
	return "Profile"
}
`)
  })

  it('escapes a ";" or a double quote of a relation name in the many2many tag', () => {
    const code = gormFor(`
model Post {
  id   Int   @id
  tags Tag[] @relation("a;b\\"c")
}

model Tag {
  id    Int    @id
  posts Post[] @relation("a;b\\"c")
}
`)
    expect(code).toContain('`gorm:"many2many:_a\\\\;b\\"c;joinForeignKey:A;joinReferences:B"`')
  })

  // Under GORM's default naming the table would be `_post_to_tags` and its columns `post_id` and
  // `tag_id`: "no such table".
  it("goes through Prisma's join table, its columns A and B, under a naming strategy that keeps them", () => {
    expect(
      gormFor(`
model Post {
  id   Int   @id @default(autoincrement())
  tags Tag[]
}

model Tag {
  id    String @id
  posts Post[]
}
`),
    ).toBe(`package model

import "gorm.io/gorm/schema"

var NamingStrategy = schema.NamingStrategy{SingularTable: true, NoLowerCase: true}

type Post struct {
	ID   int   \`gorm:"column:id;primaryKey;autoIncrement;size:32" json:"id"\`
	Tags []Tag \`gorm:"many2many:_PostToTag;joinForeignKey:A;joinReferences:B"\`
}

func (Post) TableName() string {
	return "Post"
}

type Tag struct {
	ID    string \`gorm:"column:id;primaryKey;not null" json:"id"\`
	Posts []Post \`gorm:"many2many:_PostToTag;joinForeignKey:B;joinReferences:A"\`
}

func (Tag) TableName() string {
	return "Tag"
}
`)
  })

  // GORM lets a column's default in for a zero value: \`false\` under \`@default(true)\` was stored as
  // true. It parses an integer default with strconv, which the quoted BigInt failed, and writes a
  // string default into the row after trimming its quotes, where the doubled \`'\` stayed doubled.
  it('makes a field with a non-zero default a pointer, and writes each default as GORM reads it', () => {
    expect(
      gormFor(`
model Setting {
  id     Int     @id @default(autoincrement())
  active Boolean @default(true)
  hidden Boolean @default(false)
  slug   String  @default("untitled")
  note   String  @default("")
  limit  Int     @default(10)
  offset Int     @default(0)
  ratio  Float   @default(0.5)
  price  Decimal @default(9.99)
  big    BigInt  @default(9007199254740993)
  quoted String  @default("it's \\"quoted\\" \\\\ here; really")
  call   String  @default("f('x')")
  data   Json    @default("{\\"a\\":\\"it's\\"}")
}
`),
    ).toBe(`package model

import "gorm.io/datatypes"

type Setting struct {
	ID     int            \`gorm:"column:id;primaryKey;autoIncrement;size:32" json:"id"\`
	Active *bool          \`gorm:"column:active;default:true;not null" json:"active"\`
	Hidden bool           \`gorm:"column:hidden;default:false;not null" json:"hidden"\`
	Slug   *string        \`gorm:"column:slug;default:'untitled';not null" json:"slug"\`
	Note   string         \`gorm:"column:note;default:'';not null" json:"note"\`
	Limit  *int           \`gorm:"column:limit;size:32;default:10;not null" json:"limit"\`
	Offset int            \`gorm:"column:offset;size:32;default:0;not null" json:"offset"\`
	Ratio  *float64       \`gorm:"column:ratio;default:0.5;not null" json:"ratio"\`
	Price  *float64       \`gorm:"column:price;default:9.99;not null" json:"price"\`
	Big    *int64         \`gorm:"column:big;default:9007199254740993;not null" json:"big"\`
	Quoted *string        \`gorm:"column:quoted;default:'it's \\"quoted\\" \\\\ here\\\\; really';not null" json:"quoted"\`
	Call   *string        \`gorm:"column:call;default:'f(''x'')';not null" json:"call"\`
	Data   datatypes.JSON \`gorm:"column:data;default:'{\\"a\\":\\"it''s\\"}';not null" json:"data"\`
}

func (Setting) TableName() string {
	return "Setting"
}
`)
  })

  // Prisma makes these in its client: without a hook the first row's key was "" and the second
  // row a conflict.
  it('makes cuid(), cuid(2) and nanoid() values in BeforeCreate', () => {
    expect(
      gormFor(`
model Key {
  id    String  @id @default(cuid())
  v2    String  @unique @default(cuid(2))
  short String? @default(nanoid(8))
  long  String  @default(nanoid())
}
`),
    ).toBe(`package model

import (
	"github.com/lucsky/cuid"
	gonanoid "github.com/matoous/go-nanoid/v2"
	"github.com/nrednav/cuid2"
	"gorm.io/gorm"
)

type Key struct {
	ID    string  \`gorm:"column:id;primaryKey;not null" json:"id"\`
	V2    string  \`gorm:"column:v2;uniqueIndex:Key_v2_key;not null" json:"v2"\`
	Short *string \`gorm:"column:short" json:"short"\`
	Long  string  \`gorm:"column:long;not null" json:"long"\`
}

func (Key) TableName() string {
	return "Key"
}

func (m *Key) BeforeCreate(_ *gorm.DB) error {
	if m.ID == "" {
		m.ID = cuid.New()
	}
	if m.V2 == "" {
		m.V2 = cuid2.Generate()
	}
	if m.Short == nil {
		generated := gonanoid.Must(8)
		m.Short = &generated
	}
	if m.Long == "" {
		m.Long = gonanoid.Must()
	}
	return nil
}
`)
  })
})

// Each was checked against Prisma Client on the same tables (sqlite, postgresql, mysql; TZ=UTC
// and Asia/Tokyo): a row either side writes reads back on the other as the same instant.
describe('generateGormModels DateTime as Prisma Client keeps it', () => {
  it('holds a DateTime[] on PostgreSQL in an array of the element type, not JSON', () => {
    const code = gormFor(
      `
model Stamp {
  id     Int        @id
  list   DateTime[]
  days   DateTime[] @db.Date
  clocks DateTime[] @db.Timetz
}
`,
      'postgresql',
    )
    expect(code).toContain(
      [
        '\tList   DateTimeList  `gorm:"column:list;type:timestamp(3)[]" json:"list"`',
        '\tDays   DateList      `gorm:"column:days;type:date[]" json:"days"`',
        '\tClocks TimeOfDayList `gorm:"column:clocks;type:timetz[]" json:"clocks"`',
      ].join('\n'),
    )
    expect(code).not.toContain('serializer:json')
    expect(code).toContain(
      [
        'type DateTimeList []DateTime',
        '',
        'func (list DateTimeList) Value() (driver.Value, error) {',
        '\treturn arrayText(list)',
        '}',
        '',
        'func (list *DateTimeList) Scan(src any) error {',
        '\treturn scanArray(src, (*[]DateTime)(list))',
        '}',
      ].join('\n'),
    )
    expect(code).toContain('type DateList []Date')
    expect(code).toContain('type TimeOfDayList []TimeOfDay')
    expect(code).toContain('func arrayText[T driver.Valuer](list []T) (driver.Value, error) {')
    expect(code).toContain('\t"database/sql"\n\t"database/sql/driver"\n')
    expect(code).toContain('\t"strings"\n')
  })

  it('writes an instant as the UTC wall clock text on MySQL and reads a DATETIME in UTC', () => {
    const code = gormFor(
      `
model Stamp {
  id  Int       @id
  at  DateTime  @db.DateTime(3)
  ts  DateTime? @db.Timestamp(0)
  day DateTime  @default("2030-01-02T00:00:00.000Z") @db.Date
}
`,
      'mysql',
    )
    expect(code).toContain(
      [
        '\tAt  DateTime  `gorm:"column:at;type:datetime(3);not null" json:"at"`',
        '\tTs  *DateTime `gorm:"column:ts;type:timestamp(0)" json:"ts"`',
        '\tDay Date      `gorm:"column:day;type:date;default:\'2030-01-02\';not null" json:"day"`',
      ].join('\n'),
    )
    expect(code).toContain(
      '\treturn dateTime.UTC().Truncate(time.Millisecond).Format("2006-01-02 15:04:05.000"), nil',
    )
    expect(code).toContain(
      '\t\treturn time.Date(value.Year(), value.Month(), value.Day(), value.Hour(), value.Minute(), value.Second(), value.Nanosecond(), time.UTC).Truncate(time.Millisecond), nil',
    )
    expect(code).not.toContain('DateTimeList')
  })

  it('keeps a timestamptz and its precision on PostgreSQL, and fills a literal default in UTC', () => {
    const code = gormFor(
      `
model Stamp {
  id        Int       @id
  at        DateTime  @default("2030-01-02T03:04:05.678Z") @db.Timestamptz(3)
  day       DateTime? @db.Date
  clock     DateTime  @db.Time(3)
  updatedAt DateTime  @updatedAt
}
`,
      'postgresql',
    )
    expect(code).toContain(
      [
        '\tAt        DateTime  `gorm:"column:at;type:timestamptz(3);default:\'2030-01-02 03:04:05.678\';not null" json:"at"`',
        '\tDay       *Date     `gorm:"column:day;type:date" json:"day"`',
        '\tClock     TimeOfDay `gorm:"column:clock;type:time(3);not null" json:"clock"`',
        '\tUpdatedAt DateTime  `gorm:"column:updatedAt;type:timestamp(3);autoUpdateTime:false;not null" json:"updatedAt"`',
      ].join('\n'),
    )
    expect(code).toContain(
      '\t\tm.At = DateTime{Time: time.Date(2030, 1, 2, 3, 4, 5, 678000000, time.UTC)}',
    )
    expect(code).toContain('\t\ttx.Statement.SetColumn("UpdatedAt", DateTime{Time: now})')
    expect(code).toContain('\treturn dateTime.UTC().Truncate(time.Millisecond), nil')
    expect(code).not.toContain('arrayText')
  })
})

describe('generateGormModels keys and singular relations', () => {
  // Session and VerificationToken are as Auth.js writes them: neither has an @id, and User still
  // has the sessions, so the struct has to be there and GORM needs a key to load it by.
  it('keys a model with no @id by its first @unique or @@unique', () => {
    expect(
      gormFor(`
model User {
  id       String    @id
  sessions Session[]
}

model Session {
  sessionToken String @unique
  userId       String
  user         User   @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String

  @@unique([identifier, token])
}
`),
    ).toBe(`package model

type User struct {
	ID       string    \`gorm:"column:id;primaryKey;not null" json:"id"\`
	Sessions []Session \`gorm:"foreignKey:UserID;constraint:Session_userId_fkey,OnUpdate:CASCADE,OnDelete:CASCADE"\`
}

func (User) TableName() string {
	return "User"
}

type Session struct {
	SessionToken string \`gorm:"column:sessionToken;primaryKey;uniqueIndex:Session_sessionToken_key;not null" json:"sessionToken"\`
	UserID       string \`gorm:"column:userId;not null" json:"userId"\`
	User         *User  \`gorm:"belongsTo"\`
}

func (Session) TableName() string {
	return "Session"
}

type VerificationToken struct {
	Identifier string \`gorm:"column:identifier;primaryKey;uniqueIndex:VerificationToken_identifier_token_key,priority:1;not null" json:"identifier"\`
	Token      string \`gorm:"column:token;primaryKey;uniqueIndex:VerificationToken_identifier_token_key,priority:2;not null" json:"token"\`
}

func (VerificationToken) TableName() string {
	return "VerificationToken"
}
`)
  })

  // By value, Account would hold a User that holds an Account: an invalid recursive type in Go.
  it('writes a belongs-to as a pointer, so two models can point at each other', () => {
    expect(
      gormFor(`
model User {
  id        String   @id
  accountId String?
  account   Account? @relation("AccountOnUser", fields: [accountId], references: [id])
  current   Account? @relation("CurrentUser")
}

model Account {
  id            String  @id
  currentUserId String? @unique
  currentUser   User?   @relation("CurrentUser", fields: [currentUserId], references: [id])
  users         User[]  @relation("AccountOnUser")
}
`),
    ).toBe(`package model

type User struct {
	ID        string   \`gorm:"column:id;primaryKey;not null" json:"id"\`
	AccountID *string  \`gorm:"column:accountId" json:"accountId"\`
	Account   *Account \`gorm:"belongsTo"\`
	Current   *Account \`gorm:"foreignKey:CurrentUserID;constraint:Account_currentUserId_fkey,OnUpdate:CASCADE,OnDelete:SET NULL"\`
}

func (User) TableName() string {
	return "User"
}

type Account struct {
	ID            string  \`gorm:"column:id;primaryKey;not null" json:"id"\`
	CurrentUserID *string \`gorm:"column:currentUserId;uniqueIndex:Account_currentUserId_key" json:"currentUserId"\`
	CurrentUser   *User   \`gorm:"foreignKey:CurrentUserID;belongsTo"\`
	Users         []User  \`gorm:"foreignKey:AccountID;constraint:User_accountId_fkey,OnUpdate:CASCADE,OnDelete:SET NULL"\`
}

func (Account) TableName() string {
	return "Account"
}
`)
  })

  // GORM guesses a struct field onto its own schema as belongs-to first and finds SuccessorID
  // there, so `Predecessor *User` would parse as a second belongs-to and load the successor.
  // A slice is guessed as has-many on SuccessorID, which schema.Parse (gorm v1.31.2) confirms.
  it('writes a 1:1 back side onto its own model as a slice, which GORM reads as has-many', () => {
    expect(
      gormFor(`
model User {
  id          String  @id
  successorId String? @unique
  successor   User?   @relation("Succession", fields: [successorId], references: [id])
  /// Who this user succeeds.
  predecessor User?   @relation("Succession")
}
`),
    ).toBe(`package model

type User struct {
	ID          string  \`gorm:"column:id;primaryKey;not null" json:"id"\`
	SuccessorID *string \`gorm:"column:successorId;uniqueIndex:User_successorId_key" json:"successorId"\`
	Successor   *User   \`gorm:"foreignKey:SuccessorID;belongsTo"\`
	// Who this user succeeds.
	// A 1:1 onto User itself: GORM would read *User as belongs-to on the same key, so this is a slice of at most one.
	Predecessor []User \`gorm:"foreignKey:SuccessorID;constraint:User_successorId_fkey,OnUpdate:CASCADE,OnDelete:SET NULL"\`
}

func (User) TableName() string {
	return "User"
}
`)
  })
})

// With the partialIndexes preview feature an index can hold only the rows a `where` picks. DMMF
// drops the condition; the tag gives it to GORM in `where:`, so AutoMigrate makes the index Prisma
// Migrate makes (schema.Parse, gorm v1.31.2, reads each condition back as written here).
describe('generateGormModels partial indexes', () => {
  // DMMF leaves isUnique off a @unique with a partial unique beside it, so the key of a model
  // without an @id was lost. (#287)
  it('keys a model without an @id by a @unique that has a partial unique beside it', () => {
    const code = gormFor(
      `
generator client {
  provider        = "prisma-client"
  output          = "./generated"
  previewFeatures = ["partialIndexes"]
}

model A {
  email String  @unique
  alive Boolean

  @@unique([email], where: raw("alive"), map: "a_email_alive")
}
`,
      'postgresql',
    )
    expect(code.split('\n').find((line) => line.includes('column:email'))).toContain('primaryKey')
  })

  it('writes a Boolean as 1 and a name in brackets on SQL Server, which has no boolean literal', () => {
    const code = gormFor(
      `
generator client {
  provider        = "prisma-client"
  output          = "./generated"
  previewFeatures = ["partialIndexes"]
}

model Account {
  id    Int     @id
  alive Boolean
  n     Int

  @@index([n], where: { alive: true })
}
`,
      'sqlserver',
    )
    expect(code).toContain('index:Account_n_idx,where:([alive] = 1)')
  })

  it("writes a partial index's condition in where:, escaped for GORM and the tag", () => {
    expect(
      gormFor(
        `
generator client {
  provider        = "prisma-client"
  output          = "./generated"
  previewFeatures = ["partialIndexes"]
}

model Account {
  id    Int     @id
  email String  @unique
  alive Boolean
  n     Int
  code  String  @unique(where: raw("n > 0"))
  note  String?

  @@unique([email], where: raw("alive"), map: "account_email_alive")
  @@unique([alive, n], where: { alive: true })
  @@index([alive], where: { alive: true })
  @@index([note], where: raw("note IN ('a,b', 'c\\\\\\"d', 'e\\\\,f')"))
  @@index([n, note], where: raw("note <> ';'"), map: "account,n,note")
}
`,
        'postgresql',
      ),
    ).toBe(`package model

type Account struct {
	ID    int    \`gorm:"column:id;primaryKey;size:32" json:"id"\`
	Email string \`gorm:"column:email;uniqueIndex:Account_email_key;uniqueIndex:account_email_alive,where:(alive);not null" json:"email"\`
	Alive bool   \`gorm:"column:alive;uniqueIndex:Account_alive_n_key,priority:1,where:(\\"alive\\" = true);index:Account_alive_idx,where:(\\"alive\\" = true);not null" json:"alive"\`
	// The partial index "account,n,note" is left out: its condition holds a ";", at which GORM splits the tag.
	N    int     \`gorm:"column:n;uniqueIndex:Account_alive_n_key,priority:2,where:(\\"alive\\" = true);size:32;not null" json:"n"\`
	Code string  \`gorm:"column:code;uniqueIndex:Account_code_key,where:(n > 0);not null" json:"code"\`
	Note *string \`gorm:"column:note;index:Account_note_idx,where:(note IN ('a\\\\,b'\\\\, 'c\\\\\\\\\\"d'\\\\, 'e\\\\\\\\,f'))" json:"note"\`
}

func (Account) TableName() string {
	return "Account"
}
`)
  })

  it('keys nothing by a partial unique index and keeps a plain one on the same fields', () => {
    expect(
      gormFor(
        `
generator client {
  provider        = "prisma-client"
  output          = "./generated"
  previewFeatures = ["partialIndexes"]
}

model Pair {
  id Int @id
  a  Int
  b  Int
  @@unique([a, b])
  @@unique([a, b], where: raw("a > 0"), map: "pair_pos")
}

model Token {
  value String
  used  Boolean

  @@unique([value], where: { used: false })
}
`,
        'postgresql',
      ),
    ).toBe(`package model

type Pair struct {
	ID int \`gorm:"column:id;primaryKey;size:32" json:"id"\`
	A  int \`gorm:"column:a;uniqueIndex:Pair_a_b_key,priority:1;uniqueIndex:pair_pos,priority:1,where:(a > 0);size:32;not null" json:"a"\`
	B  int \`gorm:"column:b;uniqueIndex:Pair_a_b_key,priority:2;uniqueIndex:pair_pos,priority:2,where:(a > 0);size:32;not null" json:"b"\`
}

func (Pair) TableName() string {
	return "Pair"
}

type Token struct {
	Value string \`gorm:"column:value;uniqueIndex:Token_value_key,where:(\\"used\\" = false);not null" json:"value"\`
	Used  bool   \`gorm:"column:used;not null" json:"used"\`
}

func (Token) TableName() string {
	return "Token"
}
`)
  })
})

// On PostgreSQL an index's method (`type: Gin`) takes GORM's `type:`, which the migrator writes as
// USING, and an operator class (`ops:`) takes `expression:`, which the migrator writes in place of
// the quoted column, so AutoMigrate makes the index Prisma Migrate makes (schema.Parse, gorm
// v1.31.2, reads back each Type and Expression as written here).
describe('generateGormModels index methods and operator classes', () => {
  it('writes the method of a GIN index in type:', () => {
    expect(
      gormFor(
        `
model Doc {
  id   Int      @id
  tags String[]

  @@index([tags], map: "doc_tags_gin", type: Gin)
}
`,
        'postgresql',
      ),
    ).toContain('index:doc_tags_gin,type:gin;type:text[]"')
  })

  it('writes an operator class in expression:, after the quoted column', () => {
    expect(
      gormFor(
        `
model Doc {
  id   Int   @id
  data Json  @map("payload")

  @@index([data(ops: JsonbPathOps)], map: "doc_data_gin", type: Gin)
}
`,
        'postgresql',
      ),
    ).toContain('index:doc_data_gin,type:gin,expression:\\"payload\\" jsonb_path_ops;not null"')
  })

  it('writes a raw operator class as it is, beside priority:, sort:desc and where:', () => {
    expect(
      gormFor(
        `
generator client {
  provider        = "prisma-client"
  output          = "./generated"
  previewFeatures = ["partialIndexes"]
}

model Doc {
  id    Int     @id
  title String
  n     Int
  alive Boolean

  @@index([title(ops: raw("gin_trgm_ops"))], map: "doc_title_trgm", type: Gist)
  @@index([title(ops: raw("text_pattern_ops")), n(sort: Desc)], where: { alive: true })
}
`,
        'postgresql',
      ),
    ).toBe(`package model

type Doc struct {
	ID    int    \`gorm:"column:id;primaryKey;size:32" json:"id"\`
	Title string \`gorm:"column:title;index:doc_title_trgm,type:gist,expression:\\"title\\" gin_trgm_ops;index:Doc_title_n_idx,expression:\\"title\\" text_pattern_ops,priority:1,where:(\\"alive\\" = true);not null" json:"title"\`
	N     int    \`gorm:"column:n;index:Doc_title_n_idx,priority:2,sort:desc,where:(\\"alive\\" = true);size:32;not null" json:"n"\`
	Alive bool   \`gorm:"column:alive;not null" json:"alive"\`
}

func (Doc) TableName() string {
	return "Doc"
}
`)
  })

  it('leaves out an index whose operator class holds a ";", with a comment naming it', () => {
    expect(
      gormFor(
        `
model Doc {
  id    Int    @id
  title String

  @@index([title(ops: raw("a;b"))], map: "doc_title_ops")
}
`,
        'postgresql',
      ),
    ).toContain(
      '// The index "doc_title_ops" is left out: the expression of its column "title" with the operator class "a;b" holds a ";", at which GORM splits the tag.\n\tTitle string `gorm:"column:title;not null"',
    )
  })

  // A line break in the operator class stays inside the comment, so the model still compiles.
  it('keeps a line break in the left-out operator class inside the comment', () => {
    expect(
      gormFor(
        `
model Doc {
  id    Int    @id
  title String

  @@index([title(ops: raw("a;\\nb"))], map: "doc_title_ops")
}
`,
        'postgresql',
      ),
    ).toContain('with the operator class "a;\\nb" holds a ";"')
  })

  it('writes the method on CockroachDB, whose connector is PostgreSQL', () => {
    expect(
      gormFor(
        `
model Doc {
  id   Int  @id
  data Json

  @@index([data], map: "doc_data_gin", type: Gin)
}
`,
        'cockroachdb',
      ),
    ).toContain('index:doc_data_gin,type:gin;')
  })
})

// An index column MySQL indexes by a prefix (`length:`) takes GORM's `length:` in that field's index
// setting, which the migrator writes after the column, `note`(100), as Prisma Migrate does; a TEXT
// column cannot be indexed without one. A length the column does not exceed is no prefix.
describe('generateGormModels index prefix length', () => {
  const LOG_ENTRY = `
model LogEntry {
  id    Int    @id
  note  String @db.Text
  title String @db.VarChar(255)
  code  String @unique(length: 50) @db.Text
  short String @db.VarChar(20)
  data  Bytes
  bin   Bytes  @db.VarBinary(20)

  @@index([note(length: 100)])
  @@index([title(length: 20, sort: Desc), note(length: 10)])
  @@index([short(length: 30)])
  @@index([data(length: 200)])
  @@index([bin(length: 30)])
}
`

  it('writes length: on MySQL', () => {
    expect(gormFor(LOG_ENTRY, 'mysql')).toBe(`package model

type LogEntry struct {
	ID    int    \`gorm:"column:id;primaryKey;size:32" json:"id"\`
	Note  string \`gorm:"column:note;index:LogEntry_note_idx,length:100;index:LogEntry_title_note_idx,priority:2,length:10;type:text;not null" json:"note"\`
	Title string \`gorm:"column:title;index:LogEntry_title_note_idx,priority:1,length:20,sort:desc;type:varchar(255);not null" json:"title"\`
	Code  string \`gorm:"column:code;uniqueIndex:LogEntry_code_key,length:50;type:text;not null" json:"code"\`
	Short string \`gorm:"column:short;index:LogEntry_short_idx;type:varchar(20);not null" json:"short"\`
	Data  []byte \`gorm:"column:data;index:LogEntry_data_idx,length:200;not null" json:"data"\`
	Bin   []byte \`gorm:"column:bin;index:LogEntry_bin_idx;type:varbinary(20);not null" json:"bin"\`
}

func (LogEntry) TableName() string {
	return "LogEntry"
}
`)
  })
})

// An index column with `sort: Desc` takes GORM's `sort:desc` in that field's index setting, so
// AutoMigrate writes it DESC in CREATE INDEX as Prisma Migrate does (schema.Parse, gorm v1.31.2,
// reads Sort "desc" from each tag written here); `sort: Asc` is the default and stays plain.
describe('generateGormModels descending index columns', () => {
  it('writes sort:desc on a descending column of an index or a unique index', () => {
    expect(
      gormFor(
        `
model LogEntry {
  id        Int      @id
  uuid      String
  action    String
  timestamp Int
  code      String   @unique(sort: Desc)
  a         Int
  b         Int

  @@index([uuid, action, timestamp(sort: Desc)], map: "log_entry_uuid_idx")
  @@index([action(sort: Asc)])
  @@unique([a(sort: Desc), b])
}
`,
        'mysql',
      ),
    ).toBe(`package model

type LogEntry struct {
	ID        int    \`gorm:"column:id;primaryKey;size:32" json:"id"\`
	UUID      string \`gorm:"column:uuid;index:log_entry_uuid_idx,priority:1;type:varchar(191);not null" json:"uuid"\`
	Action    string \`gorm:"column:action;index:log_entry_uuid_idx,priority:2;index:LogEntry_action_idx;type:varchar(191);not null" json:"action"\`
	Timestamp int    \`gorm:"column:timestamp;index:log_entry_uuid_idx,priority:3,sort:desc;size:32;not null" json:"timestamp"\`
	Code      string \`gorm:"column:code;uniqueIndex:LogEntry_code_key,sort:desc;type:varchar(191);not null" json:"code"\`
	A         int    \`gorm:"column:a;uniqueIndex:LogEntry_a_b_key,priority:1,sort:desc;size:32;not null" json:"a"\`
	B         int    \`gorm:"column:b;uniqueIndex:LogEntry_a_b_key,priority:2;size:32;not null" json:"b"\`
}

func (LogEntry) TableName() string {
	return "LogEntry"
}
`)
  })

  it("writes sort:desc before a partial index's where:", () => {
    expect(
      gormFor(
        `
generator client {
  provider        = "prisma-client"
  output          = "./generated"
  previewFeatures = ["partialIndexes"]
}

model Account {
  id    Int     @id
  alive Boolean
  n     Int

  @@index([alive, n(sort: Desc)], where: raw("alive"))
  @@unique([n(sort: Desc)], where: raw("n > 0"))
}
`,
        'postgresql',
      ),
    ).toBe(`package model

type Account struct {
	ID    int  \`gorm:"column:id;primaryKey;size:32" json:"id"\`
	Alive bool \`gorm:"column:alive;index:Account_alive_n_idx,priority:1,where:(alive);not null" json:"alive"\`
	N     int  \`gorm:"column:n;uniqueIndex:Account_n_key,sort:desc,where:(n > 0);index:Account_alive_n_idx,priority:2,sort:desc,where:(alive);size:32;not null" json:"n"\`
}

func (Account) TableName() string {
	return "Account"
}
`)
  })
})

describe('generateGormModels fields that become one Go name', () => {
  // documenso's Account holds `createdAt` beside the `created_at` an OAuth provider returns; both
  // would be `CreatedAt`, which Go refuses as a redeclared field.
  it('numbers the second, its column tag naming its own column', () => {
    const code = gormFor(`
model Account {
  id         String   @id
  createdAt  DateTime @default(now())
  created_at Int?
}
`)
    expect(code).toContain(
      [
        'type Account struct {',
        '\tID         string   `gorm:"column:id;primaryKey;not null" json:"id"`',
        '\tCreatedAt  DateTime `gorm:"column:createdAt;autoCreateTime:false;not null" json:"createdAt"`',
        '\tCreatedAt1 *int     `gorm:"column:created_at;size:32" json:"created_at"`',
        '}',
      ].join('\n'),
    )
  })

  // GORM fills a number named CreatedAt with the Unix seconds; the column is the caller's.
  it('keeps GORM from filling a number that keeps the name', () => {
    const code = gormFor(`
model Account {
  id         String    @id
  created_at Int?
  createdAt  DateTime?
}
`)
    expect(code).toContain(
      [
        '\tCreatedAt  *int      `gorm:"column:created_at;size:32;autoCreateTime:false" json:"created_at"`',
        '\tCreatedAt1 *DateTime `gorm:"column:createdAt" json:"createdAt"`',
      ].join('\n'),
    )
  })

  it('names a renamed key as the struct that holds it does', () => {
    const code = gormFor(`
model User {
  id      String @id
  userId  String @unique
  user_id String
  posts   Post[]
}

model Post {
  id      String @id
  user_id String
  userId  String
  user    User   @relation(fields: [userId], references: [userId])
}
`)
    expect(code).toContain(
      '\tPosts   []Post `gorm:"foreignKey:UserID1;references:UserID;constraint:Post_userId_fkey,OnUpdate:CASCADE,OnDelete:RESTRICT"`',
    )
    expect(code).toContain(
      '\tUser    *User  `gorm:"foreignKey:UserID1;references:UserID;belongsTo"`',
    )
  })
})

describe('doc comments', () => {
  it('writes the prose of /// comments as Go comments, keeping the struct gofmt-clean', () => {
    const dmmf = getDMMF({
      datamodel: [
        [
          'schema.prisma',
          `datasource db {
  provider = "postgresql"
}
/// A person.
///
/// Second paragraph */ with \\\\ backslash.
model User {
  /// The key.
  id        Int      @id
  /// @z.string()
  name      String
  /// When they joined.
  /// Two lines.
  createdAt DateTime @default(now())
  /// Their posts.
  posts     Post[]
  tone      Tone
}
model Post {
  id       Int  @id
  /// Who wrote it.
  authorId Int
  /// The author.
  author   User @relation(fields: [authorId], references: [id])
}
/// How loud.
enum Tone {
  CALM
}
`,
        ],
      ],
    })
    const { models, enums, indexes } = datamodelOf(dmmf)
    expect(generateGormModels(models, enums, indexes)).toBe(`package model

import (
	"database/sql/driver"
	"fmt"
	"strconv"
	"time"

	"gorm.io/gorm"
)

// A person.
//
// Second paragraph */ with \\\\ backslash.
type User struct {
	// The key.
	ID   int    \`gorm:"column:id;primaryKey;size:32" json:"id"\`
	Name string \`gorm:"column:name;not null" json:"name"\`
	// When they joined.
	// Two lines.
	CreatedAt DateTime \`gorm:"column:createdAt;autoCreateTime:false;not null" json:"createdAt"\`
	Tone      string   \`gorm:"column:tone;not null" json:"tone"\`
	// Their posts.
	Posts []Post \`gorm:"foreignKey:AuthorID;constraint:Post_authorId_fkey,OnUpdate:CASCADE,OnDelete:RESTRICT"\`
}

func (User) TableName() string {
	return "User"
}

func (m *User) BeforeCreate(tx *gorm.DB) error {
	now := tx.NowFunc().UTC().Truncate(time.Millisecond)
	if m.CreatedAt.IsZero() {
		m.CreatedAt = DateTime{Time: now}
	}
	return nil
}

type Post struct {
	ID int \`gorm:"column:id;primaryKey;size:32" json:"id"\`
	// Who wrote it.
	AuthorID int \`gorm:"column:authorId;size:32;not null" json:"authorId"\`
	// The author.
	Author *User \`gorm:"foreignKey:AuthorID;belongsTo"\`
}

func (Post) TableName() string {
	return "Post"
}

type DateTime struct{ time.Time }

func (DateTime) GormDataType() string {
	return "time"
}

func (dateTime DateTime) Value() (driver.Value, error) {
	return dateTime.UTC().Truncate(time.Millisecond), nil
}

func (dateTime *DateTime) Scan(src any) error {
	read, err := readPrismaTime(src)
	dateTime.Time = read
	return err
}

var prismaTimeLayouts = []string{
	"2006-01-02T15:04:05.999999999Z07:00",
	"2006-01-02 15:04:05.999999999Z07:00",
	"2006-01-02 15:04:05.999999999Z07",
	"2006-01-02T15:04:05.999999999",
	"2006-01-02 15:04:05.999999999",
	"2006-01-02",
}

func readPrismaTime(src any) (time.Time, error) {
	switch value := src.(type) {
	case nil:
		return time.Time{}, nil
	case time.Time:
		return value.UTC().Truncate(time.Millisecond), nil
	case int64:
		return time.UnixMilli(value).UTC(), nil
	case []byte:
		return readPrismaTime(string(value))
	case string:
		if millis, err := strconv.ParseInt(value, 10, 64); err == nil {
			return time.UnixMilli(millis).UTC(), nil
		}
		for _, layout := range prismaTimeLayouts {
			if read, err := time.Parse(layout, value); err == nil {
				return read.UTC().Truncate(time.Millisecond), nil
			}
		}
		return time.Time{}, fmt.Errorf("a DateTime column held %q", value)
	}
	return time.Time{}, fmt.Errorf("a DateTime column held %T", src)
}
`)
  })
})

describe('generateGormModels key columns on SQLite', () => {
  // SQLite makes only an INTEGER PRIMARY KEY refuse NULL by itself; Prisma Migrate's key is NOT NULL.
  it('writes not null on a key field that is not an autoincrementing Int, on SQLite only', () => {
    const schema = `
model kv {
  key   String @id
  value String
}

model pair {
  a String
  b Int

  @@id([a, b])
}

model counter {
  id Int @id @default(autoincrement())
}
`
    const sqlite = gormFor(schema, 'sqlite')
    expect(sqlite).toContain('`gorm:"column:key;primaryKey;not null" json:"key"`')
    expect(sqlite).toContain('`gorm:"column:a;primaryKey;not null" json:"a"`')
    expect(sqlite).toContain('`gorm:"column:b;primaryKey;size:32;not null" json:"b"`')
    expect(sqlite).toContain('`gorm:"column:id;primaryKey;autoIncrement;size:32" json:"id"`')
    expect(gormFor(schema, 'postgresql')).toContain('`gorm:"column:key;primaryKey" json:"key"`')
  })
})

// GORM orders a composite index's columns by each field's `priority:` (10 where none is given) and
// then by struct field order, and a composite primary key's by struct field order alone
// (schema.Parse, gorm v1.31.2), so each field of a composite index carries its position in the
// schema's list and the key's fields are declared in @@id order: the columns come out in the order
// Prisma Migrate gives them.
describe('generateGormModels composite column order', () => {
  it('leaves the fields where they are when the @@id order is theirs, apart or not', () => {
    const code = gormFor(
      `
model trio {
  a Int
  b Int
  c Int

  @@id([a, c])
}
`,
      'postgresql',
    )
    const a = code.indexOf('\tA int')
    const b = code.indexOf('\tB int')
    const c = code.indexOf('\tC int')
    expect(a).toBeGreaterThan(-1)
    expect(b).toBeGreaterThan(a)
    expect(c).toBeGreaterThan(b)
  })

  it('declares @@id fields in key order and writes priority: on composite index fields', () => {
    expect(
      gormFor(
        `
model pairs {
  a Int
  b Int
  c Int
  d Int

  @@id([b, a])
  @@unique([d, c])
  @@index([c, b])
}
`,
        'postgresql',
      ),
    ).toBe(`package model

type Pairs struct {
	B int \`gorm:"column:b;primaryKey;index:pairs_c_b_idx,priority:2;size:32" json:"b"\`
	A int \`gorm:"column:a;primaryKey;size:32" json:"a"\`
	C int \`gorm:"column:c;uniqueIndex:pairs_d_c_key,priority:2;index:pairs_c_b_idx,priority:1;size:32;not null" json:"c"\`
	D int \`gorm:"column:d;uniqueIndex:pairs_d_c_key,priority:1;size:32;not null" json:"d"\`
}

func (Pairs) TableName() string {
	return "pairs"
}
`)
  })

  it('moves the key fields, with their comments, to the first of them and keeps the rest in place', () => {
    expect(
      gormFor(
        `
model Line {
  /// The order's number.
  order  Int
  /// A note.
  note   String
  item   String @default(uuid())
  /// The line's number.
  number Int
  parts  Part[]

  @@id([number, order])
}

model Part {
  id         Int  @id
  lineOrder  Int
  lineNumber Int
  line       Line @relation(fields: [lineNumber, lineOrder], references: [number, order])
}
`,
        'postgresql',
      ),
    ).toBe(`package model

import (
	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Line struct {
	// The line's number.
	Number int \`gorm:"column:number;primaryKey;size:32" json:"number"\`
	// The order's number.
	Order int \`gorm:"column:order;primaryKey;size:32" json:"order"\`
	// A note.
	Note  string \`gorm:"column:note;not null" json:"note"\`
	Item  string \`gorm:"column:item;not null" json:"item"\`
	Parts []Part \`gorm:"foreignKey:LineNumber,LineOrder;references:Number,Order;constraint:Part_lineNumber_lineOrder_fkey,OnUpdate:CASCADE,OnDelete:RESTRICT"\`
}

func (Line) TableName() string {
	return "Line"
}

func (m *Line) BeforeCreate(_ *gorm.DB) error {
	if m.Item == "" {
		m.Item = uuid.NewString()
	}
	return nil
}

type Part struct {
	ID         int   \`gorm:"column:id;primaryKey;size:32" json:"id"\`
	LineOrder  int   \`gorm:"column:lineOrder;size:32;not null" json:"lineOrder"\`
	LineNumber int   \`gorm:"column:lineNumber;size:32;not null" json:"lineNumber"\`
	Line       *Line \`gorm:"foreignKey:LineNumber,LineOrder;references:Number,Order;belongsTo"\`
}

func (Part) TableName() string {
	return "Part"
}
`)
  })

  it('declares the fields of the @@unique that keys a model with no @id in its order', () => {
    expect(
      gormFor(
        `
model Token {
  identifier String
  value      String
  token      String

  @@unique([token, identifier])
}
`,
        'postgresql',
      ),
    ).toBe(`package model

type Token struct {
	Token      string \`gorm:"column:token;primaryKey;uniqueIndex:Token_token_identifier_key,priority:1" json:"token"\`
	Identifier string \`gorm:"column:identifier;primaryKey;uniqueIndex:Token_token_identifier_key,priority:2" json:"identifier"\`
	Value      string \`gorm:"column:value;not null" json:"value"\`
}

func (Token) TableName() string {
	return "Token"
}
`)
  })
})

// PostgreSQL prints money in its locale's form ("$1,234.50"), which a float64 cannot scan, and
// datatypes.JSON names jsonb to AutoMigrate whatever the tag says: both have a type of their own.
describe('generateGormModels PostgreSQL money and json columns', () => {
  const schema = `
model Wallet {
  id      Int      @id
  balance Decimal  @db.Money
  bonus   Decimal? @db.Money
  tip     Decimal  @default(1.5) @db.Money
  raw     Json     @db.Json
  extra   Json?    @db.Json
  doc     Json     @db.JsonB
}
`

  it('holds @db.Money in Money and @db.Json in PlainJSON, written beside the models', () => {
    const code = gormFor(schema, 'postgresql')
    expect(code).toContain(
      '\tBalance Money          `gorm:"column:balance;type:money;not null" json:"balance"`\n',
    )
    expect(code).toContain(
      '\tBonus   *Money         `gorm:"column:bonus;type:money" json:"bonus"`\n',
    )
    expect(code).toContain(
      '\tTip     *Money         `gorm:"column:tip;type:money;default:1.5;not null" json:"tip"`\n',
    )
    expect(code).toContain('\tRaw     PlainJSON      `gorm:"column:raw;not null" json:"raw"`\n')
    expect(code).toContain('\tExtra   PlainJSON      `gorm:"column:extra" json:"extra"`\n')
    expect(code).toContain(
      '\tDoc     datatypes.JSON `gorm:"column:doc;type:jsonb;not null" json:"doc"`\n',
    )
    expect(code).toContain('type Money float64\n')
    expect(code).toContain('type PlainJSON json.RawMessage\n')
    expect(code).toContain(`import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)`)
  })

  it('keeps the money text it cannot read from becoming a wrong amount', () => {
    const code = gormFor(schema, 'postgresql')
    expect(code).toContain(
      '\tmoneyText   = regexp.MustCompile("^(-?)\\\\$(\\\\d{1,3}(?:,\\\\d{3})*)\\\\.(\\\\d{2})$")\n',
    )
    expect(code).toContain(
      '\t\treturn fmt.Errorf("a money column held %q, which is not in the C or en_US form", text)\n',
    )
  })

  it('leaves CockroachDB, which has no money and whose json is jsonb, as it was', () => {
    const code = gormFor(
      `
model Wallet {
  id  Int  @id
  raw Json @db.JsonB
}
`,
      'cockroachdb',
    )
    expect(code).not.toContain('PlainJSON')
    expect(code).not.toContain('Money')
  })

  it('names a money list, which GORM cannot read, and a model that takes the name of a type', () => {
    const result = getDMMF({
      datamodel: `datasource db {
  provider = "postgresql"
}

model Money {
  id     Int       @id
  prices Decimal[] @db.Money
  amount Decimal   @db.Money
}
`,
    })
    expect(gormProblems(datamodelOf(result).models, 'postgresql')).toStrictEqual([
      'model Money: its Go name is Money, what the models hold a @db.Money in; rename the model and keep its table with @@map',
      'model Money: prices is a list of money, which GORM cannot read from the money[] PostgreSQL prints; make it a list of @db.Decimal',
    ])
  })
})
