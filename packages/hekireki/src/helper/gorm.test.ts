import type { DMMF } from '@prisma/generator-helper'
import { getDMMF } from '@prisma/get-dmmf'
import { describe, expect, it } from 'vite-plus/test'

import { generateGormModels } from '../generator/gorm.js'
import { buildGormTags, goFieldName, prismaTypeToGoType } from './gorm.js'

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
  const result = getDMMF({
    datamodel: [['schema.prisma', `datasource db {\n  provider = "${provider}"\n}\n${schema}`]],
  })
  if ('type' in result) throw new Error(result.error.message)
  return generateGormModels(
    result.datamodel.models,
    result.datamodel.enums,
    result.datamodel.indexes,
    'model',
    provider,
  )
}

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
	ID        int      \`gorm:"column:id;primaryKey;autoIncrement" json:"id"\`
	UserID    *string  \`gorm:"column:userId" json:"userId"\`
	CreatedAt DateTime \`gorm:"column:createdAt;autoCreateTime:false;not null" json:"createdAt"\`
	User      User
	Comments  []Comment \`gorm:"foreignKey:PostID"\`
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
	ID    string \`gorm:"column:id;primaryKey;type:char(36)" json:"id"\`
	Posts []Post \`gorm:"foreignKey:UserID"\`
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
	ID     int \`gorm:"column:id;primaryKey" json:"id"\`
	PostID int \`gorm:"column:postId;not null" json:"postId"\`
	Post   Post
}

func (Comment) TableName() string {
	return "Comment"
}

// DateTime is a Prisma DateTime as Prisma Client keeps it: an instant in UTC, to the
// millisecond, whatever zone the time.Time is in. Bind a time.Time through it in a query of
// your own, \`db.Where("at > ?", DateTime{Time: at})\`: the driver formats a bare time.Time
// its own way.
type DateTime struct{ time.Time }

// GormDataType has GORM treat the column as it treats a time.Time.
func (DateTime) GormDataType() string {
	return "time"
}

// Value writes the instant as Prisma Client does on SQLite: \`2006-01-02T15:04:05.000+00:00\`,
// in UTC, the text SQLite compares and sorts.
func (dateTime DateTime) Value() (driver.Value, error) {
	return dateTime.UTC().Truncate(time.Millisecond).Format("2006-01-02T15:04:05.000-07:00"), nil
}

// Scan reads the column as Prisma Client does (see readPrismaTime).
func (dateTime *DateTime) Scan(src any) error {
	read, err := readPrismaTime(src)
	dateTime.Time = read
	return err
}

// prismaTimeLayouts are the texts readPrismaTime reads, as Prisma Client reads them: with an
// offset or \`Z\`, or with none, which is UTC; a date alone is midnight UTC.
var prismaTimeLayouts = []string{
	"2006-01-02T15:04:05.999999999Z07:00",
	"2006-01-02 15:04:05.999999999Z07:00",
	"2006-01-02 15:04:05.999999999Z07",
	"2006-01-02T15:04:05.999999999",
	"2006-01-02 15:04:05.999999999",
	"2006-01-02",
}

// readPrismaTime reads a DateTime column as Prisma Client reads it: text with no zone is UTC, an
// offset is kept, digits are milliseconds since 1970, and what is past the millisecond is
// dropped.
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
	ID      int      \`gorm:"column:id;primaryKey;autoIncrement" json:"id"\`
	Profile *Profile \`gorm:"foreignKey:OwnerID"\`
}

func (User) TableName() string {
	return "User"
}

type Profile struct {
	ID      int  \`gorm:"column:id;primaryKey;autoIncrement" json:"id"\`
	OwnerID int  \`gorm:"column:ownerId;uniqueIndex;not null" json:"ownerId"\`
	User    User \`gorm:"foreignKey:OwnerID"\`
}

func (Profile) TableName() string {
	return "Profile"
}
`)
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

// NamingStrategy keeps the names Prisma gave its many-to-many join tables
// (\`_AToB\`, columns \`A\` and \`B\`), which GORM would otherwise snake_case,
// pluralise and lowercase. Open the connection with it:
//
//	gorm.Open(dialector, &gorm.Config{NamingStrategy: model.NamingStrategy})
var NamingStrategy = schema.NamingStrategy{SingularTable: true, NoLowerCase: true}

type Post struct {
	ID   int   \`gorm:"column:id;primaryKey;autoIncrement" json:"id"\`
	Tags []Tag \`gorm:"many2many:_PostToTag;joinForeignKey:A;joinReferences:B"\`
}

func (Post) TableName() string {
	return "Post"
}

type Tag struct {
	ID    string \`gorm:"column:id;primaryKey" json:"id"\`
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
	ID     int            \`gorm:"column:id;primaryKey;autoIncrement" json:"id"\`
	Active *bool          \`gorm:"column:active;default:true;not null" json:"active"\`
	Hidden bool           \`gorm:"column:hidden;default:false;not null" json:"hidden"\`
	Slug   *string        \`gorm:"column:slug;default:'untitled';not null" json:"slug"\`
	Note   string         \`gorm:"column:note;default:'';not null" json:"note"\`
	Limit  *int           \`gorm:"column:limit;default:10;not null" json:"limit"\`
	Offset int            \`gorm:"column:offset;default:0;not null" json:"offset"\`
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
	ID    string  \`gorm:"column:id;primaryKey" json:"id"\`
	V2    string  \`gorm:"column:v2;uniqueIndex;not null" json:"v2"\`
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
        '\tList   DateTimeList  `gorm:"column:list;type:timestamp(3)[];not null" json:"list"`',
        '\tDays   DateList      `gorm:"column:days;type:date[];not null" json:"days"`',
        '\tClocks TimeOfDayList `gorm:"column:clocks;type:timetz[];not null" json:"clocks"`',
      ].join('\n'),
    )
    expect(code).not.toContain('serializer:json')
    expect(code).toContain(
      [
        '// DateTimeList is a Prisma DateTime[] held as DateTimes: a PostgreSQL array, each element',
        '// written and read as DateTime writes and reads one.',
        'type DateTimeList []DateTime',
        '',
        '// Value writes the array as Prisma Client does, `{"2030-01-02 03:04:05.678"}`.',
        'func (list DateTimeList) Value() (driver.Value, error) {',
        '\treturn arrayText(list)',
        '}',
        '',
        '// Scan reads each element of the array as DateTime does.',
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
        '\tUpdatedAt DateTime  `gorm:"column:updatedAt;autoUpdateTime:false;not null" json:"updatedAt"`',
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
