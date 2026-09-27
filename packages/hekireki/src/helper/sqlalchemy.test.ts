import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import { generateSingleFile } from '../generator/sqlalchemy.js'
import { prismaTypeToPythonType, prismaTypeToSQLAlchemyType, pythonAttrName } from './sqlalchemy.js'

// What a PostgreSQL module with a DateTime carries above its models: the type every DateTime is
// read through, as UTC, and the base that maps a plain `Mapped[datetime]` to it.
const UTC_DATE_TIME = `class UtcDateTime(TypeDecorator[datetime]):
    impl = TIMESTAMP
    cache_ok = True

    def process_bind_param(self, value: Optional[datetime], dialect: Dialect) -> Optional[datetime]:
        if value is None or value.tzinfo is None:
            return value
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value: Optional[datetime], dialect: Dialect) -> Optional[datetime]:
        return None if value is None else value.replace(tzinfo=timezone.utc)


`
const UTC_DATE_TIME_TZ = `class UtcDateTimeTz(TypeDecorator[datetime]):
    impl = TIMESTAMP
    cache_ok = True

    def __init__(self, precision: Optional[int] = None) -> None:
        super().__init__(timezone=True, precision=precision)

    def process_bind_param(self, value: Optional[datetime], dialect: Dialect) -> Optional[datetime]:
        return value if value is None or value.tzinfo else value.replace(tzinfo=timezone.utc)

    def process_result_value(self, value: Optional[datetime], dialect: Dialect) -> Optional[datetime]:
        return None if value is None else value.astimezone(timezone.utc)


`
const UTC_NOW = `def utc_now() -> datetime:
    return datetime.now(timezone.utc)


`
const UTC_BASE = `class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})
    type_annotation_map = {datetime: UtcDateTime(precision=3)}
`

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

  it('maps Json to dict[str, Any]', () => {
    expect(prismaTypeToPythonType('Json')).toStrictEqual('dict[str, Any]')
  })

  it('maps Bytes to bytes', () => {
    expect(prismaTypeToPythonType('Bytes')).toStrictEqual('bytes')
  })

  it('maps unknown type to str', () => {
    expect(prismaTypeToPythonType('Unknown')).toStrictEqual('str')
  })
})

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
  }
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

describe('generateSingleFile', () => {
  it('generates a simple model with id and string field', () => {
    const models = [
      makeModel('User', [
        makeField({ name: 'id', type: 'String', isId: true }),
        makeField({ name: 'name', type: 'String' }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy import MetaData, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})
    type_annotation_map = {str: Text}


class User(Base):
    __tablename__ = "User"

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
      `from sqlalchemy import MetaData, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from typing import Optional


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})
    type_annotation_map = {str: Text}


class Post(Base):
    __tablename__ = "Post"

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
      `from sqlalchemy import MetaData, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})
    type_annotation_map = {str: Text}


class Item(Base):
    __tablename__ = "Item"

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

    expect(
      generateSingleFile(models, undefined, [
        { model: 'Account', type: 'unique', isDefinedOnField: true, fields: [{ name: 'email' }] },
      ]),
    ).toBe(
      `from sqlalchemy import Index, MetaData, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})
    type_annotation_map = {str: Text}


class Account(Base):
    __tablename__ = "Account"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    email: Mapped[str]

    __table_args__ = (
        Index("Account_email_key", "email", unique=True),
    )
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
      `from sqlalchemy import Dialect, MetaData, TypeDecorator, text
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from typing import Optional
from datetime import datetime, timezone


${UTC_DATE_TIME}${UTC_NOW}${UTC_BASE}

class Event(Base):
    __tablename__ = "Event"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    created_at: Mapped[datetime] = mapped_column("createdAt", default=utc_now, server_default=text("CURRENT_TIMESTAMP"))
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
      `from sqlalchemy import Dialect, MetaData, TypeDecorator
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from typing import Optional
from datetime import datetime, timezone


${UTC_DATE_TIME}${UTC_NOW}${UTC_BASE}

class Record(Base):
    __tablename__ = "Record"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    updated_at: Mapped[datetime] = mapped_column("updatedAt", default=utc_now, onupdate=utc_now)
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
      `from sqlalchemy import MetaData, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})


class Setting(Base):
    __tablename__ = "Setting"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    active: Mapped[bool] = mapped_column(default=True, server_default=text("true"))
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
      `from sqlalchemy import MetaData, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})


class Flag(Base):
    __tablename__ = "Flag"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    enabled: Mapped[bool] = mapped_column(default=False, server_default=text("false"))
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
      `from sqlalchemy import MetaData, Text, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})
    type_annotation_map = {str: Text}


class Config(Base):
    __tablename__ = "Config"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    status: Mapped[str] = mapped_column(default="active", server_default=text("'active'"))
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
      `from sqlalchemy import MetaData, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})


class Limit(Base):
    __tablename__ = "Limit"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    max_retries: Mapped[int] = mapped_column("maxRetries", default=3, server_default=text("3"))
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
      },
    ]

    expect(generateSingleFile(models, enums)).toBe(
      `from sqlalchemy import Enum, MetaData
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})


class User(Base):
    __tablename__ = "User"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    role: Mapped[str] = mapped_column(Enum("ADMIN", "USER", name="Role"))
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
      },
    ]

    expect(generateSingleFile(models, enums)).toBe(
      `from sqlalchemy import Enum, MetaData, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})


class User(Base):
    __tablename__ = "User"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    role: Mapped[str] = mapped_column(Enum("ADMIN", "USER", name="Role"), default="USER", server_default=text("'USER'"))
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
      `from sqlalchemy import ForeignKey, MetaData, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})
    type_annotation_map = {str: Text}


class User(Base):
    __tablename__ = "User"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]

    posts: Mapped[list["Post"]] = relationship(passive_deletes="all", back_populates="user")

