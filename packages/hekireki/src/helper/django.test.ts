import type { DMMF } from '@prisma/generator-helper'
import { describe, expect, it } from 'vite-plus/test'

import { djangoCode } from '../generator/django.js'
import { djangoAttrName, findNameConflicts, prismaTypeToDjangoField } from './django.js'

describe('prismaTypeToDjangoField', () => {
  it('maps String to TextField', () => {
    expect(prismaTypeToDjangoField('String')).toStrictEqual('TextField')
  })

  it('maps Int to IntegerField', () => {
    expect(prismaTypeToDjangoField('Int')).toStrictEqual('IntegerField')
  })

  it('maps BigInt to BigIntegerField', () => {
    expect(prismaTypeToDjangoField('BigInt')).toStrictEqual('BigIntegerField')
  })

  it('maps Float to FloatField', () => {
    expect(prismaTypeToDjangoField('Float')).toStrictEqual('FloatField')
  })

  it('maps Decimal to DecimalField', () => {
    expect(prismaTypeToDjangoField('Decimal')).toStrictEqual('DecimalField')
  })

  it('maps Boolean to BooleanField', () => {
    expect(prismaTypeToDjangoField('Boolean')).toStrictEqual('BooleanField')
  })

  it('maps DateTime to DateTimeField', () => {
    expect(prismaTypeToDjangoField('DateTime')).toStrictEqual('DateTimeField')
  })

  it('maps Json to JSONField', () => {
    expect(prismaTypeToDjangoField('Json')).toStrictEqual('JSONField')
  })

  it('maps Bytes to BinaryField', () => {
    expect(prismaTypeToDjangoField('Bytes')).toStrictEqual('BinaryField')
  })

  it('maps unknown type to TextField', () => {
    expect(prismaTypeToDjangoField('Unknown')).toStrictEqual('TextField')
  })
})

