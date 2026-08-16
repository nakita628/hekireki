import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import { pydanticCode } from './pydantic.js'

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

describe('pydanticCode', () => {
  it('should generate a basic model with required, optional, and relation fields', () => {
    const models = [
      makeModel({
        name: 'User',
        fields: [
          makeField({ name: 'id', type: 'String', isId: true }),
          makeField({ name: 'name', type: 'String' }),
          makeField({ name: 'age', type: 'Int', isRequired: false }),
          makeField({
            name: 'posts',
            kind: 'object',
            type: 'Post',
            isList: true,
            isRequired: false,
          }),
        ],
      }),
    ]
    expect(pydanticCode(models, undefined, false)).toBe(`from pydantic import BaseModel


class User(BaseModel):
    id: str
    name: str
    age: int | None = None
`)
  })

  it('should map every Prisma scalar type', () => {
    const models = [
      makeModel({
        name: 'Scalars',
        fields: [
          makeField({ name: 'id', type: 'String', isId: true }),
          makeField({ name: 'count', type: 'Int' }),
          makeField({ name: 'bigNum', type: 'BigInt' }),
          makeField({ name: 'ratio', type: 'Float' }),
          makeField({ name: 'price', type: 'Decimal' }),
          makeField({ name: 'flag', type: 'Boolean' }),
          makeField({ name: 'createdAt', type: 'DateTime' }),
          makeField({ name: 'data', type: 'Json' }),
          makeField({ name: 'raw', type: 'Bytes' }),
        ],
      }),
    ]
    expect(pydanticCode(models, undefined, false)).toBe(`from pydantic import BaseModel, JsonValue
from decimal import Decimal
from datetime import datetime


class Scalars(BaseModel):
    id: str
    count: int
    bigNum: int
    ratio: float
    price: Decimal
    flag: bool
    createdAt: datetime
    data: JsonValue
    raw: bytes
`)
  })

  it('should map enums to Literal and scalar lists to list[...]', () => {
    const enums: DMMF.DatamodelEnum[] = [
      {
        name: 'Role',
        values: [
          { name: 'ADMIN', dbName: null },
          { name: 'USER', dbName: null },
        ],
        dbName: null,
      },
    ]
    const models = [
      makeModel({
        name: 'Member',
        fields: [
          makeField({ name: 'id', type: 'String', isId: true }),
          makeField({ name: 'role', type: 'Role', kind: 'enum' }),
          makeField({ name: 'roles', type: 'Role', kind: 'enum', isList: true }),
          makeField({ name: 'tags', type: 'String', isList: true }),
        ],
      }),
    ]
    expect(pydanticCode(models, enums, false)).toBe(`from pydantic import BaseModel
from typing import Literal


class Member(BaseModel):
    id: str
    role: Literal["ADMIN", "USER"]
    roles: list[Literal["ADMIN", "USER"]]
    tags: list[str]
`)
  })

  it('should use Prisma-level names for @map-ped enum values', () => {
    const enums: DMMF.DatamodelEnum[] = [
      {
        name: 'Visibility',
        values: [
          { name: 'PUBLIC', dbName: 'public' },
          { name: 'LINK_ONLY', dbName: 'link_only' },
        ],
        dbName: 'visibility_level',
      },
    ]
    const models = [
      makeModel({
        name: 'Board',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'visibility', type: 'Visibility', kind: 'enum' }),
          makeField({ name: 'fallback', type: 'Visibility', kind: 'enum', isRequired: false }),
        ],
      }),
    ]
    expect(pydanticCode(models, enums, false)).toBe(`from pydantic import BaseModel
from typing import Literal


class Board(BaseModel):
    id: int
    visibility: Literal["PUBLIC", "LINK_ONLY"]
    fallback: Literal["PUBLIC", "LINK_ONLY"] | None = None
`)
  })

  it('should refine native @db types to UUID, date, and time', () => {
    const models = [
      makeModel({
        name: 'NativeTimes',
        fields: [
          makeField({ name: 'id', type: 'String', isId: true, nativeType: ['Uuid', []] }),
          makeField({ name: 'day', type: 'DateTime', nativeType: ['Date', []] }),
          makeField({ name: 'clock', type: 'DateTime', nativeType: ['Time', ['3']] }),
          makeField({ name: 'zoned', type: 'DateTime', nativeType: ['Timestamptz', ['6']] }),
          makeField({
            name: 'lastSeen',
            type: 'DateTime',
            isRequired: false,
            nativeType: ['Timestamptz', ['6']],
          }),
        ],
      }),
    ]
    expect(pydanticCode(models, undefined, false)).toBe(`from pydantic import BaseModel
from datetime import date, datetime, time
from uuid import UUID


class NativeTimes(BaseModel):
    id: UUID
    day: date
    clock: time
    zoned: datetime
    lastSeen: datetime | None = None
`)
  })

  it('should escape Python keyword field names with a Field alias', () => {
    const models = [
      makeModel({
        name: 'Keyword',
        fields: [
          makeField({ name: 'id', type: 'String', isId: true }),
          makeField({ name: 'async', type: 'String' }),
          makeField({ name: 'yield', type: 'String', isRequired: false }),
          makeField({ name: 'type', type: 'String' }),
          makeField({ name: 'match', type: 'String' }),
          makeField({ name: 'self', type: 'String' }),
        ],
      }),
    ]
    expect(pydanticCode(models, undefined, false)).toBe(`from pydantic import BaseModel, Field


class Keyword(BaseModel):
    id: str
    async_: str = Field(alias="async")
    yield_: str | None = Field(default=None, alias="yield")
    type: str
    match: str
    self: str
`)
  })

  it('should emit extra="forbid" for @p.strictObject', () => {
    const models = [
      makeModel({
        name: 'Locked',
        documentation: '@p.strictObject',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'name', type: 'String' }),
        ],
      }),
    ]
    expect(pydanticCode(models, undefined, false)).toBe(`from pydantic import BaseModel, ConfigDict


class Locked(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: int
    name: str
`)
  })

  it('should emit extra="allow" for @p.looseObject', () => {
    const models = [
      makeModel({
        name: 'Open',
        documentation: '@p.looseObject',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'name', type: 'String' }),
        ],
      }),
    ]
    expect(pydanticCode(models, undefined, false)).toBe(`from pydantic import BaseModel, ConfigDict


class Open(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: int
    name: str
`)
  })

  it('should emit model and field docstrings when comment is true', () => {
    const models = [
      makeModel({
        name: 'User',
        documentation: 'Application user.\n@p.strictObject',
        fields: [
          makeField({
            name: 'id',
            type: 'String',
            isId: true,
            documentation: 'Primary key\n@z.uuid()\n@p.UUID4',
          }),
          makeField({ name: 'name', type: 'String', documentation: 'Display name' }),
        ],
      }),
    ]
    expect(pydanticCode(models, undefined, true))
      .toBe(`from pydantic import BaseModel, ConfigDict, UUID4


class User(BaseModel):
    """Application user."""

    model_config = ConfigDict(extra="forbid")

    id: UUID4
    """Primary key"""
    name: str
    """Display name"""
`)
  })

  it('should emit multi-line docstrings with closing quotes on their own line', () => {
    const models = [
      makeModel({
        name: 'Note',
        documentation: 'First line.\nSecond line.',
        fields: [
          makeField({
            name: 'id',
            type: 'Int',
            isId: true,
            documentation: 'Line one\nLine two',
          }),
          makeField({ name: 'body', type: 'String' }),
        ],
      }),
    ]
    expect(pydanticCode(models, undefined, true)).toBe(`from pydantic import BaseModel


class Note(BaseModel):
    """First line.
    Second line.
    """

    id: int
    """Line one
    Line two
    """
    body: str
`)
  })

  it('should not emit docstrings when comment is false', () => {
    const models = [
      makeModel({
        name: 'Note',
        documentation: 'First line.',
        fields: [makeField({ name: 'id', type: 'Int', isId: true, documentation: 'Primary key' })],
      }),
    ]
    expect(pydanticCode(models, undefined, false)).toBe(`from pydantic import BaseModel


class Note(BaseModel):
    id: int
`)
  })

  it('should use @p. field annotations verbatim and import what they reference', () => {
    const models = [
      makeModel({
        name: 'Account',
        fields: [
          makeField({ name: 'email', type: 'String', documentation: '@p.EmailStr' }),
          makeField({
            name: 'name',
            type: 'String',
            documentation: '@p.Annotated[str, StringConstraints(min_length=1, max_length=50)]',
          }),
          makeField({
            name: 'nickname',
            type: 'String',
            isRequired: false,
            documentation: '@p.EmailStr',
          }),
        ],
      }),
    ]
    expect(pydanticCode(models, undefined, false))
      .toBe(`from pydantic import BaseModel, EmailStr, StringConstraints
from typing import Annotated


class Account(BaseModel):
    email: EmailStr
    name: Annotated[str, StringConstraints(min_length=1, max_length=50)]
    nickname: EmailStr | None = None
`)
  })

  it('should skip models with only relation fields and PascalCase snake_case names', () => {
    const models = [
      makeModel({
        name: 'Link',
        fields: [makeField({ name: 'target', kind: 'object', type: 'Real', isRequired: false })],
      }),
      makeModel({
        name: 'order_line_item',
        fields: [
          makeField({ name: 'id', type: 'Int', isId: true }),
          makeField({ name: 'sku_code', type: 'String' }),
        ],
      }),
    ]
    expect(pydanticCode(models, undefined, false)).toBe(`from pydantic import BaseModel


class OrderLineItem(BaseModel):
    id: int
    sku_code: str
`)
  })

  it('should separate multiple models with two blank lines', () => {
    const models = [
      makeModel({
        name: 'User',
        fields: [makeField({ name: 'id', type: 'String', isId: true })],
      }),
      makeModel({
        name: 'Post',
        fields: [makeField({ name: 'id', type: 'String', isId: true })],
      }),
    ]
    expect(pydanticCode(models, undefined, false)).toBe(`from pydantic import BaseModel


class User(BaseModel):
    id: str


class Post(BaseModel):
    id: str
`)
  })
})
