import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vitest'

import {
  generateSingleFile,
  prismaTypeToPythonType,
  prismaTypeToSQLAlchemyType,
  sqlalchemySchemas,
} from './sqlalchemy.js'

// Test run
// pnpm vitest run ./src/helper/sqlalchemy.test.ts

// ============================================================================
// Type Mapping Tests
// ============================================================================

describe('prismaTypeToSQLAlchemyType', () => {
  it('maps String to String', () => {
    expect(prismaTypeToSQLAlchemyType('String')).toStrictEqual('String')
  })

  it('maps Int to Integer', () => {
    expect(prismaTypeToSQLAlchemyType('Int')).toStrictEqual('Integer')
  })

  it('maps BigInt to BigInteger', () => {
    expect(prismaTypeToSQLAlchemyType('BigInt')).toStrictEqual('BigInteger')
  })

  it('maps Float to Float', () => {
    expect(prismaTypeToSQLAlchemyType('Float')).toStrictEqual('Float')
  })

  it('maps Decimal to Numeric', () => {
    expect(prismaTypeToSQLAlchemyType('Decimal')).toStrictEqual('Numeric')
  })

  it('maps Boolean to Boolean', () => {
    expect(prismaTypeToSQLAlchemyType('Boolean')).toStrictEqual('Boolean')
  })

  it('maps DateTime to DateTime', () => {
    expect(prismaTypeToSQLAlchemyType('DateTime')).toStrictEqual('DateTime')
  })

  it('maps Json to JSON', () => {
    expect(prismaTypeToSQLAlchemyType('Json')).toStrictEqual('JSON')
  })

  it('maps Bytes to LargeBinary', () => {
    expect(prismaTypeToSQLAlchemyType('Bytes')).toStrictEqual('LargeBinary')
  })

  it('maps unknown type to String', () => {
    expect(prismaTypeToSQLAlchemyType('Unknown')).toStrictEqual('String')
  })
})

describe('prismaTypeToPythonType', () => {
  it('maps String to str', () => {
    expect(prismaTypeToPythonType('String')).toStrictEqual('str')
  })

  it('maps Int to int', () => {
    expect(prismaTypeToPythonType('Int')).toStrictEqual('int')
  })

  it('maps BigInt to int', () => {
    expect(prismaTypeToPythonType('BigInt')).toStrictEqual('int')
  })

  it('maps Float to float', () => {
    expect(prismaTypeToPythonType('Float')).toStrictEqual('float')
  })

  it('maps Decimal to Decimal', () => {
    expect(prismaTypeToPythonType('Decimal')).toStrictEqual('Decimal')
  })

  it('maps Boolean to bool', () => {
    expect(prismaTypeToPythonType('Boolean')).toStrictEqual('bool')
  })

  it('maps DateTime to datetime', () => {
    expect(prismaTypeToPythonType('DateTime')).toStrictEqual('datetime')
  })

  it('maps Json to dict', () => {
    expect(prismaTypeToPythonType('Json')).toStrictEqual('dict')
  })

  it('maps Bytes to bytes', () => {
    expect(prismaTypeToPythonType('Bytes')).toStrictEqual('bytes')
  })

  it('maps unknown type to str', () => {
    expect(prismaTypeToPythonType('Unknown')).toStrictEqual('str')
  })
})

// ============================================================================
// Helper: create minimal DMMF.Field / DMMF.Model
// ============================================================================

function makeField(overrides: Partial<DMMF.Field> & { name: string; type: string }): DMMF.Field {
  return {
    kind: 'scalar',
    isList: false,
    isRequired: true,
    isUnique: false,
    isId: false,
    isReadOnly: false,
    hasDefaultValue: false,
    isGenerated: false,
    isUpdatedAt: false,
    ...overrides,
  } as DMMF.Field
}

function makeModel(
  name: string,
  fields: DMMF.Field[],
  overrides?: Partial<DMMF.Model>,
): DMMF.Model {
  return {
    name,
    dbName: null,
    fields,
    primaryKey: null,
    uniqueFields: [],
    uniqueIndexes: [],
    ...overrides,
  } as DMMF.Model
}

// ============================================================================
// generateSingleFile — strict toBe tests
// ============================================================================