class Post(Base):
    __tablename__ = "Post"

    id: Mapped[str] = mapped_column(primary_key=True)
    title: Mapped[str]
    user_id: Mapped[str] = mapped_column("userId", ForeignKey("User.id", ondelete="RESTRICT", onupdate="CASCADE", name="Post_userId_fkey"))

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

    expect(
      generateSingleFile([userModel, profileModel], undefined, [
        { model: 'Profile', type: 'unique', isDefinedOnField: true, fields: [{ name: 'userId' }] },
      ]),
    ).toBe(
      `from sqlalchemy import ForeignKey, Index, MetaData, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})
    type_annotation_map = {str: Text}


class User(Base):
    __tablename__ = "User"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]

    profile: Mapped[Optional["Profile"]] = relationship(passive_deletes="all", back_populates="user")

class Profile(Base):
    __tablename__ = "Profile"

    id: Mapped[str] = mapped_column(primary_key=True)
    bio: Mapped[str]
    user_id: Mapped[str] = mapped_column("userId", ForeignKey("User.id", ondelete="RESTRICT", onupdate="CASCADE", name="Profile_userId_fkey"))

    __table_args__ = (
        Index("Profile_userId_key", "userId", unique=True),
    )

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
      `from sqlalchemy import MetaData, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})
    type_annotation_map = {str: Text}


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    display_name: Mapped[str] = mapped_column("displayName")
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

    expect(
      generateSingleFile(models, undefined, [
        {
          model: 'Membership',
          type: 'unique',
          isDefinedOnField: false,
          fields: [{ name: 'userId' }, { name: 'orgId' }],
        },
      ]),
    ).toBe(
      `from sqlalchemy import Index, MetaData, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})
    type_annotation_map = {str: Text}


class Membership(Base):
    __tablename__ = "Membership"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    user_id: Mapped[str] = mapped_column("userId")
    org_id: Mapped[str] = mapped_column("orgId")

    __table_args__ = (
        Index("Membership_userId_orgId_key", "userId", "orgId", unique=True),
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
      `from sqlalchemy import Index, MetaData, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})
    type_annotation_map = {str: Text}


class Article(Base):
    __tablename__ = "Article"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
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
          nativeType: ['VarChar', ['255']],
        }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy import MetaData, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})


class Tag(Base):
    __tablename__ = "Tag"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
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
          nativeType: ['Char', ['6']],
        }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy import CHAR, MetaData
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})


class Code(Base):
    __tablename__ = "Code"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    code: Mapped[str] = mapped_column(CHAR(6))
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
      `from sqlalchemy import MetaData, Uuid
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
import uuid as uuid_mod


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})


class Entity(Base):
    __tablename__ = "Entity"

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
          nativeType: ['Decimal', ['10', '2']],
        }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy import MetaData, Numeric
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from decimal import Decimal as DecimalType


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})


class Product(Base):
    __tablename__ = "Product"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
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
      `from sqlalchemy import MetaData, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})
    type_annotation_map = {str: Text}


class Note(Base):
    __tablename__ = "Note"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    body: Mapped[str]
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
      `from sqlalchemy import MetaData, SmallInteger
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})


class Sensor(Base):
    __tablename__ = "Sensor"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
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
      `from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})


class Measurement(Base):
    __tablename__ = "Measurement"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    reading: Mapped[float]
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
      `from sqlalchemy import Date, MetaData
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from datetime import date


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})


class Birthday(Base):
    __tablename__ = "Birthday"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
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
      `from sqlalchemy import MetaData, Time
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from datetime import time as time_type


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})


class Schedule(Base):
    __tablename__ = "Schedule"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    start_time: Mapped[time_type] = mapped_column("startTime", Time)
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
      `from sqlalchemy import MetaData
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from typing import Any


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})


class Doc(Base):
    __tablename__ = "Doc"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    data: Mapped[dict[str, Any]] = mapped_column(JSONB)
`,
    )
  })

  it('skips models without primary key', () => {
    const models = [makeModel('NoId', [makeField({ name: 'value', type: 'String' })])]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy import MetaData, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})
    type_annotation_map = {str: Text}



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
      `from sqlalchemy import Column, ForeignKey, Index, Integer, MetaData, PrimaryKeyConstraint, Table, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})
    type_annotation_map = {str: Text}

post_to_tag = Table(
    "_PostToTag",
    Base.metadata,
    Column("A", Integer, ForeignKey("Post.id", ondelete="CASCADE", onupdate="CASCADE", name="_PostToTag_A_fkey"), nullable=False),
    Column("B", Integer, ForeignKey("Tag.id", ondelete="CASCADE", onupdate="CASCADE", name="_PostToTag_B_fkey"), nullable=False),
    PrimaryKeyConstraint("A", "B", name="_PostToTag_AB_pkey"),
    Index("_PostToTag_B_index", "B"),
)


class Post(Base):
    __tablename__ = "Post"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    title: Mapped[str]

    tags: Mapped[list["Tag"]] = relationship(secondary=post_to_tag, back_populates="posts")

class Tag(Base):
    __tablename__ = "Tag"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
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
      `from sqlalchemy import ForeignKey, MetaData, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})
    type_annotation_map = {str: Text}


class User(Base):
    __tablename__ = "User"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]

    likes: Mapped[list["Like"]] = relationship(passive_deletes="all", back_populates="user")

class Post(Base):
    __tablename__ = "Post"

    id: Mapped[str] = mapped_column(primary_key=True)
    title: Mapped[str]

    likes: Mapped[list["Like"]] = relationship(passive_deletes="all", back_populates="post")