describe('djangoAttrName', () => {
  it('keeps a plain name', () => {
    expect(djangoAttrName('title')).toStrictEqual('title')
  })

  it('renames a Python keyword with the inspectdb _field suffix', () => {
    expect(djangoAttrName('async')).toStrictEqual('async_field')
  })

  it('renames Django reserved names', () => {
    expect(djangoAttrName('pk')).toStrictEqual('pk_field')
    expect(djangoAttrName('objects')).toStrictEqual('objects_field')
    expect(djangoAttrName('self')).toStrictEqual('self_field')
  })

  it('keeps Python soft keywords', () => {
    expect(djangoAttrName('type')).toStrictEqual('type')
    expect(djangoAttrName('match')).toStrictEqual('match')
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

describe('findNameConflicts', () => {
  it('accepts a schema whose names stay distinct', () => {
    const models = [
      makeModel('User', [makeField({ name: 'id', type: 'Int', isId: true })]),
      makeModel('Post', [makeField({ name: 'id', type: 'Int', isId: true })]),
    ]

    expect(findNameConflicts(models)).toStrictEqual([])
  })

  it('reports two models that snake_case onto one table', () => {
    const models = [
      makeModel('user_role', [makeField({ name: 'id', type: 'Int', isId: true })]),
      makeModel('UserRole', [makeField({ name: 'id', type: 'Int', isId: true })]),
    ]

    expect(findNameConflicts(models)).toStrictEqual([
      'models user_role and UserRole both map to the table "user_role". Add @@map to one of them.',
    ])
  })

  it('reports two fields that snake_case onto one column', () => {
    const models = [
      makeModel('M', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'myValue', type: 'String' }),
        makeField({ name: 'my_value', type: 'String' }),
      ]),
    ]

    expect(findNameConflicts(models)).toStrictEqual([
      'fields myValue and my_value of model M both map to the column "my_value". Add @map to one of them.',
    ])
  })

  it('reports two enums that produce one Python class', () => {
    const enums: DMMF.DatamodelEnum[] = [
      { name: 'user_role', dbName: null, values: [{ name: 'A', dbName: null }] },
      { name: 'UserRole', dbName: null, values: [{ name: 'B', dbName: null }] },
    ]

    expect(findNameConflicts([], enums)).toStrictEqual([
      'enums user_role and UserRole both produce the Python class UserRole. Rename one of them.',
    ])
  })

  it('does not report a collision the schema resolved with @@map or @map', () => {
    const models = [
      makeModel('user_role', [makeField({ name: 'id', type: 'Int', isId: true })], {
        dbName: 'user_role_legacy',
      }),
      makeModel('UserRole', [
        makeField({ name: 'id', type: 'Int', isId: true }),
        makeField({ name: 'myValue', type: 'String' }),
        makeField({ name: 'my_value', type: 'String', dbName: 'my_value_legacy' }),
      ]),
    ]

    expect(findNameConflicts(models)).toStrictEqual([])
  })
})

describe('djangoCode', () => {
  it('generates a model with scalar fields and literal defaults', () => {
    const models = [
      makeModel('User', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'name', type: 'String', default: 'anonymous' }),
        makeField({ name: 'age', type: 'Int', isRequired: false }),
        makeField({ name: 'score', type: 'Float', default: -2.5 }),
        makeField({ name: 'active', type: 'Boolean', default: true }),
        makeField({ name: 'bio', type: 'String', isRequired: false }),
        makeField({ name: 'email', type: 'String', isUnique: true }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from django.db import models


class User(models.Model):
    id = models.AutoField(primary_key=True)
    name = models.TextField(default="anonymous")
    age = models.IntegerField(null=True)
    score = models.FloatField(default=-2.5)
    active = models.BooleanField(default=True)
    bio = models.TextField(null=True)
    email = models.TextField(unique=True)

    class Meta:
        db_table = "user"
`,
    )
  })

  it('camelCases columns to snake_case and honors @map/@@map', () => {
    const models = [
      makeModel(
        'BlogPost',
        [
          makeField({
            name: 'id',
            type: 'Int',
            isId: true,
            default: { name: 'autoincrement', args: [] },
          }),
          makeField({ name: 'viewCount', type: 'Int' }),
          makeField({ name: 'createdAt', type: 'DateTime', dbName: 'created_on' }),
        ],
        { dbName: 'blog_posts' },
      ),
    ]

    expect(djangoCode(models)).toBe(
      `from django.db import models


class BlogPost(models.Model):
    id = models.AutoField(primary_key=True)
    view_count = models.IntegerField()
    created_on = models.DateTimeField()

    class Meta:
        db_table = "blog_posts"
`,
    )
  })

  it('uses BigAutoField for a BigInt autoincrement primary key', () => {
    const models = [
      makeModel('Sequence', [
        makeField({
          name: 'id',
          type: 'BigInt',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'name', type: 'String' }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from django.db import models


class Sequence(models.Model):
    id = models.BigAutoField(primary_key=True)
    name = models.TextField()

    class Meta:
        db_table = "sequence"
`,
    )
  })

  it('uses SmallAutoField for a @db.SmallInt autoincrement primary key', () => {
    const models = [
      makeModel('Tiny', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
          nativeType: ['SmallInt', []],
        }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from django.db import models


class Tiny(models.Model):
    id = models.SmallAutoField(primary_key=True)

    class Meta:
        db_table = "tiny"
`,
    )
  })

  it('generates a uuid string primary key with a serializable helper', () => {
    const models = [
      makeModel('Session', [
        makeField({ name: 'id', type: 'String', isId: true, default: { name: 'uuid', args: [] } }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `import uuid

from django.db import models


def uuid4_str() -> str:
    return str(uuid.uuid4())


class Session(models.Model):
    id = models.TextField(primary_key=True, default=uuid4_str)

    class Meta:
        db_table = "session"
`,
    )
  })

  it('generates uuid7 and ulid helpers and a native UUIDField', () => {
    const models = [
      makeModel('Event', [
        makeField({ name: 'id', type: 'String', isId: true, default: { name: 'uuid', args: [7] } }),
      ]),
      makeModel('Ticket', [
        makeField({ name: 'id', type: 'String', isId: true, default: { name: 'ulid', args: [] } }),
      ]),
      makeModel('Device', [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          default: { name: 'uuid', args: [] },
          nativeType: ['Uuid', []],
        }),
      ]),
      makeModel('Beacon', [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          default: { name: 'uuid', args: [7] },
          nativeType: ['Uuid', []],
        }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `import uuid

import uuid6
from django.db import models
from ulid import ULID


def uuid7_str() -> str:
    return str(uuid6.uuid7())


def ulid_str() -> str:
    return str(ULID())


class Event(models.Model):
    id = models.TextField(primary_key=True, default=uuid7_str)

    class Meta:
        db_table = "event"


class Ticket(models.Model):
    id = models.TextField(primary_key=True, default=ulid_str)

    class Meta:
        db_table = "ticket"


class Device(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)

    class Meta:
        db_table = "device"


class Beacon(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid6.uuid7)

    class Meta:
        db_table = "beacon"
`,
    )
  })

  it('pins a string primary key with no generator to None so an unset one fails loudly', () => {
    const models = [
      makeModel('Badge', [
        makeField({ name: 'id', type: 'String', isId: true, default: { name: 'cuid', args: [2] } }),
        makeField({ name: 'code', type: 'String', default: { name: 'nanoid', args: [10] } }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from django.db import models


class Badge(models.Model):
    id = models.TextField(primary_key=True, default=None)
    code = models.TextField()

    class Meta:
        db_table = "badge"
`,
    )
  })

  it('does not pin an integer primary key to None', () => {
    const models = [
      makeModel('Fixed', [makeField({ name: 'id', type: 'Int', isId: true })]),
      makeModel('Uuid', [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          nativeType: ['Uuid', []],
        }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from django.db import models


class Fixed(models.Model):
    id = models.IntegerField(primary_key=True)

    class Meta:
        db_table = "fixed"


class Uuid(models.Model):
    id = models.UUIDField(primary_key=True)

    class Meta:
        db_table = "uuid"
`,
    )
  })

  it('maps native types to their Django fields', () => {
    const models = [
      makeModel('NativeGrid', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'code', type: 'String', nativeType: ['Char', ['3']] }),
        makeField({ name: 'label', type: 'String', nativeType: ['VarChar', ['32']] }),
        makeField({ name: 'blurb', type: 'String', nativeType: ['VarChar', []] }),
        makeField({ name: 'notes', type: 'String', nativeType: ['Text', []] }),
        makeField({ name: 'tiny', type: 'Int', nativeType: ['SmallInt', []] }),
        makeField({ name: 'ident', type: 'Int', nativeType: ['Oid', []] }),
        makeField({ name: 'single', type: 'Float', nativeType: ['Real', []] }),
        makeField({ name: 'double', type: 'Float', nativeType: ['DoublePrecision', []] }),
        makeField({ name: 'wealth', type: 'Decimal', nativeType: ['Money', []] }),
        makeField({ name: 'exact', type: 'Decimal', nativeType: ['Decimal', ['38', '12']] }),
        makeField({ name: 'blobby', type: 'Bytes', nativeType: ['ByteA', []] }),
        makeField({ name: 'doc', type: 'Json', nativeType: ['JsonB', []] }),
        makeField({ name: 'day', type: 'DateTime', nativeType: ['Date', []] }),
        makeField({ name: 'clock', type: 'DateTime', nativeType: ['Time', ['3']] }),
        makeField({ name: 'zoned', type: 'DateTime', nativeType: ['Timestamptz', ['6']] }),
        makeField({ name: 'address', type: 'String', nativeType: ['Inet', []] }),
        makeField({ name: 'mask', type: 'String', nativeType: ['Bit', ['8']] }),
        makeField({ name: 'markup', type: 'String', nativeType: ['Xml', []] }),
        makeField({ name: 'bigCount', type: 'BigInt', nativeType: ['BigInt', []] }),
        makeField({ name: 'flagged', type: 'Boolean', nativeType: ['Boolean', []] }),
        makeField({ name: 'mystery', type: 'String', nativeType: ['SomethingNew', []] }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from django.db import models


class NativeGrid(models.Model):
    id = models.AutoField(primary_key=True)
    code = models.CharField(max_length=3)
    label = models.CharField(max_length=32)
    blurb = models.TextField()
    notes = models.TextField()
    tiny = models.SmallIntegerField()
    ident = models.IntegerField()
    single = models.FloatField()
    double = models.FloatField()
    wealth = models.DecimalField(max_digits=65, decimal_places=30)
    exact = models.DecimalField(max_digits=38, decimal_places=12)
    blobby = models.BinaryField()
    doc = models.JSONField()
    day = models.DateField()
    clock = models.TimeField()
    zoned = models.DateTimeField()
    address = models.GenericIPAddressField()
    mask = models.TextField()
    markup = models.TextField()
    big_count = models.BigIntegerField()
    flagged = models.BooleanField()
    mystery = models.TextField()

    class Meta:
        db_table = "native_grid"
`,
    )
  })

  it('renames Python keywords with db_column and keeps soft keywords', () => {
    const models = [
      makeModel('Keyword', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'type', type: 'String' }),
        makeField({ name: 'async', type: 'String' }),
        makeField({ name: 'yield', type: 'String' }),
        makeField({ name: 'self', type: 'String' }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from django.db import models


class Keyword(models.Model):
    id = models.AutoField(primary_key=True)
    type = models.TextField()
    async_field = models.TextField(db_column="async")
    yield_field = models.TextField(db_column="yield")
    self_field = models.TextField(db_column="self")

    class Meta:
        db_table = "keyword"
`,
    )
  })

  it('emits db_default for now() and auto_now for @updatedAt', () => {
    const models = [
      makeModel('Stamped', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({
          name: 'createdAt',
          type: 'DateTime',
          dbName: 'created_at',
          default: { name: 'now', args: [] },
        }),
        makeField({ name: 'updatedAt', type: 'DateTime', dbName: 'updated_at', isUpdatedAt: true }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from django.db import models
from django.db.models.functions import Now


class Stamped(models.Model):
    id = models.AutoField(primary_key=True)
    created_at = models.DateTimeField(db_default=Now())
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "stamped"
`,
    )
  })

  it('emits db_default=RawSQL for dbgenerated defaults', () => {
    const models = [
      makeModel('Computed', [
        makeField({
          name: 'id',
          type: 'String',
          isId: true,
          default: { name: 'dbgenerated', args: ['gen_random_uuid()'] },
          nativeType: ['Uuid', []],
        }),
        makeField({
          name: 'when',
          type: 'DateTime',
          default: { name: 'dbgenerated', args: ["now() + interval '1 day'"] },
        }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from django.db import models
from django.db.models.expressions import RawSQL


class Computed(models.Model):
    id = models.UUIDField(primary_key=True, db_default=RawSQL("gen_random_uuid()", []))
    when = models.DateTimeField(db_default=RawSQL("now() + interval '1 day'", []))

    class Meta:
        db_table = "computed"
`,
    )
  })

  it('handles BigInt, Decimal, DateTime and escaped string defaults', () => {
    const models = [
      makeModel('Torture', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'bigPos', type: 'BigInt', default: '9007199254740993' }),
        makeField({ name: 'precise', type: 'Decimal', default: 12_345.6789 }),
        makeField({ name: 'exactStr', type: 'Decimal', default: '99.5' }),
        makeField({ name: 'born', type: 'DateTime', default: '2020-02-29T23:59:59.999+00:00' }),
        makeField({
          name: 'quoted',
          type: 'String',
          default: 'it\'s a "quote" and a \\ backslash',
        }),
        makeField({ name: 'empty', type: 'String', default: '' }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from datetime import datetime
from decimal import Decimal

from django.db import models


class Torture(models.Model):
    id = models.AutoField(primary_key=True)
    big_pos = models.BigIntegerField(default=9007199254740993)
    precise = models.DecimalField(max_digits=65, decimal_places=30, default=Decimal("12345.6789"))
    exact_str = models.DecimalField(max_digits=65, decimal_places=30, default=Decimal("99.5"))
    born = models.DateTimeField(default=datetime.fromisoformat("2020-02-29T23:59:59.999+00:00"))
    quoted = models.TextField(default="it's a \\"quote\\" and a \\\\ backslash")
    empty = models.TextField(default="")

    class Meta:
        db_table = "torture"
`,
    )
  })

  it('routes every JSON default through a callable', () => {
    const models = [
      makeModel('Payload', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'jsonObj', type: 'Json', default: '{"a":1,"b":[true,null,"x"]}' }),
        makeField({ name: 'jsonArr', type: 'Json', default: '[]' }),
        makeField({ name: 'jsonEmptyObj', type: 'Json', default: '{}' }),
        makeField({ name: 'jsonList', type: 'Json', default: '[1,2]' }),
        makeField({ name: 'jsonStr', type: 'Json', default: '"quoted"' }),
        makeField({ name: 'jsonNum', type: 'Json', default: '1.5' }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from typing import Any

from django.db import models


def payload_json_obj_default() -> dict[str, Any]:
    return {"a": 1, "b": [True, None, "x"]}


def payload_json_list_default() -> list[Any]:
    return [1, 2]


def payload_json_str_default() -> str:
    return "quoted"


def payload_json_num_default() -> float:
    return 1.5


class Payload(models.Model):
    id = models.AutoField(primary_key=True)
    json_obj = models.JSONField(default=payload_json_obj_default)
    json_arr = models.JSONField(default=list)
    json_empty_obj = models.JSONField(default=dict)
    json_list = models.JSONField(default=payload_json_list_default)
    json_str = models.JSONField(default=payload_json_str_default)
    json_num = models.JSONField(default=payload_json_num_default)

    class Meta:
        db_table = "payload"
`,
    )
  })

  it('maps scalar lists to ArrayField with callable defaults', () => {
    const models = [
      makeModel('Inventory', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'tags', type: 'String', isList: true, default: [] }),
        makeField({ name: 'codes', type: 'Int', isList: true, default: [1, 2, 3] }),
        makeField({ name: 'labels', type: 'String', isList: true, default: ['a', 'b'] }),
        makeField({ name: 'weights', type: 'Float', isList: true }),
        makeField({ name: 'flags', type: 'Boolean', isList: true }),
        makeField({ name: 'stamps', type: 'DateTime', isList: true }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from django.contrib.postgres.fields import ArrayField
from django.db import models


def inventory_codes_default() -> list[int]:
    return [1, 2, 3]


def inventory_labels_default() -> list[str]:
    return ["a", "b"]


class Inventory(models.Model):
    id = models.AutoField(primary_key=True)
    tags = ArrayField(models.TextField(), default=list)
    codes = ArrayField(models.IntegerField(), default=inventory_codes_default)
    labels = ArrayField(models.TextField(), default=inventory_labels_default)
    weights = ArrayField(models.FloatField())
    flags = ArrayField(models.BooleanField())
    stamps = ArrayField(models.DateTimeField())

    class Meta:
        db_table = "inventory"
`,
    )
  })

  it('generates TextChoices with @map values and enum fields in every position', () => {
    const enums: DMMF.DatamodelEnum[] = [
      {
        name: 'Visibility',
        dbName: 'visibility_level',
        values: [
          { name: 'PUBLIC', dbName: 'public' },
          { name: 'PRIVATE', dbName: 'private' },
          { name: 'LINK_ONLY', dbName: 'link_only' },
        ],
      },
    ]
    const models = [
      makeModel('Board', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'visibility', type: 'Visibility', kind: 'enum', default: 'LINK_ONLY' }),
        makeField({ name: 'fallback', type: 'Visibility', kind: 'enum', isRequired: false }),
        makeField({ name: 'audiences', type: 'Visibility', kind: 'enum', isList: true }),
      ]),
    ]

    expect(djangoCode(models, enums)).toBe(
      `from django.contrib.postgres.fields import ArrayField
from django.db import models


class Visibility(models.TextChoices):
    PUBLIC = "public"
    PRIVATE = "private"
    LINK_ONLY = "link_only"


class Board(models.Model):
    id = models.AutoField(primary_key=True)
    visibility = models.TextField(choices=Visibility.choices, default=Visibility.LINK_ONLY)
    fallback = models.TextField(choices=Visibility.choices, null=True)
    audiences = ArrayField(models.TextField(choices=Visibility.choices))

    class Meta:
        db_table = "board"
`,
    )
  })

  it('generates a ForeignKey with related_name and referential actions', () => {
    const models = [
      makeModel('Author', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({
          name: 'posts',
          type: 'Post',
          kind: 'object',
          isList: true,
          relationName: 'AuthorToPost',
        }),
      ]),
      makeModel('Post', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'authorId', type: 'Int', dbName: 'author_id' }),
        makeField({
          name: 'author',
          type: 'Author',
          kind: 'object',
          relationName: 'AuthorToPost',
          relationFromFields: ['authorId'],
          relationToFields: ['id'],
          relationOnDelete: 'Cascade',
        }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from django.db import models


class Author(models.Model):
    id = models.AutoField(primary_key=True)

    class Meta:
        db_table = "author"


class Post(models.Model):
    id = models.AutoField(primary_key=True)
    author = models.ForeignKey("Author", on_delete=models.CASCADE, related_name="posts", db_index=False)

    class Meta:
        db_table = "post"
`,
    )
  })

  it('applies Prisma implicit referential actions and maps every explicit one', () => {
    const models = [
      makeModel('Parent', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({
          name: 'strict',
          type: 'Child',
          kind: 'object',
          isList: true,
          relationName: 'strict',
        }),
        makeField({
          name: 'loose',
          type: 'Child',
          kind: 'object',
          isList: true,
          relationName: 'loose',
        }),
        makeField({
          name: 'noacts',
          type: 'Child',
          kind: 'object',
          isList: true,
          relationName: 'noact',
        }),
        makeField({
          name: 'restricts',
          type: 'Child',
          kind: 'object',
          isList: true,
          relationName: 'restrict',
        }),
        makeField({
          name: 'defaults',
          type: 'Child',
          kind: 'object',
          isList: true,
          relationName: 'setdefault',
        }),
      ]),
      makeModel('Child', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'strictId', type: 'Int' }),
        makeField({
          name: 'strict',
          type: 'Parent',
          kind: 'object',
          relationName: 'strict',
          relationFromFields: ['strictId'],
          relationToFields: ['id'],
        }),
        makeField({ name: 'looseId', type: 'Int', isRequired: false }),
        makeField({
          name: 'loose',
          type: 'Parent',
          kind: 'object',
          isRequired: false,
          relationName: 'loose',
          relationFromFields: ['looseId'],
          relationToFields: ['id'],
        }),
        makeField({ name: 'noActionId', type: 'Int' }),
        makeField({
          name: 'noAction',
          type: 'Parent',
          kind: 'object',
          relationName: 'noact',
          relationFromFields: ['noActionId'],
          relationToFields: ['id'],
          relationOnDelete: 'NoAction',
        }),
        makeField({ name: 'restrictId', type: 'Int' }),
        makeField({
          name: 'restrict',
          type: 'Parent',
          kind: 'object',
          relationName: 'restrict',
          relationFromFields: ['restrictId'],
          relationToFields: ['id'],
          relationOnDelete: 'Restrict',
        }),
        makeField({ name: 'setDefaultId', type: 'Int', default: 1 }),
        makeField({
          name: 'setDefault',
          type: 'Parent',
          kind: 'object',
          relationName: 'setdefault',
          relationFromFields: ['setDefaultId'],
          relationToFields: ['id'],
          relationOnDelete: 'SetDefault',
        }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from django.db import models


class Parent(models.Model):
    id = models.AutoField(primary_key=True)

    class Meta:
        db_table = "parent"


class Child(models.Model):
    id = models.AutoField(primary_key=True)
    strict = models.ForeignKey("Parent", on_delete=models.RESTRICT, related_name="strict", db_index=False)
    loose = models.ForeignKey("Parent", on_delete=models.SET_NULL, related_name="loose", null=True, db_index=False)
    no_action = models.ForeignKey("Parent", on_delete=models.DO_NOTHING, related_name="noacts", db_index=False)
    restrict = models.ForeignKey("Parent", on_delete=models.RESTRICT, related_name="restricts", db_index=False)
    set_default = models.ForeignKey("Parent", on_delete=models.SET_DEFAULT, related_name="defaults", db_index=False, default=1)

    class Meta:
        db_table = "child"
`,
    )
  })

  it('generates a OneToOneField for a unique-FK relation', () => {
    const models = [
      makeModel('Account', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({
          name: 'profile',
          type: 'Profile',
          kind: 'object',
          isRequired: false,
          relationName: 'AccountToProfile',
        }),
      ]),
      makeModel('Profile', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'accountId', type: 'Int', isUnique: true }),
        makeField({
          name: 'account',
          type: 'Account',
          kind: 'object',
          relationName: 'AccountToProfile',
          relationFromFields: ['accountId'],
          relationToFields: ['id'],
          relationOnDelete: 'Cascade',
        }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from django.db import models


class Account(models.Model):
    id = models.AutoField(primary_key=True)

    class Meta:
        db_table = "account"


class Profile(models.Model):
    id = models.AutoField(primary_key=True)
    account = models.OneToOneField("Account", on_delete=models.CASCADE, related_name="profile")

    class Meta:
        db_table = "profile"
`,
    )
  })

  it('generates a self-referential ForeignKey', () => {
    const models = [
      makeModel('Category', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'name', type: 'String' }),
        makeField({ name: 'parentId', type: 'Int', isRequired: false }),
        makeField({
          name: 'parent',
          type: 'Category',
          kind: 'object',
          isRequired: false,
          relationName: 'tree',
          relationFromFields: ['parentId'],
          relationToFields: ['id'],
        }),
        makeField({
          name: 'children',
          type: 'Category',
          kind: 'object',
          isList: true,
          relationName: 'tree',
        }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from django.db import models


class Category(models.Model):
    id = models.AutoField(primary_key=True)
    name = models.TextField()
    parent = models.ForeignKey("self", on_delete=models.SET_NULL, related_name="children", null=True, db_index=False)

    class Meta:
        db_table = "category"
`,
    )
  })

  it('generates a self-referential OneToOneField', () => {
    const models = [
      makeModel('Monarch', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'successorId', type: 'Int', isRequired: false, isUnique: true }),
        makeField({
          name: 'successor',
          type: 'Monarch',
          kind: 'object',
          isRequired: false,
          relationName: 'succession',
          relationFromFields: ['successorId'],
          relationToFields: ['id'],
        }),
        makeField({
          name: 'predecessor',
          type: 'Monarch',
          kind: 'object',
          isRequired: false,
          relationName: 'succession',
        }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from django.db import models


class Monarch(models.Model):
    id = models.AutoField(primary_key=True)
    successor = models.OneToOneField("self", on_delete=models.SET_NULL, related_name="predecessor", null=True)

    class Meta:
        db_table = "monarch"
`,
    )
  })

  it('generates to_field and db_column for a non-id unique reference', () => {
    const models = [
      makeModel('Handle', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'slug', type: 'String', isUnique: true }),
        makeField({
          name: 'claims',
          type: 'Claim',
          kind: 'object',
          isList: true,
          relationName: 'HandleToClaim',
        }),
      ]),
      makeModel('Claim', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'slug', type: 'String' }),
        makeField({
          name: 'handle',
          type: 'Handle',
          kind: 'object',
          relationName: 'HandleToClaim',
          relationFromFields: ['slug'],
          relationToFields: ['slug'],
          relationOnDelete: 'Cascade',
        }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from django.db import models


class Handle(models.Model):
    id = models.AutoField(primary_key=True)
    slug = models.TextField(unique=True)

    class Meta:
        db_table = "handle"


class Claim(models.Model):
    id = models.AutoField(primary_key=True)
    handle = models.ForeignKey("Handle", on_delete=models.CASCADE, related_name="claims", to_field="slug", db_column="slug", db_index=False)

    class Meta:
        db_table = "claim"
`,
    )
  })

  it('generates a composite primary key over foreign keys', () => {
    const models = [
      makeModel('Account', [
        makeField({ name: 'id', type: 'String', isId: true, default: { name: 'uuid', args: [] } }),
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
      ]),
      makeModel(
        'Follow',
        [
          makeField({ name: 'followerId', type: 'String' }),
          makeField({ name: 'followingId', type: 'String' }),
          makeField({
            name: 'follower',
            type: 'Account',
            kind: 'object',
            relationName: 'follower',
            relationFromFields: ['followerId'],
            relationToFields: ['id'],
            relationOnDelete: 'Cascade',
          }),
          makeField({
            name: 'following',
            type: 'Account',
            kind: 'object',
            relationName: 'following',
            relationFromFields: ['followingId'],
            relationToFields: ['id'],
            relationOnDelete: 'Cascade',
          }),
        ],
        {
          primaryKey: {
            name: null,
            fields: ['followerId', 'followingId'],
          } as unknown as DMMF.PrimaryKey,
        },
      ),
    ]

    expect(djangoCode(models)).toBe(
      `import uuid

from django.db import models


def uuid4_str() -> str:
    return str(uuid.uuid4())


class Account(models.Model):
    id = models.TextField(primary_key=True, default=uuid4_str)

    class Meta:
        db_table = "account"


class Follow(models.Model):
    pk = models.CompositePrimaryKey("follower_id", "following_id")
    follower = models.ForeignKey("Account", on_delete=models.CASCADE, related_name="following", db_index=False)
    following = models.ForeignKey("Account", on_delete=models.CASCADE, related_name="followers", db_index=False)

    class Meta:
        db_table = "follow"
`,
    )
  })

  it('generates a composite primary key over scalars and falls back on a composite FK', () => {
    const models = [
      makeModel(
        'GridCell',
        [
          makeField({ name: 'x', type: 'Int' }),
          makeField({ name: 'y', type: 'Int' }),
          makeField({
            name: 'marks',
            type: 'Mark',
            kind: 'object',
            isList: true,
            relationName: 'cell',
          }),
        ],
        { primaryKey: { name: null, fields: ['x', 'y'] } as unknown as DMMF.PrimaryKey },
      ),
      makeModel('Mark', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'x', type: 'Int' }),
        makeField({ name: 'y', type: 'Int' }),
        makeField({
          name: 'cell',
          type: 'GridCell',
          kind: 'object',
          relationName: 'cell',
          relationFromFields: ['x', 'y'],
          relationToFields: ['x', 'y'],
        }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from django.db import models


class GridCell(models.Model):
    pk = models.CompositePrimaryKey("x", "y")
    x = models.IntegerField()
    y = models.IntegerField()

    class Meta:
        db_table = "grid_cell"


class Mark(models.Model):
    id = models.AutoField(primary_key=True)
    x = models.IntegerField()
    y = models.IntegerField()

    class Meta:
        db_table = "mark"
`,
    )
  })

  it('generates an implicit many-to-many through model with the Prisma join table', () => {
    const models = [
      makeModel('Post', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({
          name: 'tags',
          type: 'Tag',
          kind: 'object',
          isList: true,
          relationName: 'PostToTag',
        }),
      ]),
      makeModel('Tag', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({
          name: 'posts',
          type: 'Post',
          kind: 'object',
          isList: true,
          relationName: 'PostToTag',
        }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from django.db import models


class Post(models.Model):
    id = models.AutoField(primary_key=True)
    tags: "models.ManyToManyField[Tag, PostToTag]" = models.ManyToManyField("Tag", through="PostToTag", related_name="posts")

    class Meta:
        db_table = "post"


class Tag(models.Model):
    id = models.AutoField(primary_key=True)

    class Meta:
        db_table = "tag"


class PostToTag(models.Model):
    pk = models.CompositePrimaryKey("a_id", "b_id")
    a = models.ForeignKey("Post", on_delete=models.CASCADE, related_name="+", db_column="A", db_index=False)
    b = models.ForeignKey("Tag", on_delete=models.CASCADE, related_name="+", db_column="B", db_index=False)

    class Meta:
        db_table = "_PostToTag"
        indexes = [
            models.Index(fields=["b"]),
        ]
`,
    )
  })

  it('uses the relation name for a named many-to-many join table', () => {
    const models = [
      makeModel('Actor', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({
          name: 'films',
          type: 'Film',
          kind: 'object',
          isList: true,
          relationName: 'cast',
        }),
      ]),
      makeModel('Film', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({
          name: 'actors',
          type: 'Actor',
          kind: 'object',
          isList: true,
          relationName: 'cast',
        }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from django.db import models


class Actor(models.Model):
    id = models.AutoField(primary_key=True)
    films: "models.ManyToManyField[Film, Cast]" = models.ManyToManyField("Film", through="Cast", related_name="actors")

    class Meta:
        db_table = "actor"


class Film(models.Model):
    id = models.AutoField(primary_key=True)

    class Meta:
        db_table = "film"


class Cast(models.Model):
    pk = models.CompositePrimaryKey("a_id", "b_id")
    a = models.ForeignKey("Actor", on_delete=models.CASCADE, related_name="+", db_column="A", db_index=False)
    b = models.ForeignKey("Film", on_delete=models.CASCADE, related_name="+", db_column="B", db_index=False)

    class Meta:
        db_table = "_cast"
        indexes = [
            models.Index(fields=["b"]),
        ]
`,
    )
  })

  it('adds through_fields for a self-referential many-to-many', () => {
    const models = [
      makeModel('User', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({
          name: 'friends',
          type: 'User',
          kind: 'object',
          isList: true,
          relationName: 'friendship',
        }),
        makeField({
          name: 'friendOf',
          type: 'User',
          kind: 'object',
          isList: true,
          relationName: 'friendship',
        }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from django.db import models


class User(models.Model):
    id = models.AutoField(primary_key=True)
    friends: "models.ManyToManyField[User, Friendship]" = models.ManyToManyField("User", through="Friendship", through_fields=("a", "b"), related_name="friend_of")

    class Meta:
        db_table = "user"


class Friendship(models.Model):
    pk = models.CompositePrimaryKey("a_id", "b_id")
    a = models.ForeignKey("User", on_delete=models.CASCADE, related_name="+", db_column="A", db_index=False)
    b = models.ForeignKey("User", on_delete=models.CASCADE, related_name="+", db_column="B", db_index=False)

    class Meta:
        db_table = "_friendship"
        indexes = [
            models.Index(fields=["b"]),
        ]
`,
    )
  })

  it('emits unique constraints and indexes in Meta', () => {
    const models = [
      makeModel(
        'Article',
        [
          makeField({
            name: 'id',
            type: 'Int',
            isId: true,
            default: { name: 'autoincrement', args: [] },
          }),
          makeField({ name: 'slug', type: 'String' }),
          makeField({ name: 'locale', type: 'String' }),
          makeField({ name: 'viewCount', type: 'Int', dbName: 'view_count' }),
        ],
        { uniqueFields: [['slug', 'locale']] },
      ),
    ]
    const indexes: DMMF.Index[] = [
      {
        model: 'Article',
        type: 'normal',
        fields: [{ name: 'viewCount' }],
      } as unknown as DMMF.Index,
      {
        model: 'Article',
        type: 'normal',
        fields: [{ name: 'slug' }],
        dbName: 'article_slug_idx',
      } as unknown as DMMF.Index,
      {
        model: 'Other',
        type: 'normal',
        fields: [{ name: 'slug' }],
      } as unknown as DMMF.Index,
    ]

    expect(djangoCode(models, undefined, indexes)).toBe(
      `from django.db import models


class Article(models.Model):
    id = models.AutoField(primary_key=True)
    slug = models.TextField()
    locale = models.TextField()
    view_count = models.IntegerField()

    class Meta:
        db_table = "article"
        constraints = [
            models.UniqueConstraint(fields=["slug", "locale"], name="article_slug_locale_key"),
        ]
        indexes = [
            models.Index(fields=["view_count"]),
            models.Index(fields=["slug"], name="article_slug_idx"),
        ]
`,
    )
  })

  it('drops an index name Django would reject and lets it derive one', () => {
    const models = [
      makeModel('Article', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'slug', type: 'String' }),
        makeField({ name: 'locale', type: 'String' }),
      ]),
    ]
    const indexes: DMMF.Index[] = [
      {
        model: 'Article',
        type: 'normal',
        fields: [{ name: 'slug' }],
        dbName: 'a_deliberately_very_long_index_name_over_thirty',
      } as unknown as DMMF.Index,
      {
        model: 'Article',
        type: 'normal',
        fields: [{ name: 'locale' }],
        dbName: '_leading_underscore',
      } as unknown as DMMF.Index,
    ]

    expect(djangoCode(models, undefined, indexes)).toBe(
      `from django.db import models


class Article(models.Model):
    id = models.AutoField(primary_key=True)
    slug = models.TextField()
    locale = models.TextField()

    class Meta:
        db_table = "article"
        indexes = [
            models.Index(fields=["slug"]),
            models.Index(fields=["locale"]),
        ]
`,
    )
  })

  it('references a ForeignKey by relation attribute in constraints and indexes', () => {
    const models = [
      makeModel('Author', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({
          name: 'posts',
          type: 'Post',
          kind: 'object',
          isList: true,
          relationName: 'AuthorToPost',
        }),
      ]),
      makeModel(
        'Post',
        [
          makeField({
            name: 'id',
            type: 'Int',
            isId: true,
            default: { name: 'autoincrement', args: [] },
          }),
          makeField({ name: 'title', type: 'String' }),
          makeField({ name: 'authorId', type: 'Int', dbName: 'author_id' }),
          makeField({
            name: 'author',
            type: 'Author',
            kind: 'object',
            relationName: 'AuthorToPost',
            relationFromFields: ['authorId'],
            relationToFields: ['id'],
            relationOnDelete: 'Cascade',
          }),
        ],
        { uniqueFields: [['authorId', 'title']] },
      ),
    ]
    const indexes: DMMF.Index[] = [
      {
        model: 'Post',
        type: 'normal',
        fields: [{ name: 'authorId' }],
      } as unknown as DMMF.Index,
    ]

    expect(djangoCode(models, undefined, indexes)).toBe(
      `from django.db import models


class Author(models.Model):
    id = models.AutoField(primary_key=True)

    class Meta:
        db_table = "author"


class Post(models.Model):
    id = models.AutoField(primary_key=True)
    title = models.TextField()
    author = models.ForeignKey("Author", on_delete=models.CASCADE, related_name="posts", db_index=False)

    class Meta:
        db_table = "post"
        constraints = [
            models.UniqueConstraint(fields=["author", "title"], name="post_author_id_title_key"),
        ]
        indexes = [
            models.Index(fields=["author"]),
        ]
`,
    )
  })

  it('skips a model with no primary key', () => {
    const models = [
      makeModel('NoPk', [makeField({ name: 'value', type: 'String' })]),
      makeModel('WithPk', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from django.db import models


class WithPk(models.Model):
    id = models.AutoField(primary_key=True)

    class Meta:
        db_table = "with_pk"
`,
    )
  })

  it('emits no imports or default helpers for a model it skips', () => {
    const models = [
      makeModel('NoPk', [
        makeField({ name: 'email', type: 'String', isUnique: true }),
        makeField({ name: 'bag', type: 'String', isList: true, default: ['z'] }),
      ]),
      makeModel('WithPk', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from django.db import models


class WithPk(models.Model):
    id = models.AutoField(primary_key=True)

    class Meta:
        db_table = "with_pk"
`,
    )
  })

  it('PascalCases a snake_case model name and keeps the table verbatim', () => {
    const models = [
      makeModel('order_line_item', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'sku_code', type: 'String' }),
        makeField({ name: 'qty', type: 'Int', default: 1 }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from django.db import models


class OrderLineItem(models.Model):
    id = models.AutoField(primary_key=True)
    sku_code = models.TextField()
    qty = models.IntegerField(default=1)

    class Meta:
        db_table = "order_line_item"
`,
    )
  })

  it('does not re-assert a literal default on a primary key', () => {
    const models = [
      makeModel('Fixed', [makeField({ name: 'id', type: 'Int', isId: true, default: 1 })]),
    ]

    expect(djangoCode(models)).toBe(
      `from django.db import models


class Fixed(models.Model):
    id = models.IntegerField(primary_key=True)

    class Meta:
        db_table = "fixed"
`,
    )
  })

  it('escapes keywords used as enum value names with a trailing underscore', () => {
    const enums: DMMF.DatamodelEnum[] = [
      {
        name: 'Answer',
        dbName: null,
        values: [
          { name: 'None', dbName: null },
          { name: 'YES', dbName: null },
        ],
      },
    ]
    const models = [
      makeModel('Quiz', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'answer', type: 'Answer', kind: 'enum', default: 'None' }),
      ]),
    ]

    expect(djangoCode(models, enums)).toBe(
      `from django.db import models


class Answer(models.TextChoices):
    None_ = "None"
    YES = "YES"


class Quiz(models.Model):
    id = models.AutoField(primary_key=True)
    answer = models.TextField(choices=Answer.choices, default=Answer.None_)

    class Meta:
        db_table = "quiz"
`,
    )
  })
  it('escapes enum value names Django Choices reserves', () => {
    const enums: DMMF.DatamodelEnum[] = [
      {
        name: 'Kind',
        dbName: null,
        values: [
          { name: 'choices', dbName: null },
          { name: 'labels', dbName: null },
          { name: 'values', dbName: null },
          { name: 'names', dbName: null },
          { name: 'mro', dbName: null },
          { name: 'label', dbName: null },
        ],
      },
    ]
    const models = [
      makeModel('Doc', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'kind', type: 'Kind', kind: 'enum', default: 'choices' }),
      ]),
    ]

    expect(djangoCode(models, enums)).toBe(
      `from django.db import models


class Kind(models.TextChoices):
    choices_ = "choices"
    labels_ = "labels"
    values_ = "values"
    names_ = "names"
    mro_ = "mro"
    label = "label"


class Doc(models.Model):
    id = models.AutoField(primary_key=True)
    kind = models.TextField(choices=Kind.choices, default=Kind.choices_)

    class Meta:
        db_table = "doc"
`,
    )
  })

  it('folds a column name Django rejects into an accepted spelling', () => {
    const models = [
      makeModel('Edge', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'trailing_', type: 'String' }),
        makeField({ name: 'dunder__name', type: 'String' }),
        makeField({ name: 'both__ends_', type: 'String' }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from django.db import models


class Edge(models.Model):
    id = models.AutoField(primary_key=True)
    trailing_field = models.TextField(db_column="trailing_")
    dunder_name = models.TextField(db_column="dunder__name")
    both_ends_field = models.TextField(db_column="both__ends_")

    class Meta:
        db_table = "edge"
`,
    )
  })

  it('parses Json list default elements and imports Any for them', () => {
    const models = [
      makeModel('Doc', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'bag', type: 'Json', isList: true, default: ['{"a":1}', '[1,2]'] }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from typing import Any

from django.contrib.postgres.fields import ArrayField
from django.db import models


def doc_bag_default() -> list[Any]:
    return [{"a": 1}, [1, 2]]


class Doc(models.Model):
    id = models.AutoField(primary_key=True)
    bag = ArrayField(models.JSONField(), default=doc_bag_default)

    class Meta:
        db_table = "doc"
`,
    )
  })

  it('emits Decimal, DateTime, BigInt and Boolean scalar-list default elements', () => {
    const models = [
      makeModel('Inventory', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'decs', type: 'Decimal', isList: true, default: ['1.5'] }),
        makeField({
          name: 'stamps',
          type: 'DateTime',
          isList: true,
          default: ['2020-02-29T23:59:59.999+00:00'],
        }),
        makeField({ name: 'bigs', type: 'BigInt', isList: true, default: ['9007199254740993'] }),
        makeField({ name: 'flags', type: 'Boolean', isList: true, default: [true, false] }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from datetime import datetime
from decimal import Decimal

from django.contrib.postgres.fields import ArrayField
from django.db import models


def inventory_decs_default() -> list[Decimal]:
    return [Decimal("1.5")]


def inventory_stamps_default() -> list[datetime]:
    return [datetime.fromisoformat("2020-02-29T23:59:59.999+00:00")]


def inventory_bigs_default() -> list[int]:
    return [9007199254740993]


def inventory_flags_default() -> list[bool]:
    return [True, False]


class Inventory(models.Model):
    id = models.AutoField(primary_key=True)
    decs = ArrayField(models.DecimalField(max_digits=65, decimal_places=30), default=inventory_decs_default)
    stamps = ArrayField(models.DateTimeField(), default=inventory_stamps_default)
    bigs = ArrayField(models.BigIntegerField(), default=inventory_bigs_default)
    flags = ArrayField(models.BooleanField(), default=inventory_flags_default)

    class Meta:
        db_table = "inventory"
`,
    )
  })
  it('steps a through model aside when a model already owns its class name', () => {
    const models = [
      makeModel('Cast', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
      ]),
      makeModel('Actor', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({
          name: 'films',
          type: 'Film',
          kind: 'object',
          isList: true,
          relationName: 'cast',
        }),
      ]),
      makeModel('Film', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({
          name: 'actors',
          type: 'Actor',
          kind: 'object',
          isList: true,
          relationName: 'cast',
        }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from django.db import models


class Cast(models.Model):
    id = models.AutoField(primary_key=True)

    class Meta:
        db_table = "cast"


class Actor(models.Model):
    id = models.AutoField(primary_key=True)
    films: "models.ManyToManyField[Film, CastThrough]" = models.ManyToManyField("Film", through="CastThrough", related_name="actors")

    class Meta:
        db_table = "actor"


class Film(models.Model):
    id = models.AutoField(primary_key=True)

    class Meta:
        db_table = "film"


class CastThrough(models.Model):
    pk = models.CompositePrimaryKey("a_id", "b_id")
    a = models.ForeignKey("Actor", on_delete=models.CASCADE, related_name="+", db_column="A", db_index=False)
    b = models.ForeignKey("Film", on_delete=models.CASCADE, related_name="+", db_column="B", db_index=False)

    class Meta:
        db_table = "_cast"
        indexes = [
            models.Index(fields=["b"]),
        ]
`,
    )
  })

  it('steps a through model aside when an enum already owns its class name', () => {
    const enums: DMMF.DatamodelEnum[] = [
      {
        name: 'Cast',
        dbName: null,
        values: [{ name: 'A', dbName: null }],
      },
    ]
    const models = [
      makeModel('Actor', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({
          name: 'films',
          type: 'Film',
          kind: 'object',
          isList: true,
          relationName: 'cast',
        }),
      ]),
      makeModel('Film', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({
          name: 'actors',
          type: 'Actor',
          kind: 'object',
          isList: true,
          relationName: 'cast',
        }),
      ]),
    ]

    expect(djangoCode(models, enums)).toBe(
      `from django.db import models


class Cast(models.TextChoices):
    A = "A"


class Actor(models.Model):
    id = models.AutoField(primary_key=True)
    films: "models.ManyToManyField[Film, CastThrough]" = models.ManyToManyField("Film", through="CastThrough", related_name="actors")

    class Meta:
        db_table = "actor"


class Film(models.Model):
    id = models.AutoField(primary_key=True)

    class Meta:
        db_table = "film"


class CastThrough(models.Model):
    pk = models.CompositePrimaryKey("a_id", "b_id")
    a = models.ForeignKey("Actor", on_delete=models.CASCADE, related_name="+", db_column="A", db_index=False)
    b = models.ForeignKey("Film", on_delete=models.CASCADE, related_name="+", db_column="B", db_index=False)

    class Meta:
        db_table = "_cast"
        indexes = [
            models.Index(fields=["b"]),
        ]
`,
    )
  })

  it('carries index sort order, algorithm and an explicit unique name', () => {
    const models = [
      makeModel(
        'Sorted',
        [
          makeField({
            name: 'id',
            type: 'Int',
            isId: true,
            default: { name: 'autoincrement', args: [] },
          }),
          makeField({ name: 'a', type: 'String' }),
          makeField({ name: 'b', type: 'String' }),
          makeField({ name: 'c', type: 'String' }),
          makeField({ name: 'd', type: 'String' }),
        ],
        { uniqueFields: [['a', 'b']] },
      ),
    ]
    const indexes: DMMF.Index[] = [
      {
        model: 'Sorted',
        type: 'normal',
        isDefinedOnField: false,
        fields: [
          { name: 'a', sortOrder: 'desc' },
          { name: 'b', sortOrder: 'asc' },
        ],
      } as unknown as DMMF.Index,
      {
        model: 'Sorted',
        type: 'normal',
        isDefinedOnField: false,
        algorithm: 'Hash',
        fields: [{ name: 'c' }],
      } as unknown as DMMF.Index,
      {
        model: 'Sorted',
        type: 'normal',
        isDefinedOnField: false,
        algorithm: 'Gin',
        fields: [{ name: 'd' }],
      } as unknown as DMMF.Index,
      {
        model: 'Sorted',
        type: 'unique',
        isDefinedOnField: false,
        dbName: 'custom_unique_name',
        fields: [{ name: 'a' }, { name: 'b' }],
      } as unknown as DMMF.Index,
    ]

    expect(djangoCode(models, undefined, indexes)).toBe(
      `from django.contrib.postgres.indexes import GinIndex, HashIndex
from django.db import models


class Sorted(models.Model):
    id = models.AutoField(primary_key=True)
    a = models.TextField()
    b = models.TextField()
    c = models.TextField()
    d = models.TextField()

    class Meta:
        db_table = "sorted"
        constraints = [
            models.UniqueConstraint(fields=["a", "b"], name="custom_unique_name"),
        ]
        indexes = [
            models.Index(fields=["-a", "b"]),
            HashIndex(fields=["c"]),
            GinIndex(fields=["d"]),
        ]
`,
    )
  })

  it('steps aside when two field names fold onto one attribute', () => {
    const models = [
      makeModel('M', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'value_', type: 'String' }),
        makeField({ name: 'value_field', type: 'String' }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from django.db import models


class M(models.Model):
    id = models.AutoField(primary_key=True)
    value_field = models.TextField(db_column="value_")
    value_field_2 = models.TextField(db_column="value_field")

    class Meta:
        db_table = "m"
`,
    )
  })

  it('gives each model its own default helper when the names would collide', () => {
    const models = [
      makeModel('Foo', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'barBaz', type: 'Json', default: '{"a":1}' }),
      ]),
      makeModel('FooBar', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'baz', type: 'Json', default: '{"b":2}' }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from typing import Any

from django.db import models


def foo_bar_baz_default() -> dict[str, Any]:
    return {"a": 1}


def foo_bar_baz_default_2() -> dict[str, Any]:
    return {"b": 2}


class Foo(models.Model):
    id = models.AutoField(primary_key=True)
    bar_baz = models.JSONField(default=foo_bar_baz_default)

    class Meta:
        db_table = "foo"


class FooBar(models.Model):
    id = models.AutoField(primary_key=True)
    baz = models.JSONField(default=foo_bar_baz_default_2)

    class Meta:
        db_table = "foo_bar"
`,
    )
  })

  it('maps an enum list default to its TextChoices members', () => {
    const enums: DMMF.DatamodelEnum[] = [
      {
        name: 'V',
        dbName: null,
        values: [
          { name: 'PUBLIC', dbName: 'public' },
          { name: 'PRIVATE', dbName: 'private' },
        ],
      },
    ]
    const models = [
      makeModel('B', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({
          name: 'vs',
          type: 'V',
          kind: 'enum',
          isList: true,
          default: ['PUBLIC', 'PRIVATE'],
        }),
      ]),
    ]

    expect(djangoCode(models, enums)).toBe(
      `from django.contrib.postgres.fields import ArrayField
from django.db import models


def b_vs_default() -> list[str]:
    return [V.PUBLIC, V.PRIVATE]


class V(models.TextChoices):
    PUBLIC = "public"
    PRIVATE = "private"


class B(models.Model):
    id = models.AutoField(primary_key=True)
    vs = ArrayField(models.TextField(choices=V.choices), default=b_vs_default)

    class Meta:
        db_table = "b"
`,
    )
  })

  it('decodes a base64 Bytes default into a bytes literal', () => {
    const models = [
      makeModel('B', [
        makeField({
          name: 'id',
          type: 'Int',
          isId: true,
          default: { name: 'autoincrement', args: [] },
        }),
        makeField({ name: 'raw', type: 'Bytes', default: 'AQID' }),
      ]),
    ]

    expect(djangoCode(models)).toBe(
      `from django.db import models


class B(models.Model):
    id = models.AutoField(primary_key=True)
    raw = models.BinaryField(default=b"\\x01\\x02\\x03")

    class Meta:
        db_table = "b"
`,
    )
  })
})