describe('generateSingleFile', () => {
  it('generates a simple model with id and string field', () => {
    const models = [
      makeModel('User', [
        makeField({ name: 'id', type: 'String', isId: true }),
        makeField({ name: 'name', type: 'String' }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "user"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]
`,
    )
  })

  it('handles optional fields', () => {
    const models = [
      makeModel('Post', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'title', type: 'String' }),
        makeField({ name: 'content', type: 'String', isRequired: false }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from typing import Optional


class Base(DeclarativeBase):
    pass


class Post(Base):
    __tablename__ = "post"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str]
    content: Mapped[Optional[str]]
`,
    )
  })

  it('handles autoincrement primary key', () => {
    const models = [
      makeModel('Item', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'label', type: 'String' }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Item(Base):
    __tablename__ = "item"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    label: Mapped[str]
`,
    )
  })

  it('handles unique fields', () => {
    const models = [
      makeModel('Account', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'email', type: 'String', isUnique: true }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Account(Base):
    __tablename__ = "account"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(unique=True)
`,
    )
  })

  it('handles DateTime with now() default', () => {
    const models = [
      makeModel('Event', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'createdAt',
          type: 'DateTime',
          hasDefaultValue: true,
          default: { name: 'now', args: [] },
        }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy import func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from datetime import datetime


class Base(DeclarativeBase):
    pass


class Event(Base):
    __tablename__ = "event"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
`,
    )
  })

  it('handles updatedAt field', () => {
    const models = [
      makeModel('Record', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'updatedAt', type: 'DateTime', isUpdatedAt: true }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy import func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from datetime import datetime


class Base(DeclarativeBase):
    pass


class Record(Base):
    __tablename__ = "record"

    id: Mapped[int] = mapped_column(primary_key=True)
    updated_at: Mapped[datetime] = mapped_column(onupdate=func.now())
`,
    )
  })

  it('handles boolean default', () => {
    const models = [
      makeModel('Setting', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'active',
          type: 'Boolean',
          hasDefaultValue: true,
          default: true,
        }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Setting(Base):
    __tablename__ = "setting"

    id: Mapped[int] = mapped_column(primary_key=True)
    active: Mapped[bool] = mapped_column(default=True)
`,
    )
  })

  it('handles false boolean default', () => {
    const models = [
      makeModel('Flag', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'enabled',
          type: 'Boolean',
          hasDefaultValue: true,
          default: false,
        }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Flag(Base):
    __tablename__ = "flag"

    id: Mapped[int] = mapped_column(primary_key=True)
    enabled: Mapped[bool] = mapped_column(default=False)
`,
    )
  })

  it('handles string default', () => {
    const models = [
      makeModel('Config', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'status',
          type: 'String',
          hasDefaultValue: true,
          default: 'active',
        }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Config(Base):
    __tablename__ = "config"

    id: Mapped[int] = mapped_column(primary_key=True)
    status: Mapped[str] = mapped_column(default="active")
`,
    )
  })

  it('handles numeric default', () => {
    const models = [
      makeModel('Limit', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'maxRetries',
          type: 'Int',
          hasDefaultValue: true,
          default: 3,
        }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Limit(Base):
    __tablename__ = "limit"

    id: Mapped[int] = mapped_column(primary_key=True)
    max_retries: Mapped[int] = mapped_column(default=3)
`,
    )
  })

  it('handles enums', () => {
    const models = [
      makeModel('User', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'role', type: 'Role', kind: 'enum' }),
      ]),
    ]
    const enums: DMMF.DatamodelEnum[] = [
      {
        name: 'Role',
        values: [
          { name: 'ADMIN', dbName: null },
          { name: 'USER', dbName: null },
        ],
      } as DMMF.DatamodelEnum,
    ]

    expect(generateSingleFile(models, enums)).toBe(
      `from sqlalchemy import Enum
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(primary_key=True)
    role: Mapped[str] = mapped_column(Enum("ADMIN", "USER", name="role"))
`,
    )
  })

  it('handles enum with default value', () => {
    const models = [
      makeModel('User', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'role',
          type: 'Role',
          kind: 'enum',
          hasDefaultValue: true,
          default: 'USER',
        }),
      ]),
    ]
    const enums: DMMF.DatamodelEnum[] = [
      {
        name: 'Role',
        values: [
          { name: 'ADMIN', dbName: null },
          { name: 'USER', dbName: null },
        ],
      } as DMMF.DatamodelEnum,
    ]

    expect(generateSingleFile(models, enums)).toBe(
      `from sqlalchemy import Enum
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(primary_key=True)
    role: Mapped[str] = mapped_column(Enum("ADMIN", "USER", name="role"), default="USER")
`,
    )
  })

  it('handles relations (belongsTo + hasMany)', () => {
    const userModel = makeModel('User', [
      makeField({ name: 'id', type: 'String', isId: true }),
      makeField({ name: 'name', type: 'String' }),
      makeField({
        name: 'posts',
        type: 'Post',
        kind: 'object',
        isList: true,
        isRequired: false,
        relationName: 'PostToUser',
      }),
    ])

    const postModel = makeModel('Post', [
      makeField({ name: 'id', type: 'String', isId: true }),
      makeField({ name: 'title', type: 'String' }),
      makeField({ name: 'userId', type: 'String' }),
      makeField({
        name: 'user',
        type: 'User',
        kind: 'object',
        isRequired: true,
        relationName: 'PostToUser',
        relationFromFields: ['userId'],
        relationToFields: ['id'],
      }),
    ])

    expect(generateSingleFile([userModel, postModel])).toBe(
      `from sqlalchemy import ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "user"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]

    posts: Mapped[list["Post"]] = relationship(back_populates="user")

class Post(Base):
    __tablename__ = "post"

    id: Mapped[str] = mapped_column(primary_key=True)
    title: Mapped[str]
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"))

    user: Mapped["User"] = relationship(back_populates="posts")
`,
    )
  })

  it('handles hasOne relation', () => {
    const userModel = makeModel('User', [
      makeField({ name: 'id', type: 'String', isId: true }),
      makeField({ name: 'name', type: 'String' }),
      makeField({
        name: 'profile',
        type: 'Profile',
        kind: 'object',
        isList: false,
        isRequired: false,
        relationName: 'ProfileToUser',
      }),
    ])

    const profileModel = makeModel('Profile', [
      makeField({ name: 'id', type: 'String', isId: true }),
      makeField({ name: 'bio', type: 'String' }),
      makeField({ name: 'userId', type: 'String', isUnique: true }),
      makeField({
        name: 'user',
        type: 'User',
        kind: 'object',
        isRequired: true,
        relationName: 'ProfileToUser',
        relationFromFields: ['userId'],
        relationToFields: ['id'],
      }),
    ])

    expect(generateSingleFile([userModel, profileModel])).toBe(
      `from sqlalchemy import ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "user"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]

    profile: Mapped["Profile"] = relationship(back_populates="user", uselist=False)

class Profile(Base):
    __tablename__ = "profile"

    id: Mapped[str] = mapped_column(primary_key=True)
    bio: Mapped[str]
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"), unique=True)

    user: Mapped["User"] = relationship(back_populates="profile")
`,
    )
  })

  it('handles models with dbName (@@map)', () => {
    const models = [
      makeModel(
        'UserProfile',
        [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'displayName', type: 'String' }),
        ],
        { dbName: 'user_profiles' },
      ),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    display_name: Mapped[str]
`,
    )
  })

  it('handles composite unique constraints', () => {
    const models = [
      makeModel(
        'Membership',
        [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'userId', type: 'String' }),
          makeField({ name: 'orgId', type: 'String' }),
        ],
        { uniqueFields: [['userId', 'orgId']] },
      ),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy import UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Membership(Base):
    __tablename__ = "membership"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str]
    org_id: Mapped[str]

    __table_args__ = (
        UniqueConstraint("user_id", "org_id"),
    )
`,
    )
  })

  it('handles indexes', () => {
    const models = [
      makeModel('Article', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'slug', type: 'String' }),
      ]),
    ]
    const indexes: DMMF.Index[] = [
      {
        model: 'Article',
        type: 'normal',
        fields: [{ name: 'slug' }],
        dbName: 'idx_article_slug',
      } as unknown as DMMF.Index,
    ]

    expect(generateSingleFile(models, undefined, indexes)).toBe(
      `from sqlalchemy import Index
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Article(Base):
    __tablename__ = "article"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str]

    __table_args__ = (
        Index("idx_article_slug", "slug"),
    )
`,
    )
  })

  it('handles native type VarChar', () => {
    const models = [
      makeModel('Tag', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'label',
          type: 'String',
          nativeType: ['VarChar', [255]],
        }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy import String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Tag(Base):
    __tablename__ = "tag"

    id: Mapped[int] = mapped_column(primary_key=True)
    label: Mapped[str] = mapped_column(String(255))
`,
    )
  })

  it('handles native type Char', () => {
    const models = [
      makeModel('Code', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'code',
          type: 'String',
          nativeType: ['Char', [6]],
        }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy import String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Code(Base):
    __tablename__ = "code"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(6))
`,
    )
  })

  it('handles native type Uuid', () => {
    const models = [
      makeModel('Entity', [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          nativeType: ['Uuid', []],
        }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy import Uuid
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
import uuid as uuid_mod


class Base(DeclarativeBase):
    pass


class Entity(Base):
    __tablename__ = "entity"

    id: Mapped[uuid_mod.UUID] = mapped_column(Uuid, primary_key=True)
`,
    )
  })

  it('handles native type Decimal with precision/scale', () => {
    const models = [
      makeModel('Product', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'price',
          type: 'Decimal',
          nativeType: ['Decimal', [10, 2]],
        }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy import Numeric
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from decimal import Decimal as DecimalType


class Base(DeclarativeBase):
    pass


class Product(Base):
    __tablename__ = "product"

    id: Mapped[int] = mapped_column(primary_key=True)
    price: Mapped[DecimalType] = mapped_column(Numeric(precision=10, scale=2))
`,
    )
  })

  it('handles native type Text', () => {
    const models = [
      makeModel('Note', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'body',
          type: 'String',
          nativeType: ['Text', []],
        }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy import Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Note(Base):
    __tablename__ = "note"

    id: Mapped[int] = mapped_column(primary_key=True)
    body: Mapped[str] = mapped_column(Text)
`,
    )
  })

  it('handles native type SmallInt', () => {
    const models = [
      makeModel('Sensor', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'value',
          type: 'Int',
          nativeType: ['SmallInt', []],
        }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy import SmallInteger
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Sensor(Base):
    __tablename__ = "sensor"

    id: Mapped[int] = mapped_column(primary_key=True)
    value: Mapped[int] = mapped_column(SmallInteger)
`,
    )
  })

  it('handles native type DoublePrecision', () => {
    const models = [
      makeModel('Measurement', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'reading',
          type: 'Float',
          nativeType: ['DoublePrecision', []],
        }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy import Double
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Measurement(Base):
    __tablename__ = "measurement"

    id: Mapped[int] = mapped_column(primary_key=True)
    reading: Mapped[float] = mapped_column(Double)
`,
    )
  })

  it('handles native type Date', () => {
    const models = [
      makeModel('Birthday', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'day',
          type: 'DateTime',
          nativeType: ['Date', []],
        }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy import Date
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from datetime import datetime, date


class Base(DeclarativeBase):
    pass


class Birthday(Base):
    __tablename__ = "birthday"

    id: Mapped[int] = mapped_column(primary_key=True)
    day: Mapped[date] = mapped_column(Date)
`,
    )
  })

  it('handles native type Time', () => {
    const models = [
      makeModel('Schedule', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'startTime',
          type: 'DateTime',
          nativeType: ['Time', []],
        }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy import Time
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from datetime import datetime, time as time_type


class Base(DeclarativeBase):
    pass


class Schedule(Base):
    __tablename__ = "schedule"

    id: Mapped[int] = mapped_column(primary_key=True)
    start_time: Mapped[time_type] = mapped_column(Time)
`,
    )
  })

  it('handles native type JsonB', () => {
    const models = [
      makeModel('Doc', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({
          name: 'data',
          type: 'Json',
          nativeType: ['JsonB', []],
        }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Doc(Base):
    __tablename__ = "doc"

    id: Mapped[int] = mapped_column(primary_key=True)
    data: Mapped[dict]
`,
    )
  })

  it('skips models without primary key', () => {
    const models = [makeModel('NoId', [makeField({ name: 'value', type: 'String' })])]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass



`,
    )
  })

  it('handles many-to-many relations', () => {
    const postModel = makeModel('Post', [
      makeField({ name: 'id', type: 'Int', isId: true }),
      makeField({ name: 'title', type: 'String' }),
      makeField({
        name: 'tags',
        type: 'Tag',
        kind: 'object',
        isList: true,
        isRequired: false,
        relationName: 'PostToTag',
      }),
    ])

    const tagModel = makeModel('Tag', [
      makeField({ name: 'id', type: 'Int', isId: true }),
      makeField({ name: 'name', type: 'String' }),
      makeField({
        name: 'posts',
        type: 'Post',
        kind: 'object',
        isList: true,
        isRequired: false,
        relationName: 'PostToTag',
      }),
    ])

    expect(generateSingleFile([postModel, tagModel])).toBe(
      `from sqlalchemy import Column, ForeignKey, Integer, Table
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass

post_to_tag = Table(
    "_PostToTag",
    Base.metadata,
    Column("A", Integer, ForeignKey("post.id"), primary_key=True),
    Column("B", Integer, ForeignKey("tag.id"), primary_key=True),
)


class Post(Base):
    __tablename__ = "post"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str]

    tags: Mapped[list["Tag"]] = relationship(secondary=post_to_tag, back_populates="posts")

class Tag(Base):
    __tablename__ = "tag"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]

    posts: Mapped[list["Post"]] = relationship(secondary=post_to_tag, back_populates="tags")
`,
    )
  })

  it('handles composite primary key (@@id)', () => {
    const userModel = makeModel('User', [
      makeField({ name: 'id', type: 'String', isId: true }),
      makeField({ name: 'name', type: 'String' }),
      makeField({
        name: 'likes',
        type: 'Like',
        kind: 'object',
        isList: true,
        isRequired: false,
        relationName: 'LikeToUser',
      }),
    ])

    const postModel = makeModel('Post', [
      makeField({ name: 'id', type: 'String', isId: true }),
      makeField({ name: 'title', type: 'String' }),
      makeField({
        name: 'likes',
        type: 'Like',
        kind: 'object',
        isList: true,
        isRequired: false,
        relationName: 'LikeToPost',
      }),
    ])

    const likeModel = makeModel(
      'Like',
      [
        makeField({ name: 'userId', type: 'String' }),
        makeField({ name: 'postId', type: 'String' }),
        makeField({
          name: 'user',
          type: 'User',
          kind: 'object',
          isRequired: true,
          relationName: 'LikeToUser',
          relationFromFields: ['userId'],
          relationToFields: ['id'],
        }),
        makeField({
          name: 'post',
          type: 'Post',
          kind: 'object',
          isRequired: true,
          relationName: 'LikeToPost',
          relationFromFields: ['postId'],
          relationToFields: ['id'],
        }),
      ],
      { primaryKey: { name: null, fields: ['userId', 'postId'] } as unknown as DMMF.PrimaryKey },
    )

    expect(generateSingleFile([userModel, postModel, likeModel])).toBe(
      `from sqlalchemy import ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "user"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]

    likes: Mapped[list["Like"]] = relationship(back_populates="user")