class Like(Base):
    __tablename__ = "Like"

    user_id: Mapped[str] = mapped_column("userId", ForeignKey("User.id", ondelete="RESTRICT", onupdate="CASCADE", name="Like_userId_fkey"), primary_key=True)
    post_id: Mapped[str] = mapped_column("postId", ForeignKey("Post.id", ondelete="RESTRICT", onupdate="CASCADE", name="Like_postId_fkey"), primary_key=True)

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
      `from sqlalchemy import ForeignKey, MetaData, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})
    type_annotation_map = {str: Text}


class User(Base):
    __tablename__ = "User"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]

    followers: Mapped[list["Follow"]] = relationship(foreign_keys="Follow.following_id", passive_deletes="all", back_populates="following")
    following: Mapped[list["Follow"]] = relationship(foreign_keys="Follow.follower_id", passive_deletes="all", back_populates="follower")

class Follow(Base):
    __tablename__ = "Follow"

    id: Mapped[str] = mapped_column(primary_key=True)
    follower_id: Mapped[str] = mapped_column("followerId", ForeignKey("User.id", ondelete="RESTRICT", onupdate="CASCADE", name="Follow_followerId_fkey"))
    following_id: Mapped[str] = mapped_column("followingId", ForeignKey("User.id", ondelete="RESTRICT", onupdate="CASCADE", name="Follow_followingId_fkey"))

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
      `from sqlalchemy import MetaData, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})
    type_annotation_map = {str: Text}


class User(Base):
    __tablename__ = "User"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    name: Mapped[str]

class Post(Base):
    __tablename__ = "Post"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
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
      `from sqlalchemy import MetaData
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from typing import Any


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})


class Blob(Base):
    __tablename__ = "Blob"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    data: Mapped[bytes]
    meta: Mapped[dict[str, Any]] = mapped_column(JSONB)
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
      `from sqlalchemy import BigInteger, MetaData
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})


class Metric(Base):
    __tablename__ = "Metric"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    counter: Mapped[int] = mapped_column(BigInteger)
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
      `from sqlalchemy import MetaData, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})
    type_annotation_map = {str: Text}


class User(Base):
    __tablename__ = "User"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
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

    expect(
      generateSingleFile(models, undefined, [
        { model: 'Article', type: 'unique', isDefinedOnField: true, fields: [{ name: 'slug' }] },
      ]),
    ).toBe(
      `from sqlalchemy import Dialect, Index, MetaData, Text, TypeDecorator, text
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from typing import Optional
from datetime import datetime, timezone


${UTC_DATE_TIME}${UTC_NOW}class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})
    type_annotation_map = {datetime: UtcDateTime(precision=3), str: Text}


class Article(Base):
    __tablename__ = "Article"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str]
    slug: Mapped[str]
    body: Mapped[Optional[str]]
    published: Mapped[bool] = mapped_column(default=False, server_default=text("false"))
    created_at: Mapped[datetime] = mapped_column("createdAt", default=utc_now, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[datetime] = mapped_column("updatedAt", default=utc_now, onupdate=utc_now)

    __table_args__ = (
        Index("Article_slug_key", "slug", unique=True),
    )
`,
    )
  })
})

describe('uuid default generation', () => {
  it('generates client-side defaults for uuid() and uuid(7) primary keys', () => {
    const models = [
      makeModel('User', [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [4] },
        }),
      ]),
      makeModel('Event', [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'uuid', args: [7] },
        }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy import MetaData, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
import uuid as uuid_mod
import uuid6


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})
    type_annotation_map = {str: Text}


class User(Base):
    __tablename__ = "User"

    id: Mapped[str] = mapped_column(primary_key=True, default=lambda: str(uuid_mod.uuid4()))

class Event(Base):
    __tablename__ = "Event"

    id: Mapped[str] = mapped_column(primary_key=True, default=lambda: str(uuid6.uuid7()))
`,
    )
  })
})