class Post(Base):
    __tablename__ = "post"

    id: Mapped[str] = mapped_column(primary_key=True)
    title: Mapped[str]

    likes: Mapped[list["Like"]] = relationship(back_populates="post")

class Like(Base):
    __tablename__ = "like"

    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"), primary_key=True)
    post_id: Mapped[str] = mapped_column(ForeignKey("post.id"), primary_key=True)

    user: Mapped["User"] = relationship(back_populates="likes")
    post: Mapped["Post"] = relationship(back_populates="likes")
`,
    )
  })

  it('handles self-referencing relations with foreign_keys disambiguation', () => {
    const userModel = makeModel('User', [
      makeField({ name: 'id', type: 'String', isId: true }),
      makeField({ name: 'name', type: 'String' }),
      makeField({
        name: 'followers',
        type: 'Follow',
        kind: 'object',
        isList: true,
        isRequired: false,
        relationName: 'Follower',
      }),
      makeField({
        name: 'following',
        type: 'Follow',
        kind: 'object',
        isList: true,
        isRequired: false,
        relationName: 'Following',
      }),
    ])

    const followModel = makeModel('Follow', [
      makeField({ name: 'id', type: 'String', isId: true }),
      makeField({ name: 'followerId', type: 'String' }),
      makeField({ name: 'followingId', type: 'String' }),
      makeField({
        name: 'follower',
        type: 'User',
        kind: 'object',
        isRequired: true,
        relationName: 'Following',
        relationFromFields: ['followerId'],
        relationToFields: ['id'],
      }),
      makeField({
        name: 'following',
        type: 'User',
        kind: 'object',
        isRequired: true,
        relationName: 'Follower',
        relationFromFields: ['followingId'],
        relationToFields: ['id'],
      }),
    ])

    expect(generateSingleFile([userModel, followModel])).toBe(
      `from sqlalchemy import ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "user"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]

    followers: Mapped[list["Follow"]] = relationship(foreign_keys="Follow.following_id", back_populates="following")
    following: Mapped[list["Follow"]] = relationship(foreign_keys="Follow.follower_id", back_populates="follower")