describe('ulid default generation', () => {
  it('generates a client-side ULID default for ulid() primary keys', () => {
    const models = [
      makeModel('Ticket', [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'ulid', args: [] },
        }),
        makeField({ name: 'label', type: 'String' }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(
      `from sqlalchemy import MetaData, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from ulid import ULID


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})
    type_annotation_map = {str: Text}


class Ticket(Base):
    __tablename__ = "Ticket"

    id: Mapped[str] = mapped_column(primary_key=True, default=lambda: str(ULID()))
    label: Mapped[str]
`,
    )
  })
})

describe('named implicit many-to-many', () => {
  it('names the association table after the Prisma relation name', () => {
    const models = [
      makeModel('Post', [
        makeField({ name: 'id', type: 'String', isId: true }),
        makeField({
          name: 'tags',
          type: 'Tag',
          kind: 'object',
          isList: true,
          relationName: 'PostTags',
        }),
      ]),
      makeModel('Tag', [
        makeField({ name: 'id', type: 'String', isId: true }),
        makeField({
          name: 'posts',
          type: 'Post',
          kind: 'object',
          isList: true,
          relationName: 'PostTags',
        }),
      ]),
    ]

    expect(generateSingleFile(models))
      .toBe(`from sqlalchemy import Column, ForeignKey, Index, MetaData, PrimaryKeyConstraint, Table, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})
    type_annotation_map = {str: Text}

post_tags = Table(
    "_PostTags",
    Base.metadata,
    Column("A", Text, ForeignKey("Post.id", ondelete="CASCADE", onupdate="CASCADE", name="_PostTags_A_fkey"), nullable=False),
    Column("B", Text, ForeignKey("Tag.id", ondelete="CASCADE", onupdate="CASCADE", name="_PostTags_B_fkey"), nullable=False),
    PrimaryKeyConstraint("A", "B", name="_PostTags_AB_pkey"),
    Index("_PostTags_B_index", "B"),
)


class Post(Base):
    __tablename__ = "Post"

    id: Mapped[str] = mapped_column(primary_key=True)

    tags: Mapped[list["Tag"]] = relationship(secondary=post_tags, back_populates="posts")

class Tag(Base):
    __tablename__ = "Tag"

    id: Mapped[str] = mapped_column(primary_key=True)

    posts: Mapped[list["Post"]] = relationship(secondary=post_tags, back_populates="tags")
`)
  })
})

describe('timestamptz native type', () => {
  it('emits the UTC timestamptz type for @db.Timestamptz', () => {
    const models = [
      makeModel('Sensor', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          hasDefaultValue: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({
          name: 'seenAt',
          type: 'DateTime',
          isRequired: false,
          nativeType: ['Timestamptz', ['6']],
        }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(`from sqlalchemy import Dialect, MetaData, TypeDecorator
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from typing import Optional
from datetime import datetime, timezone


${UTC_DATE_TIME_TZ}class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})


class Sensor(Base):
    __tablename__ = "Sensor"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    seen_at: Mapped[Optional[datetime]] = mapped_column("seenAt", UtcDateTimeTz(precision=6))
`)
  })
})

/**
 * Prisma type, the attribute as written, its DMMF nativeType, everything the file carries above
 * the column (the imports each type pulls in) and the mapped attribute line itself.
 */
const NATIVE_TYPES: readonly (readonly [
  string,
  string,
  readonly [string, readonly string[]],
  string,
  string,
])[] = [
  [
    'String',
    '@db.VarChar(255)',
    ['VarChar', ['255']],
    'from sqlalchemy import MetaData, String\nfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column\n\n\nclass Base(DeclarativeBase):\n    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})\n\n\nclass Row(Base):\n    __tablename__ = "Row"\n\n',
    'Mapped[str] = mapped_column(String(255))\n',
  ],
  [
    'String',
    '@db.VarChar',
    ['VarChar', []],
    'from sqlalchemy import MetaData, String\nfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column\n\n\nclass Base(DeclarativeBase):\n    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})\n\n\nclass Row(Base):\n    __tablename__ = "Row"\n\n',
    'Mapped[str] = mapped_column(String)\n',
  ],
  [
    'String',
    '@db.Char(10)',
    ['Char', ['10']],
    'from sqlalchemy import CHAR, MetaData\nfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column\n\n\nclass Base(DeclarativeBase):\n    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})\n\n\nclass Row(Base):\n    __tablename__ = "Row"\n\n',
    'Mapped[str] = mapped_column(CHAR(10))\n',
  ],
  [
    'String',
    '@db.Char',
    ['Char', []],
    'from sqlalchemy import CHAR, MetaData\nfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column\n\n\nclass Base(DeclarativeBase):\n    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})\n\n\nclass Row(Base):\n    __tablename__ = "Row"\n\n',
    'Mapped[str] = mapped_column(CHAR)\n',
  ],
  [
    'String',
    '@db.Text',
    ['Text', []],
    'from sqlalchemy import MetaData, Text\nfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column\n\n\nclass Base(DeclarativeBase):\n    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})\n    type_annotation_map = {str: Text}\n\n\nclass Row(Base):\n    __tablename__ = "Row"\n\n',
    'Mapped[str]\n',
  ],
  [
    'String',
    '@db.MediumText',
    ['MediumText', []],
    'from sqlalchemy import MetaData\nfrom sqlalchemy.dialects.postgresql import MEDIUMTEXT\nfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column\n\n\nclass Base(DeclarativeBase):\n    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})\n\n\nclass Row(Base):\n    __tablename__ = "Row"\n\n',
    'Mapped[str] = mapped_column(MEDIUMTEXT)\n',
  ],
  [
    'String',
    '@db.LongText',
    ['LongText', []],
    'from sqlalchemy import MetaData\nfrom sqlalchemy.dialects.postgresql import LONGTEXT\nfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column\n\n\nclass Base(DeclarativeBase):\n    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})\n\n\nclass Row(Base):\n    __tablename__ = "Row"\n\n',
    'Mapped[str] = mapped_column(LONGTEXT)\n',
  ],
  [
    'String',
    '@db.TinyText',
    ['TinyText', []],
    'from sqlalchemy import MetaData\nfrom sqlalchemy.dialects.postgresql import TINYTEXT\nfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column\n\n\nclass Base(DeclarativeBase):\n    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})\n\n\nclass Row(Base):\n    __tablename__ = "Row"\n\n',
    'Mapped[str] = mapped_column(TINYTEXT)\n',
  ],
  [
    'Int',
    '@db.SmallInt',
    ['SmallInt', []],
    'from sqlalchemy import MetaData, SmallInteger\nfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column\n\n\nclass Base(DeclarativeBase):\n    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})\n\n\nclass Row(Base):\n    __tablename__ = "Row"\n\n',
    'Mapped[int] = mapped_column(SmallInteger)\n',
  ],
  [
    'Int',
    '@db.TinyInt',
    ['TinyInt', []],
    'from sqlalchemy import MetaData\nfrom sqlalchemy.dialects.postgresql import TINYINT\nfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column\n\n\nclass Base(DeclarativeBase):\n    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})\n\n\nclass Row(Base):\n    __tablename__ = "Row"\n\n',
    'Mapped[int] = mapped_column(TINYINT)\n',
  ],
  [
    'Int',
    '@db.MediumInt',
    ['MediumInt', []],
    'from sqlalchemy import MetaData\nfrom sqlalchemy.dialects.postgresql import MEDIUMINT\nfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column\n\n\nclass Base(DeclarativeBase):\n    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})\n\n\nclass Row(Base):\n    __tablename__ = "Row"\n\n',
    'Mapped[int] = mapped_column(MEDIUMINT)\n',
  ],
  [
    'Float',
    '@db.DoublePrecision',
    ['DoublePrecision', []],
    'from sqlalchemy import MetaData\nfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column\n\n\nclass Base(DeclarativeBase):\n    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})\n\n\nclass Row(Base):\n    __tablename__ = "Row"\n\n',
    'Mapped[float]\n',
  ],
  [
    'Float',
    '@db.Double',
    ['Double', []],
    'from sqlalchemy import MetaData\nfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column\n\n\nclass Base(DeclarativeBase):\n    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})\n\n\nclass Row(Base):\n    __tablename__ = "Row"\n\n',
    'Mapped[float]\n',
  ],
  [
    'Float',
    '@db.Real',
    ['Real', []],
    'from sqlalchemy import MetaData, REAL\nfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column\n\n\nclass Base(DeclarativeBase):\n    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})\n\n\nclass Row(Base):\n    __tablename__ = "Row"\n\n',
    'Mapped[float] = mapped_column(REAL)\n',
  ],
  [
    'Decimal',
    '@db.Decimal(10, 2)',
    ['Decimal', ['10', '2']],
    'from sqlalchemy import MetaData, Numeric\nfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column\nfrom decimal import Decimal as DecimalType\n\n\nclass Base(DeclarativeBase):\n    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})\n\n\nclass Row(Base):\n    __tablename__ = "Row"\n\n',
    'Mapped[DecimalType] = mapped_column(Numeric(precision=10, scale=2))\n',
  ],
  [
    'Decimal',
    '@db.Decimal',
    ['Decimal', []],
    'from sqlalchemy import MetaData, Numeric\nfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column\nfrom decimal import Decimal as DecimalType\n\n\nclass Base(DeclarativeBase):\n    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})\n\n\nclass Row(Base):\n    __tablename__ = "Row"\n\n',
    'Mapped[DecimalType] = mapped_column(Numeric)\n',
  ],
  [
    'Decimal',
    '@db.Money(10, 2)',
    ['Money', ['10', '2']],
    'from sqlalchemy import MetaData\nfrom sqlalchemy.dialects.postgresql import MONEY\nfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column\nfrom decimal import Decimal as DecimalType\n\n\nclass Base(DeclarativeBase):\n    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})\n\n\nclass Row(Base):\n    __tablename__ = "Row"\n\n',
    'Mapped[DecimalType] = mapped_column(MONEY)\n',
  ],
  [
    'String',
    '@db.Uuid',
    ['Uuid', []],
    'from sqlalchemy import MetaData, Uuid\nfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column\nimport uuid as uuid_mod\n\n\nclass Base(DeclarativeBase):\n    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})\n\n\nclass Row(Base):\n    __tablename__ = "Row"\n\n',
    'Mapped[uuid_mod.UUID] = mapped_column(Uuid)\n',
  ],
  [
    'DateTime',
    '@db.Timestamp',
    ['Timestamp', []],
    `from sqlalchemy import Dialect, MetaData, TypeDecorator\nfrom sqlalchemy.dialects.postgresql import TIMESTAMP\nfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column\nfrom typing import Optional\nfrom datetime import datetime, timezone\n\n\n${UTC_DATE_TIME}${UTC_BASE}\n\nclass Row(Base):\n    __tablename__ = "Row"\n\n`,
    'Mapped[datetime] = mapped_column(UtcDateTime())\n',
  ],
  [
    'DateTime',
    '@db.Timestamptz',
    ['Timestamptz', []],
    `from sqlalchemy import Dialect, MetaData, TypeDecorator\nfrom sqlalchemy.dialects.postgresql import TIMESTAMP\nfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column\nfrom typing import Optional\nfrom datetime import datetime, timezone\n\n\n${UTC_DATE_TIME_TZ}class Base(DeclarativeBase):\n    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})\n\n\nclass Row(Base):\n    __tablename__ = "Row"\n\n`,
    'Mapped[datetime] = mapped_column(UtcDateTimeTz())\n',
  ],
  [
    'DateTime',
    '@db.Date',
    ['Date', []],
    'from sqlalchemy import Date, MetaData\nfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column\nfrom datetime import date\n\n\nclass Base(DeclarativeBase):\n    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})\n\n\nclass Row(Base):\n    __tablename__ = "Row"\n\n',
    'Mapped[date] = mapped_column(Date)\n',
  ],
  [
    'DateTime',
    '@db.Time',
    ['Time', []],
    'from sqlalchemy import MetaData, Time\nfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column\nfrom datetime import time as time_type\n\n\nclass Base(DeclarativeBase):\n    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})\n\n\nclass Row(Base):\n    __tablename__ = "Row"\n\n',
    'Mapped[time_type] = mapped_column(Time)\n',
  ],
  [
    'DateTime',
    '@db.Timetz',
    ['Timetz', []],
    'from sqlalchemy import MetaData, Time\nfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column\nfrom datetime import time as time_type\n\n\nclass Base(DeclarativeBase):\n    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})\n\n\nclass Row(Base):\n    __tablename__ = "Row"\n\n',
    'Mapped[time_type] = mapped_column(Time(timezone=True))\n',
  ],
  [
    'DateTime',
    '@db.Time(3)',
    ['Time', ['3']],
    'from sqlalchemy import MetaData\nfrom sqlalchemy.dialects.postgresql import TIME\nfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column\nfrom datetime import time as time_type\n\n\nclass Base(DeclarativeBase):\n    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})\n\n\nclass Row(Base):\n    __tablename__ = "Row"\n\n',
    'Mapped[time_type] = mapped_column(TIME(precision=3))\n',
  ],
  [
    'DateTime',
    '@db.Timetz(6)',
    ['Timetz', ['6']],
    'from sqlalchemy import MetaData\nfrom sqlalchemy.dialects.postgresql import TIME\nfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column\nfrom datetime import time as time_type\n\n\nclass Base(DeclarativeBase):\n    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})\n\n\nclass Row(Base):\n    __tablename__ = "Row"\n\n',
    'Mapped[time_type] = mapped_column(TIME(precision=6, timezone=True))\n',
  ],
  [
    'Json',
    '@db.JsonB',
    ['JsonB', []],
    'from sqlalchemy import MetaData\nfrom sqlalchemy.dialects.postgresql import JSONB\nfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column\nfrom typing import Any\n\n\nclass Base(DeclarativeBase):\n    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})\n\n\nclass Row(Base):\n    __tablename__ = "Row"\n\n',
    'Mapped[dict[str, Any]] = mapped_column(JSONB)\n',
  ],
  [
    'String',
    '@db.Xml',
    ['Xml', []],
    'from sqlalchemy import MetaData, Text\nfrom sqlalchemy.ext.compiler import compiles\nfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column\nfrom typing import Any\n\n\nclass Xml(Text):\n    pass\n\n\n@compiles(Xml)\ndef xml_ddl(type_: Xml, compiler: Any, **kw: Any) -> str:\n    return "XML"\n\n\nclass Base(DeclarativeBase):\n    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})\n\n\nclass Row(Base):\n    __tablename__ = "Row"\n\n',
    'Mapped[str] = mapped_column(Xml)\n',
  ],
  [
    'String',
    '@db.Nope',
    ['Nope', []],
    'from sqlalchemy import MetaData, Text\nfrom sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column\n\n\nclass Base(DeclarativeBase):\n    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})\n    type_annotation_map = {str: Text}\n\n\nclass Row(Base):\n    __tablename__ = "Row"\n\n',
    'Mapped[str]\n',
  ],
]

// `@db.*` is the only way a Prisma schema pins a column type, and SQLAlchemy spells each one
// differently again - some of them pulling an import of their own. Nothing else covers this
// table, so a dropped case would silently widen the column the DDL creates.
describe('native database types', () => {
  it.each(NATIVE_TYPES)('maps %s `%s`', (type, _attribute, nativeType, header, column) => {
    const models: DMMF.Model[] = [
      {
        name: 'Row',
        dbName: null,
        schema: null,
        primaryKey: null,
        uniqueFields: [],
        uniqueIndexes: [],
        isGenerated: false,
        fields: [
          {
            name: 'id',
            type: 'Int',
            kind: 'scalar',
            isId: true,
            isList: false,
            isRequired: true,
            isUnique: false,
            isReadOnly: false,
            isGenerated: false,
            isUpdatedAt: false,
            hasDefaultValue: false,
          },
          {
            name: 'value',
            type,
            nativeType,
            kind: 'scalar',
            isId: false,
            isList: false,
            isRequired: true,
            isUnique: false,
            isReadOnly: false,
            isGenerated: false,
            isUpdatedAt: false,
            hasDefaultValue: false,
          },
        ],
      },
    ]
    expect(generateSingleFile(models, [], [])).toBe(
      `${header}    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)\n    value: ${column}`,
    )
  })
})

// A column whose name is a Python keyword, or one DeclarativeBase already owns, cannot be the
// attribute name; the real column travels in the first positional argument instead.
describe('pythonAttrName', () => {
  it.each(['class', 'def', 'import', 'from', 'lambda', 'None', 'metadata', 'registry', 'self'])(
    'renames the reserved column %s',
    (name) => {
      expect(pythonAttrName(name)).toBe(`${name}_`)
    },
  )

  it.each(['email', 'createdAt', 'Class', 'metadata_'])('leaves %s alone', (name) => {
    expect(pythonAttrName(name)).toBe(name)
  })
})

// Corners examples/sqlalchemy runs against SQLite: each of these once imported, configured or
// behaved differently from the tables Prisma made.
describe('relations as the database has them', () => {
  const account = (extra: DMMF.Field[]) =>
    makeModel('Account', [makeField({ name: 'id', type: 'Int', isId: true }), ...extra], {
      dbName: 'accounts',
    })

  it('gives a relation named after a Python keyword a trailing underscore, on both sides', () => {
    const models = [
      account([
        makeField({
          name: 'sent',
          type: 'Transfer',
          kind: 'object',
          isList: true,
          relationName: 'Sent',
        }),
        makeField({
          name: 'received',
          type: 'Transfer',
          kind: 'object',
          isList: true,
          relationName: 'Received',
        }),
      ]),
      makeModel('Transfer', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'fromId', type: 'Int' }),
        makeField({
          name: 'from',
          type: 'Account',
          kind: 'object',
          relationName: 'Sent',
          relationFromFields: ['fromId'],
          relationToFields: ['id'],
          relationOnDelete: 'NoAction',
        }),
        makeField({ name: 'toId', type: 'Int' }),
        makeField({
          name: 'to',
          type: 'Account',
          kind: 'object',
          relationName: 'Received',
          relationFromFields: ['toId'],
          relationToFields: ['id'],
          relationOnDelete: 'Cascade',
        }),
      ]),
    ]

    expect(generateSingleFile(models)).toBe(`from sqlalchemy import ForeignKey, MetaData
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)

    sent: Mapped[list["Transfer"]] = relationship(foreign_keys="Transfer.from_id", passive_deletes="all", back_populates="from_")
    received: Mapped[list["Transfer"]] = relationship(foreign_keys="Transfer.to_id", cascade="all, delete", passive_deletes=True, back_populates="to")

class Transfer(Base):
    __tablename__ = "Transfer"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    from_id: Mapped[int] = mapped_column("fromId", ForeignKey("accounts.id", ondelete="NO ACTION", onupdate="CASCADE", name="Transfer_fromId_fkey"))
    to_id: Mapped[int] = mapped_column("toId", ForeignKey("accounts.id", ondelete="CASCADE", onupdate="CASCADE", name="Transfer_toId_fkey"))

    from_: Mapped["Account"] = relationship(foreign_keys=[from_id], back_populates="sent")
    to: Mapped["Account"] = relationship(foreign_keys=[to_id], back_populates="received")
`)
  })

  it('writes the actions Prisma Migrate implies when the schema names none', () => {
    const models = [
      account([
        makeField({
          name: 'orders',
          type: 'Order',
          kind: 'object',
          isList: true,
          relationName: 'Buyer',
        }),
        makeField({
          name: 'notes',
          type: 'Order',
          kind: 'object',
          isList: true,
          relationName: 'Reviewer',
        }),
      ]),
      makeModel('Order', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'buyerId', type: 'Int' }),
        makeField({
          name: 'buyer',
          type: 'Account',
          kind: 'object',
          relationName: 'Buyer',
          relationFromFields: ['buyerId'],
          relationToFields: ['id'],
        }),
        makeField({ name: 'reviewerId', type: 'Int', isRequired: false }),
        makeField({
          name: 'reviewer',
          type: 'Account',
          kind: 'object',
          isRequired: false,
          relationName: 'Reviewer',
          relationFromFields: ['reviewerId'],
          relationToFields: ['id'],
        }),
      ]),
    ]

    const code = generateSingleFile(models)
    // Required: RESTRICT, which the session leaves to the database instead of nulling the key.
    expect(code).toContain(
      'buyer_id: Mapped[int] = mapped_column("buyerId", ForeignKey("accounts.id", ondelete="RESTRICT", onupdate="CASCADE", name="Order_buyerId_fkey"))',
    )
    expect(code).toContain(
      'orders: Mapped[list["Order"]] = relationship(foreign_keys="Order.buyer_id", passive_deletes="all", back_populates="buyer")',
    )
    // Optional: SET NULL, which is what the session does on its own.
    expect(code).toContain(
      'reviewer_id: Mapped[Optional[int]] = mapped_column("reviewerId", ForeignKey("accounts.id", ondelete="SET NULL", onupdate="CASCADE", name="Order_reviewerId_fkey"))',
    )
    expect(code).toContain(
      'notes: Mapped[list["Order"]] = relationship(foreign_keys="Order.reviewer_id", back_populates="reviewer")',
    )
  })

  it('cascades a 1-1 delete in the session and leaves the rest to the database', () => {
    const models = [
      account([
        makeField({
          name: 'profile',
          type: 'Profile',
          kind: 'object',
          isRequired: false,
          relationName: 'P',
        }),
      ]),
      makeModel('Profile', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'accountId', type: 'Int', isUnique: true }),
        makeField({
          name: 'account',
          type: 'Account',
          kind: 'object',
          relationName: 'P',
          relationFromFields: ['accountId'],
          relationToFields: ['id'],
          relationOnDelete: 'Cascade',
        }),
      ]),
    ]

    expect(generateSingleFile(models)).toContain(
      'profile: Mapped[Optional["Profile"]] = relationship(cascade="all, delete", passive_deletes=True, back_populates="account")',
    )
  })

  // Prisma Client writes `ann.following.connect(bob)` as A = bob, B = ann: the field whose name
  // sorts first lists the B of the rows whose A is the row.
  it('tells a self many-to-many which join column holds the row', () => {
    const models = [
      account([
        makeField({
          name: 'following',
          type: 'Account',
          kind: 'object',
          isList: true,
          relationName: 'Follows',
        }),
        makeField({
          name: 'followers',
          type: 'Account',
          kind: 'object',
          isList: true,
          relationName: 'Follows',
        }),
      ]),
    ]

    expect(generateSingleFile(models))
      .toBe(`from sqlalchemy import Column, ForeignKey, Index, Integer, MetaData, PrimaryKeyConstraint, Table
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention={"pk": "%(table_name)s_pkey"})

follows = Table(
    "_Follows",
    Base.metadata,
    Column("A", Integer, ForeignKey("accounts.id", ondelete="CASCADE", onupdate="CASCADE", name="_Follows_A_fkey"), nullable=False),
    Column("B", Integer, ForeignKey("accounts.id", ondelete="CASCADE", onupdate="CASCADE", name="_Follows_B_fkey"), nullable=False),
    PrimaryKeyConstraint("A", "B", name="_Follows_AB_pkey"),
    Index("_Follows_B_index", "B"),
)


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)

    following: Mapped[list["Account"]] = relationship(secondary=follows, primaryjoin=lambda: Account.id == follows.c.B, secondaryjoin=lambda: Account.id == follows.c.A, back_populates="followers")
    followers: Mapped[list["Account"]] = relationship(secondary=follows, primaryjoin=lambda: Account.id == follows.c.A, secondaryjoin=lambda: Account.id == follows.c.B, back_populates="following")
`)
  })

  it('stores the None of an optional Json as NULL, and of a required one as JSON null', () => {
    const models = [
      makeModel('Row', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'data', type: 'Json' }),
        makeField({ name: 'extra', type: 'Json', isRequired: false }),
      ]),
    ]

    const code = generateSingleFile(models)
    expect(code).toContain('    data: Mapped[dict[str, Any]] = mapped_column(JSONB)\n')
    expect(code).toContain(
      '    extra: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB(none_as_null=True))\n',
    )
  })
})