class Follow(Base):
    __tablename__ = "follow"

    id: Mapped[str] = mapped_column(primary_key=True)
    follower_id: Mapped[str] = mapped_column(ForeignKey("user.id"))
    following_id: Mapped[str] = mapped_column(ForeignKey("user.id"))

    follower: Mapped["User"] = relationship(foreign_keys=[follower_id], back_populates="following")
    following: Mapped["User"] = relationship(foreign_keys=[following_id], back_populates="followers")
`,
    )
  })

  it('handles multiple models together', () => {
    const models = [
      makeModel('User', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'name', type: 'String' }),
      ]),
      makeModel('Post', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'title', type: 'String' }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]

class Post(Base):
    __tablename__ = "post"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str]
`,
    )
  })

  it('handles Bytes and Json types', () => {
    const models = [
      makeModel('Blob', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'data', type: 'Bytes' }),
        makeField({ name: 'meta', type: 'Json' }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Blob(Base):
    __tablename__ = "blob"

    id: Mapped[int] = mapped_column(primary_key=True)
    data: Mapped[bytes]
    meta: Mapped[dict]
`,
    )
  })

  it('handles BigInt and Float types', () => {
    const models = [
      makeModel('Metric', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'counter', type: 'BigInt' }),
        makeField({ name: 'rate', type: 'Float' }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Metric(Base):
    __tablename__ = "metric"

    id: Mapped[int] = mapped_column(primary_key=True)
    counter: Mapped[int]
    rate: Mapped[float]
`,
    )
  })

  it('handles field with dbName (@map)', () => {
    const models = [
      makeModel('User', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'firstName', type: 'String', dbName: 'first_name' }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "user"

    id: Mapped[int] = mapped_column(primary_key=True)
    first_name: Mapped[str]
`,
    )
  })

  it('handles combined: createdAt + updatedAt + optional + unique + default', () => {
    const models = [
      makeModel('Article', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'title', type: 'String' }),
        makeField({ name: 'slug', type: 'String', isUnique: true }),
        makeField({ name: 'body', type: 'String', isRequired: false }),
        makeField({
          name: 'published',
          type: 'Boolean',
          hasDefaultValue: true,
          default: false,
        }),
        makeField({
          name: 'createdAt',
          type: 'DateTime',
          hasDefaultValue: true,
          default: { name: 'now', args: [] },
        }),
        makeField({ name: 'updatedAt', type: 'DateTime', isUpdatedAt: true }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy import func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from typing import Optional
from datetime import datetime


class Base(DeclarativeBase):
    pass


class Article(Base):
    __tablename__ = "article"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str]
    slug: Mapped[str] = mapped_column(unique=True)
    body: Mapped[Optional[str]]
    published: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(onupdate=func.now())
`,
    )
  })
})

// ============================================================================
// sqlalchemySchemas (backward compat)
// ============================================================================

describe('sqlalchemySchemas (backward compat)', () => {
  it('delegates to generateSingleFile', () => {
    const models = [
      makeModel('User', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'name', type: 'String' }),
      ]),
    ]
    const a = generateSingleFile(models)
    const b = sqlalchemySchemas(models)
    expect(a).toStrictEqual(b)
  })

  it('uses allModels when provided', () => {
    const user = makeModel('User', [
      makeField({ name: 'id', type: 'Int', isId: true }),
      makeField({ name: 'name', type: 'String' }),
    ])
    const post = makeModel('Post', [
      makeField({ name: 'id', type: 'Int', isId: true }),
      makeField({ name: 'title', type: 'String' }),
    ])
    const result = sqlalchemySchemas([user], [user, post])
    expect(result).toStrictEqual(generateSingleFile([user, post]))
  })
})