// Prisma Client reads and writes a DateTime as a UTC instant, whatever the process's or the
// session's time zone: the module makes every DateTime an aware UTC datetime, on each provider's
// own storage of it.
describe('DateTime per provider', () => {
  const now = { hasDefaultValue: true, default: { name: 'now', args: [] } }

  it('keeps SQLite DateTime as the UTC text Prisma writes', () => {
    const models = [
      makeModel('Row', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'at', type: 'DateTime', ...now }),
        makeField({ name: 'seen', type: 'DateTime', isRequired: false, isUpdatedAt: true }),
      ]),
    ]

    expect(generateSingleFile(models, [], [], 'sqlite'))
      .toBe(`from sqlalchemy import Dialect, String, TypeDecorator, text
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from typing import Any, Optional
from datetime import datetime, timezone


class UtcDateTime(TypeDecorator[datetime]):
    impl = String
    cache_ok = True

    def process_bind_param(self, value: Optional[datetime], dialect: Dialect) -> Optional[str]:
        if value is None:
            return None
        aware = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return aware.astimezone(timezone.utc).isoformat(timespec="milliseconds")

    def process_result_value(self, value: Optional[str], dialect: Dialect) -> Optional[datetime]:
        if value is None:
            return None
        read = datetime.fromisoformat(value)
        return read.replace(tzinfo=timezone.utc) if read.tzinfo is None else read.astimezone(timezone.utc)


@compiles(UtcDateTime)
def utc_date_time_ddl(type_: UtcDateTime, compiler: Any, **kw: Any) -> str:
    return "DATETIME"


${UTC_NOW}class Base(DeclarativeBase):
    type_annotation_map = {datetime: UtcDateTime}


class Row(Base):
    __tablename__ = "Row"

    id: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[datetime] = mapped_column(default=utc_now, server_default=text("CURRENT_TIMESTAMP"))
    seen: Mapped[Optional[datetime]] = mapped_column(default=utc_now, onupdate=utc_now)

    __table_args__ = (
        {"sqlite_autoincrement": True},
    )
`)
  })

  it('gives MySQL DATETIME its precision and undoes the session zone on a TIMESTAMP', () => {
    const models = [
      makeModel('Row', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'at', type: 'DateTime', ...now }),
        makeField({ name: 'ts', type: 'DateTime', nativeType: ['Timestamp', ['3']], ...now }),
        makeField({ name: 'ts0', type: 'DateTime', nativeType: ['Timestamp', []], ...now }),
        makeField({ name: 'dt6', type: 'DateTime', nativeType: ['DateTime', ['6']] }),
      ]),
    ]

    expect(generateSingleFile(models, [], [], 'mysql'))
      .toBe(`from sqlalchemy import BindParameter, ColumnElement, DateTime, Dialect, TypeDecorator, func, text
from sqlalchemy.dialects.mysql import DATETIME, TIMESTAMP
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from typing import Optional
from datetime import datetime, timezone


class UtcDateTime(TypeDecorator[datetime]):
    impl: type[DateTime] = DATETIME
    cache_ok = True

    def process_bind_param(self, value: Optional[datetime], dialect: Dialect) -> Optional[datetime]:
        if value is None or value.tzinfo is None:
            return value
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value: Optional[datetime], dialect: Dialect) -> Optional[datetime]:
        return None if value is None else value.replace(tzinfo=timezone.utc)


class UtcTimestamp(UtcDateTime):
    impl = TIMESTAMP
    cache_ok = True

    def bind_expression(self, value: BindParameter[datetime]) -> ColumnElement[datetime]:
        return func.convert_tz(value, "+00:00", text("@@session.time_zone"), type_=self)

    def column_expression(self, column: ColumnElement[datetime]) -> ColumnElement[datetime]:
        return func.convert_tz(column, text("@@session.time_zone"), "+00:00", type_=self)


${UTC_NOW}class Base(DeclarativeBase):
    type_annotation_map = {datetime: UtcDateTime(fsp=3)}


class Row(Base):
    __tablename__ = "Row"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    at: Mapped[datetime] = mapped_column(default=utc_now, server_default=text("CURRENT_TIMESTAMP(3)"))
    ts: Mapped[datetime] = mapped_column(UtcTimestamp(fsp=3), default=utc_now, server_default=text("CURRENT_TIMESTAMP(3)"))
    ts0: Mapped[datetime] = mapped_column(UtcTimestamp(), default=utc_now, server_default=text("CURRENT_TIMESTAMP"))
    dt6: Mapped[datetime] = mapped_column(UtcDateTime(fsp=6))

    __table_args__ = (
        {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"},
    )
`)
  })

  // No column is read through UtcDateTime, so the module leaves it out; a TIME keeps its precision
  // as Prisma Migrate writes it, TIME(0) where none is given.
  it('gives a MySQL TIME its precision and leaves out UtcDateTime where no column uses it', () => {
    const models = [
      makeModel('Shift', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'day', type: 'DateTime', nativeType: ['Date', []] }),
        makeField({ name: 'starts', type: 'DateTime', nativeType: ['Time', ['3']] }),
        makeField({ name: 'ends', type: 'DateTime', isRequired: false, nativeType: ['Time', []] }),
      ]),
    ]

    expect(generateSingleFile(models, [], [], 'mysql')).toBe(`from sqlalchemy import Date, Time
from sqlalchemy.dialects.mysql import TIME
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from typing import Optional
from datetime import date, time as time_type


class Base(DeclarativeBase):
    pass


class Shift(Base):
    __tablename__ = "Shift"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    day: Mapped[date] = mapped_column(Date)
    starts: Mapped[time_type] = mapped_column(TIME(fsp=3))
    ends: Mapped[Optional[time_type]] = mapped_column(Time)

    __table_args__ = (
        {"mysql_charset": "utf8mb4", "mysql_collate": "utf8mb4_unicode_ci"},
    )
`)
  })

  it('reads lists, dates and times, and their defaults, in UTC on PostgreSQL', () => {
    const models = [
      makeModel('Row', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'stamps', type: 'DateTime', isList: true }),
        makeField({ name: 'days', type: 'DateTime', isList: true, nativeType: ['Date', []] }),
        makeField({
          name: 'd',
          type: 'DateTime',
          nativeType: ['Date', []],
          hasDefaultValue: true,
          default: '2024-01-15T00:00:00.000Z',
        }),
        makeField({
          name: 't',
          type: 'DateTime',
          nativeType: ['Time', ['3']],
          hasDefaultValue: true,
          default: '1970-01-01T10:30:00.000Z',
        }),
        makeField({ name: 'dn', type: 'DateTime', nativeType: ['Date', []], ...now }),
        makeField({
          name: 'tz',
          type: 'DateTime',
          nativeType: ['Timetz', ['3']],
          isUpdatedAt: true,
        }),
      ]),
    ]

    expect(generateSingleFile(models, [], [], 'postgresql'))
      .toBe(`from sqlalchemy import ARRAY, Date, Dialect, MetaData, TypeDecorator, text
from sqlalchemy.dialects.postgresql import TIME, TIMESTAMP
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from typing import Optional
from datetime import datetime, date, time as time_type, timezone


${UTC_DATE_TIME}${UTC_NOW}${UTC_BASE}

class Row(Base):
    __tablename__ = "Row"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False)
    stamps: Mapped[list[datetime]] = mapped_column(ARRAY(UtcDateTime(precision=3)), nullable=True)
    days: Mapped[list[date]] = mapped_column(ARRAY(Date), nullable=True)
    d: Mapped[date] = mapped_column(Date, default=date.fromisoformat("2024-01-15"), server_default=text("'2024-01-15'"))
    t: Mapped[time_type] = mapped_column(TIME(precision=3), default=time_type.fromisoformat("10:30:00.000"), server_default=text("'10:30:00'"))
    dn: Mapped[date] = mapped_column(Date, default=lambda: utc_now().date(), server_default=text("CURRENT_TIMESTAMP"))
    tz: Mapped[time_type] = mapped_column(TIME(precision=3, timezone=True), default=lambda: utc_now().timetz(), onupdate=lambda: utc_now().timetz())
`)
  })
})
