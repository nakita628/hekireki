import { createHash } from 'node:crypto'

import type { DMMF } from '@prisma/generator-helper'

import { stripAnnotations } from '../annotation/index.js'
import {
  jsonToPythonLiteral,
  PYTHON_KEYWORDS,
  pythonDocstringLines,
  toPythonString,
} from '../literal/python.js'
import { constraintName, makePascalCase, makeSnakeCase } from '../naming/case.js'
import {
  backRelation,
  cuidDefaultVersion,
  isAutoincrement,
  isFunctionDefault,
  isNowDefault,
  isUlidDefault,
  nanoidDefault,
  primaryKeyFields,
  uuidDefaultVersion,
} from '../prisma/model.js'

const PRISMA_TO_DJANGO: { [k: string]: string } = {
  String: 'TextField',
  Int: 'IntegerField',
  BigInt: 'BigIntegerField',
  Float: 'FloatField',
  Decimal: 'DecimalField',
  Boolean: 'BooleanField',
  DateTime: 'DateTimeField',
  Json: 'JSONField',
  Bytes: 'BinaryField',
}

const PRISMA_TO_PYTHON: { [k: string]: string } = {
  String: 'str',
  Int: 'int',
  BigInt: 'int',
  Float: 'float',
  Decimal: 'Decimal',
  Boolean: 'bool',
  DateTime: 'datetime',
  Json: 'Any',
  Bytes: 'bytes',
}

export function prismaTypeToDjangoField(type: string) {
  return PRISMA_TO_DJANGO[type] ?? 'TextField'
}

// Not keywords, but unusable as Django model field names: `pk` fails the
// fields.E003 system check, `objects` shadows the default manager, and
// `self`/`cls` collide with Model.__init__'s signature when passed as kwargs.
const DJANGO_RESERVED = new Set(['pk', 'self', 'cls', 'objects'])

// Django rejects a field name that ends with an underscore (fields.E001) or
// contains a double underscore (fields.E002, which would be read as a lookup
// separator). Both are legal Prisma names, so they are folded into the nearest
// accepted spelling; the real column is preserved via db_column.
function acceptableAttrName(columnName: string) {
  const collapsed = columnName.replaceAll(/_{2,}/gu, '_')
  return collapsed.endsWith('_') ? `${collapsed}field` : collapsed
}

// A keyword or reserved name is renamed with inspectdb's `<name>_field`
// convention.
export function djangoAttrName(columnName: string) {
  const name = acceptableAttrName(columnName)
  return PYTHON_KEYWORDS.has(name) || DJANGO_RESERVED.has(name) ? `${name}_field` : name
}

// Django's Choices metaclass exposes choices/labels/values/names as
// classproperties and Python's enum rejects `mro`, so a member of any of those
// names cannot be defined at all.
const CHOICES_RESERVED = new Set(['choices', 'labels', 'values', 'names', 'mro'])

// TextChoices is a str, so a member named after one of str's methods
// (`replace`, `center`, `count`) overrides it with a string, which mypy
// --strict refuses as an incompatible assignment.
const STR_METHODS = new Set([
  'capitalize',
  'casefold',
  'center',
  'count',
  'encode',
  'endswith',
  'expandtabs',
  'find',
  'format',
  'format_map',
  'index',
  'isalnum',
  'isalpha',
  'isascii',
  'isdecimal',
  'isdigit',
  'isidentifier',
  'islower',
  'isnumeric',
  'isprintable',
  'isspace',
  'istitle',
  'isupper',
  'join',
  'ljust',
  'lower',
  'lstrip',
  'maketrans',
  'partition',
  'removeprefix',
  'removesuffix',
  'replace',
  'rfind',
  'rindex',
  'rjust',
  'rpartition',
  'rsplit',
  'rstrip',
  'split',
  'splitlines',
  'startswith',
  'strip',
  'swapcase',
  'title',
  'translate',
  'upper',
  'zfill',
])

// TextChoices members are class attributes, not model fields, so a trailing
// underscore is enough to dodge a keyword (fields.E001 does not apply); the
// value stored is still the schema's.
function enumMemberName(valueName: string) {
  return PYTHON_KEYWORDS.has(valueName) ||
    CHOICES_RESERVED.has(valueName) ||
    STR_METHODS.has(valueName)
    ? `${valueName}_`
    : valueName
}

// The Django field of a native type that takes no arguments of its own.
const NATIVE_DJANGO_FIELDS: { readonly [nativeType: string]: string } = {
  Text: 'TextField',
  TinyText: 'TextField',
  MediumText: 'TextField',
  LongText: 'TextField',
  Citext: 'TextField',
  Xml: 'TextField',
  Bit: 'TextField',
  VarBit: 'TextField',
  SmallInt: 'SmallIntegerField',
  TinyInt: 'SmallIntegerField',
  MediumInt: 'IntegerField',
  Integer: 'IntegerField',
  Oid: 'IntegerField',
  BigInt: 'BigIntegerField',
  Real: 'FloatField',
  DoublePrecision: 'FloatField',
  Double: 'FloatField',
  Uuid: 'UUIDField',
  Date: 'DateField',
  Time: 'TimeField',
  Timetz: 'TimeField',
  Timestamp: 'DateTimeField',
  Timestamptz: 'DateTimeField',
  Json: 'JSONField',
  JsonB: 'JSONField',
  ByteA: 'BinaryField',
  Inet: 'GenericIPAddressField',
  Boolean: 'BooleanField',
}

function resolveDjangoField(field: DMMF.Field) {
  const base = prismaTypeToDjangoField(field.type)
  // Django's DecimalField requires both arguments; (65, 30) is the precision
  // Prisma itself uses for an unannotated Decimal column.
  const baseResolved =
    base === 'DecimalField'
      ? { ctor: base, typeArgs: ['max_digits=65', 'decimal_places=30'] }
      : { ctor: base, typeArgs: [] }
  if (!field.nativeType) return baseResolved

  const [nativeName, nativeArgs] = field.nativeType
  const args = nativeArgs ?? []

  if (nativeName === 'VarChar' || nativeName === 'Char') {
    return args.length > 0
      ? { ctor: 'CharField', typeArgs: [`max_length=${args[0]}`] }
      : { ctor: 'TextField', typeArgs: [] }
  }
  if (nativeName === 'Decimal' || nativeName === 'Money') {
    return args.length >= 2
      ? { ctor: 'DecimalField', typeArgs: [`max_digits=${args[0]}`, `decimal_places=${args[1]}`] }
      : { ctor: 'DecimalField', typeArgs: ['max_digits=65', 'decimal_places=30'] }
  }
  const ctor = NATIVE_DJANGO_FIELDS[nativeName]
  return ctor === undefined ? baseResolved : { ctor, typeArgs: [] }
}

function dbGeneratedExpr(field: DMMF.Field) {
  return isFunctionDefault(field.default) &&
    field.default.name === 'dbgenerated' &&
    typeof field.default.args[0] === 'string'
    ? field.default.args[0]
    : null
}

// The Python type a DateTime column's value is: a date or time column holds
// just that.
function dateTimeKind(field: DMMF.Field) {
  const { ctor } = resolveDjangoField(field)
  if (ctor === 'DateField') return 'date'
  return ctor === 'TimeField' ? 'time' : 'datetime'
}

// A literal on a date or time column is the date or the time Prisma writes, the
// UTC part of the instant; as a datetime, Django would take it in TIME_ZONE
// first and could land on the day before.
function dateTimeLiteral(field: DMMF.Field, iso: string) {
  const at = new Date(iso)
  const kind = dateTimeKind(field)
  if (kind === 'date') {
    return `date(${at.getUTCFullYear()}, ${at.getUTCMonth() + 1}, ${at.getUTCDate()})`
  }
  if (kind === 'time') {
    const micro = at.getUTCMilliseconds() * 1000
    const parts = [at.getUTCHours(), at.getUTCMinutes(), at.getUTCSeconds()]
    return `time(${[...parts, ...(micro > 0 ? [micro] : [])].join(', ')})`
  }
  return `datetime.fromisoformat(${toPythonString(iso)})`
}

// Prisma keeps a DateTime as a UTC instant with no zone: timestamp(3) on
// PostgreSQL, datetime(3) on MySQL, ISO 8601 text on SQLite. Django's own field
// reads such a column in the connection's zone and writes its own text format,
// so every one but PostgreSQL's timestamptz goes through UtcDateTimeField.
function holdsUtc(field: DMMF.Field, provider: string) {
  if (field.type !== 'DateTime' || resolveDjangoField(field).ctor !== 'DateTimeField') return false
  const zoned = provider === 'postgresql' || provider === 'cockroachdb'
  return !(zoned && field.nativeType?.[0] === 'Timestamptz')
}

function scalarElementLiteral(field: DMMF.Field, value: unknown) {
  const { type } = field
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  if (typeof value === 'number') {
    return type === 'Decimal' ? `Decimal("${value}")` : String(value)
  }
  if (typeof value === 'string') {
    if (type === 'BigInt') return value
    if (type === 'Decimal') return `Decimal("${value}")`
    if (type === 'DateTime') return dateTimeLiteral(field, value)
    // A Json list default arrives as one JSON document per element; the column
    // stores the parsed value, not the text of it.
    if (type === 'Json') return jsonToPythonLiteral(JSON.parse(value))
    return toPythonString(value)
  }
  return jsonToPythonLiteral(value)
}

function fieldColumnName(field: DMMF.Field) {
  return field.dbName ?? field.name
}

// Prisma field names are unique per model and model names are unique, so a
// model plus a field names one thing; "." cannot appear in either.
function nameKey(modelName: string, fieldName: string) {
  return `${modelName}.${fieldName}`
}

// Two Prisma names can fold onto one Python identifier — `myValue` and
// `my_value` both snake_case to `my_value`, `value_` and `value_field` both
// dodge fields.E001 as `value_field`. Python would keep the last definition and
// the other column would vanish without a word, so the later one steps aside.
function claimName(preferred: string, taken: Set<string>) {
  const free = taken.has(preferred)
    ? Array.from({ length: taken.size + 1 }, (_, i) => `${preferred}_${i + 2}`).find(
        (candidate) => !taken.has(candidate),
      )
    : preferred
  const name = free ?? preferred
  taken.add(name)
  return name
}

// The module-level names a model's class body reads while Python executes it:
// `models` on every field line, and what a default names (`now_milliseconds`,
// `uuid.uuid4`, `date(...)`, `list`, a helper function). An attribute is
// always lower snake_case, so the capitalised ones (`UtcDateTimeField`,
// `ArrayField`, `Decimal`, an enum class) cannot be hidden by a field.
const MODULE_NAMES = new Set([
  'models',
  'timezone',
  'uuid',
  'uuid6',
  'datetime',
  'date',
  'time',
  'utc_today',
  'utc_time',
  'now_milliseconds',
  'uuid4_str',
  'uuid7_str',
  'ulid_str',
  'cuid_str',
  'cuid2_str',
  'nanoid_str',
  'partial',
  'list',
  'dict',
])

// The attribute a field is emitted under, resolved once per model so that the
// columns, the Meta options and the composite primary key all name the same
// thing. Walked in field order, which is the order the class body is written in,
// and claiming a name only for the fields that are actually emitted.
//
// A class attribute hides a module-level name of the same spelling from every
// line after it in the class body: a field `uuid` followed by a column
// whose default is `uuid.uuid4` would read the field. Such a field takes
// inspectdb's `<name>_field`, as a reserved name does, and keeps its column
// through db_column.
// `pk` belongs to Django, whether or not this model declares a composite one.
const DJANGO_OWN_ATTRS: readonly string[] = ['pk']

function modelAttrNames(
  model: DMMF.Model,
  m2mTables: readonly { relationName: string; leftModel: string; rightModel: string }[],
) {
  const belongsTo = singleColumnBelongsTo(model)
  const fkByScalarName = new Map(belongsTo.map((f) => [f.relationFromFields?.[0], f]))
  // `pk` belongs to Django, whether or not this model declares a composite one.
  const taken = new Set(DJANGO_OWN_ATTRS)
  const names = new Map<string, string>()
  // What each field's line reads, at the field's place in the body. A foreign
  // key is written where its scalar column sits, so its defaults are read
  // there; a relation field writes a line only on the declaring side of a
  // many-to-many. A default helper's name is read too, but helpers step aside
  // from every attribute in resolveNames.
  const unresolved = { attr: new Map<string, string>(), helper: new Map<string, string>() }
  const reads = model.fields.map((field) => {
    if (field.kind === 'object') {
      return field.isList && isDeclaringM2MSide(model, field, m2mTables) ? ['models'] : []
    }
    // `default=partial(nanoid_str, size=10)` reads both names.
    const defaults = formatDefaultArgs(model, field, unresolved).flatMap((arg) => {
      const match = /^\w+=(partial\()?([a-z_]\w*)/u.exec(arg)
      if (match === null) return []
      return match[1] === undefined ? [match[2]] : ['partial', match[2]]
    })
    return ['models', ...defaults]
  })

  for (const [i, field] of model.fields.entries()) {
    const readLater = new Set(reads.slice(i + 1).flat())
    const attrFor = (prismaName: string) => {
      const attr = djangoAttrName(makeSnakeCase(prismaName))
      return MODULE_NAMES.has(attr) && readLater.has(attr) ? `${attr}_field` : attr
    }
    if (field.kind === 'object') {
      if (field.isList && isDeclaringM2MSide(model, field, m2mTables)) {
        names.set(field.name, claimName(attrFor(field.name), taken))
      }
      continue
    }
    const owner = fkByScalarName.get(field.name)
    if (owner) {
      // A foreign key is reachable by the relation field's name and by the
      // scalar column it collapsed, and both must answer with one attribute.
      const attr = claimName(attrFor(owner.name), taken)
      names.set(owner.name, attr)
      names.set(field.name, attr)
      continue
    }
    names.set(field.name, claimName(attrFor(field.name), taken))
  }

  return names
}

// Helper function names live in the module, so they are resolved across every
// model at once: `Foo.barBaz` and `FooBar.baz` both want `foo_bar_baz_default`.
export function resolveNames(
  models: readonly DMMF.Model[],
  m2mTables: readonly { relationName: string; leftModel: string; rightModel: string }[] = [],
) {
  const attr = new Map<string, string>()
  for (const model of models) {
    for (const [fieldName, attrName] of modelAttrNames(model, m2mTables)) {
      attr.set(nameKey(model.name, fieldName), attrName)
    }
  }

  // A helper is read in the class body by its name, so it steps aside from
  // every attribute a field took as well.
  const takenHelpers = new Set([
    'uuid4_str',
    'uuid7_str',
    'ulid_str',
    'cuid_str',
    'cuid2_str',
    'nanoid_str',
    ...attr.values(),
  ])
  const helper = new Map<string, string>()
  for (const model of models) {
    for (const field of model.fields) {
      if (field.kind === 'object') continue
      const attrName = attr.get(nameKey(model.name, field.name)) ?? makeSnakeCase(field.name)
      helper.set(
        nameKey(model.name, field.name),
        claimName(`${makeSnakeCase(model.name)}_${attrName}_default`, takenHelpers),
      )
    }
  }

  return { attr, helper } as const
}

type Names = ReturnType<typeof resolveNames>

function attrNameOf(names: Names, model: DMMF.Model, field: DMMF.Field) {
  return names.attr.get(nameKey(model.name, field.name)) ?? djangoAttrName(fieldColumnName(field))
}

function helperNameOf(names: Names, model: DMMF.Model, field: DMMF.Field) {
  return (
    names.helper.get(nameKey(model.name, field.name)) ??
    `${makeSnakeCase(model.name)}_${djangoAttrName(makeSnakeCase(field.name))}_default`
  )
}

// A JSON object/array or populated scalar-list default needs a module-level
// function: a shared mutable literal is the classic pitfall, and Django
// migrations cannot serialize a lambda.
// The Python type of a list default's elements.
function listElementPythonType(field: DMMF.Field) {
  if (field.kind === 'enum') return 'str'
  return field.type === 'DateTime' ? dateTimeKind(field) : (PRISMA_TO_PYTHON[field.type] ?? 'str')
}

function fieldDefaultHelper(
  model: DMMF.Model,
  field: DMMF.Field,
  names: Names,
  enumMap: ReadonlyMap<string, DMMF.DatamodelEnum>,
) {
  const helperName = helperNameOf(names, model, field)
  if (field.isList && Array.isArray(field.default) && field.default.length > 0) {
    // An enum list default arrives as Prisma-level value names; the column
    // stores the mapped ones, which the TextChoices members carry.
    const enumDef = field.kind === 'enum' ? enumMap.get(field.type) : undefined
    const pythonType = listElementPythonType(field)
    const items = field.default
      .map((v) =>
        enumDef && typeof v === 'string'
          ? `${makePascalCase(field.type)}.${enumMemberName(v)}`
          : scalarElementLiteral(field, v),
      )
      .join(', ')
    return [`def ${helperName}() -> list[${pythonType}]:`, `    return [${items}]`].join('\n')
  }
  if (field.type === 'Json' && typeof field.default === 'string') {
    const parsed: unknown = JSON.parse(field.default)
    if (typeof parsed === 'object' && parsed !== null) {
      const isEmpty = Array.isArray(parsed) ? parsed.length === 0 : Object.keys(parsed).length === 0
      if (isEmpty) return null
      const returnType = Array.isArray(parsed) ? 'list[Any]' : 'dict[str, Any]'
      return [
        `def ${helperName}() -> ${returnType}:`,
        `    return ${jsonToPythonLiteral(parsed)}`,
      ].join('\n')
    }
    // Django's fields.E010 wants every JSONField default behind a callable,
    // scalar values included.
    return [
      `def ${helperName}() -> ${jsonScalarReturnType(parsed)}:`,
      `    return ${jsonToPythonLiteral(parsed)}`,
    ].join('\n')
  }
  return null
}

function pythonBytesLiteral(base64: string) {
  const escaped = [...Buffer.from(base64, 'base64')]
    .map((byte) => `\\x${byte.toString(16).padStart(2, '0')}`)
    .join('')
  return `b"${escaped}"`
}

function jsonScalarReturnType(parsed: unknown) {
  if (typeof parsed === 'string') return 'str'
  if (typeof parsed === 'boolean') return 'bool'
  if (typeof parsed === 'number') return Number.isInteger(parsed) ? 'int' : 'float'
  return 'None'
}

export function collectDefaultHelpers(
  models: readonly DMMF.Model[],
  names: Names,
  enums?: readonly DMMF.DatamodelEnum[],
) {
  const enumMap = new Map((enums ?? []).map((e) => [e.name, e]))
  const idHelpers = [
    models.some((m) =>
      m.fields.some((f) => uuidDefaultVersion(f) === 4 && f.nativeType?.[0] !== 'Uuid'),
    )
      ? ['def uuid4_str() -> str:', '    return str(uuid.uuid4())'].join('\n')
      : null,
    models.some((m) =>
      m.fields.some((f) => uuidDefaultVersion(f) === 7 && f.nativeType?.[0] !== 'Uuid'),
    )
      ? ['def uuid7_str() -> str:', '    return str(uuid6.uuid7())'].join('\n')
      : null,
    models.some((m) => m.fields.some((f) => isUlidDefault(f)))
      ? ['def ulid_str() -> str:', '    return str(ULID())'].join('\n')
      : null,
    // cuid ships no types, so mypy reads its call as Any: str() gives the helper the str it returns.
    models.some((m) => m.fields.some((f) => cuidDefaultVersion(f) === 1))
      ? ['def cuid_str() -> str:', '    return str(cuid.cuid())'].join('\n')
      : null,
    models.some((m) => m.fields.some((f) => cuidDefaultVersion(f) === 2))
      ? ['def cuid2_str() -> str:', '    return cuid2.create_id()'].join('\n')
      : null,
  ].filter((h) => h !== null)

  // One helper for every length, so that a migration naming it still loads after
  // a length changes. generate() takes the alphabet first: the length goes by name.
  const nanoidHelpers = models.some((m) => m.fields.some((f) => nanoidDefault(f) !== null))
    ? [
        ['def nanoid_str(size: int = 21) -> str:', '    return nanoid.generate(size=size)'].join(
          '\n',
        ),
      ]
    : []

  // What now() and @updatedAt stamp on a date or a time column: the UTC date or
  // time of day, as Prisma Client writes them.
  const nowKinds = new Set(
    models.flatMap((m) =>
      m.fields.filter((f) => isNowDefault(f) || f.isUpdatedAt === true).map((f) => dateTimeKind(f)),
    ),
  )
  // Prisma's DateTime is timestamp(3) / datetime(3): a now() or @updatedAt stamp
  // with microseconds would leave the instance (and a primary key it is part of)
  // apart from its row.
  const nowHelpers = [
    nowKinds.has('datetime')
      ? [
          'def now_milliseconds() -> datetime:',
          '    now = timezone.now()',
          '    return now.replace(microsecond=now.microsecond // 1000 * 1000)',
        ].join('\n')
      : null,
    nowKinds.has('date')
      ? ['def utc_today() -> date:', '    return datetime.now(dt_timezone.utc).date()'].join('\n')
      : null,
    nowKinds.has('time')
      ? [
          'def utc_time() -> time:',
          '    now = datetime.now(dt_timezone.utc)',
          '    return now.replace(microsecond=now.microsecond // 1000 * 1000).time()',
        ].join('\n')
      : null,
  ].filter((h) => h !== null)

  const fieldHelpers = models.flatMap((model) =>
    model.fields
      .filter((f) => f.kind !== 'object')
      .map((field) => fieldDefaultHelper(model, field, names, enumMap))
      .filter((h) => h !== null),
  )

  return [...idHelpers, ...nanoidHelpers, ...nowHelpers, ...fieldHelpers]
}

// cspell:ignore datetimefield
const UTC_DATETIME_FIELD = `class UtcDateTimeField(models.DateTimeField):  # type: ignore[type-arg]
    def get_db_prep_value(self, value: Any, connection: BaseDatabaseWrapper, prepared: bool = False) -> Any:
        if not prepared:
            value = self.get_prep_value(value)
        if not isinstance(value, datetime):
            return super().get_db_prep_value(value, connection, prepared=True)
        if timezone.is_naive(value):
            value = timezone.make_aware(value, timezone.get_default_timezone())
        value = value.astimezone(dt_timezone.utc)
        if connection.vendor == "sqlite":
            return value.isoformat(timespec="milliseconds")
        return connection.ops.adapt_datetimefield_value(value.replace(tzinfo=None))

    def from_db_value(self, value: datetime | None, expression: Any, connection: BaseDatabaseWrapper) -> datetime | None:
        if value is None:
            return None
        if timezone.is_naive(value):
            value = value.replace(tzinfo=dt_timezone.utc)
        return value if settings.USE_TZ else timezone.make_naive(value, timezone.get_default_timezone())`

const AUTO_NOW_QUERY_SET = `_M = TypeVar("_M", bound=models.Model)


class AutoNowQuerySet(models.QuerySet[_M]):
    def update(self, **kwargs: Any) -> int:
        for field in self.model._meta.concrete_fields:
            if getattr(field, "auto_now", False):
                kwargs.setdefault(field.name, getattr(field, "stamp", timezone.now)())
        return super().update(**kwargs)`

/** PostgreSQL and CockroachDB, where Prisma makes an enum a type of its own and a list an array. */
function hasEnumTypes(provider: string) {
  return provider === 'postgresql' || provider === 'cockroachdb'
}

/** `"Name"`, as PostgreSQL quotes an identifier. */
function quotedIdentifier(name: string) {
  return `"${name.replaceAll('"', '""')}"`
}

/**
 * The SQL type Prisma creates for each enum: its `@@map` name, in its `@@schema` when it names one.
 *
 * @param enums - The enums of the datamodel.
 * @param schemas - The `@@schema` of each enum that names one, which DMMF does not carry.
 * @returns The quoted type name of each enum, by its Prisma name.
 */
export function enumSqlTypes(
  enums: readonly DMMF.DatamodelEnum[],
  schemas: ReadonlyMap<string, string>,
) {
  return new Map(
    enums.map((e) => {
      const schema = schemas.get(e.name)
      const type = quotedIdentifier(e.dbName ?? e.name)
      return [e.name, schema === undefined ? type : `${quotedIdentifier(schema)}.${type}`]
    }),
  )
}

// An enum list is a column of the enum's array type, which PostgreSQL will not take a text[] for:
// ArrayField's placeholder casts to db_type, so the parameter is bound as the enum's array, and a
// lookup's right-hand side through cast_db_type. The driver knows no loader for the enum, and would
// hand the array back as its text ('{a,b}'), so it is selected as text[].
const ENUM_ARRAY_FIELD = `class EnumArrayField(ArrayField):  # type: ignore[type-arg]
    def __init__(self, base_field: Any, db_enum: str, **kwargs: Any) -> None:
        self.db_enum = db_enum
        super().__init__(base_field, **kwargs)

    def deconstruct(self) -> Any:
        name, path, args, kwargs = super().deconstruct()
        kwargs["db_enum"] = self.db_enum
        return name, path, args, kwargs

    def db_type(self, connection: BaseDatabaseWrapper) -> str:
        return f"{self.db_enum}[]"

    def cast_db_type(self, connection: BaseDatabaseWrapper) -> str:
        return self.db_type(connection)

    def select_format(self, compiler: Any, sql: str, params: Any) -> Any:
        return f"{sql}::text[]", params`

// A @db.Json column is PostgreSQL's json, which psycopg 2 and 3 load into Python values themselves
// (Django registers a text loader for jsonb only): JSONField.from_db_value would hand the value to
// json.loads, and decode a JSON string a second time. On PostgreSQL what the driver loaded is kept as
// it is, and db_type is the column Prisma creates, so that migrate makes json rather than jsonb;
// another backend (a test settings file on SQLite) hands back the text, which JSONField decodes.
const PLAIN_JSON_FIELD = `class PlainJSONField(models.JSONField):
    def db_type(self, connection: BaseDatabaseWrapper) -> str | None:
        return "json" if connection.vendor == "postgresql" else super().db_type(connection)

    def from_db_value(self, value: Any, expression: Any, connection: BaseDatabaseWrapper) -> Any:
        if connection.vendor != "postgresql":
            return super().from_db_value(value, expression, connection)
        return value`

/** A `@db.Json` column on PostgreSQL: the field PlainJSONField declares. */
function isPlainJson(field: DMMF.Field, provider: string) {
  return field.type === 'Json' && field.nativeType?.[0] === 'Json' && provider === 'postgresql'
}

/** An enum list on a database that has enum types: the field EnumArrayField declares. */
function isEnumArray(field: DMMF.Field, provider: string) {
  return field.kind === 'enum' && field.isList && hasEnumTypes(provider)
}

// Django's auto_now takes the local date or time of day, and an instant with
// microseconds; Prisma's @updatedAt on a @db.Date or @db.Time column writes the
// UTC one, and on a DateTime the instant in milliseconds.
const STAMPED_FIELDS = [
  { name: 'UtcDateField', base: 'models.DateField', type: 'date', helper: 'utc_today' },
  { name: 'UtcTimeField', base: 'models.TimeField', type: 'time', helper: 'utc_time' },
  {
    name: 'UtcAutoNowDateTimeField',
    base: 'UtcDateTimeField',
    type: 'datetime',
    helper: 'now_milliseconds',
  },
  {
    name: 'AutoNowDateTimeField',
    base: 'models.DateTimeField',
    type: 'datetime',
    helper: 'now_milliseconds',
  },
] as const

type StampedField = (typeof STAMPED_FIELDS)[number]

function stampedField({ name, base, type, helper }: StampedField) {
  // UtcDateTimeField is already declared without type arguments.
  const ignore = base.startsWith('models.') ? '  # type: ignore[type-arg]' : ''
  return `class ${name}(${base}):${ignore}
    def stamp(self) -> ${type}:
        return ${helper}()

    def pre_save(self, model_instance: models.Model, add: bool) -> Any:
        if not self.auto_now:
            return super().pre_save(model_instance, add)
        value = self.stamp()
        setattr(model_instance, self.attname, value)
        return value`
}

// The class an @updatedAt column is declared with.
function stampedFieldClass(field: DMMF.Field, provider: string): StampedField['name'] | null {
  if (field.isUpdatedAt !== true) return null
  const kind = dateTimeKind(field)
  if (kind === 'date') return 'UtcDateField'
  if (kind === 'time') return 'UtcTimeField'
  return holdsUtc(field, provider) ? 'UtcAutoNowDateTimeField' : 'AutoNowDateTimeField'
}

// The field every zoneless DateTime column is declared with, those of an
// @updatedAt column, the one an enum list is declared with, and the QuerySet a model with an @updatedAt field is
// managed by, each written once per file.
export function collectFieldClasses(models: readonly DMMF.Model[], provider: string) {
  const scalarFields = models.flatMap((m) => m.fields.filter((f) => f.kind !== 'object'))
  const stamped = new Set(scalarFields.map((f) => stampedFieldClass(f, provider)))
  return [
    scalarFields.some((f) => holdsUtc(f, provider)) ? UTC_DATETIME_FIELD : null,
    ...STAMPED_FIELDS.filter((f) => stamped.has(f.name)).map((f) => stampedField(f)),
    scalarFields.some((f) => isEnumArray(f, provider)) ? ENUM_ARRAY_FIELD : null,
    scalarFields.some((f) => isPlainJson(f, provider)) ? PLAIN_JSON_FIELD : null,
    scalarFields.some((f) => f.isUpdatedAt === true) ? AUTO_NOW_QUERY_SET : null,
  ].filter((c) => c !== null)
}

/** `{}`: an object, not an array, with no key. */
function isEmptyObject(value: unknown) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  )
}

// What now() stamps, by the kind of value the column holds.
const NOW_DEFAULTS: { readonly [kind in 'date' | 'time' | 'datetime']: string } = {
  date: 'default=utc_today',
  time: 'default=utc_time',
  datetime: 'default=now_milliseconds',
}

// The default a nanoid() column is made by: nanoid_str, or a partial of it for
// nanoid(16), which a migration serializes as functools.partial.
function nanoidDefaultArg(length: number | null) {
  return length === null ? 'default=nanoid_str' : `default=partial(nanoid_str, size=${length})`
}

// The default of a field the server or a generator fills, or null for one
// whose default is a literal or nothing.
function generatedDefaultArgs(field: DMMF.Field) {
  // Prisma's @updatedAt also sets the value on create, as auto_now does on every
  // save(). A bulk UPDATE is the model's AutoNowQuerySet's to stamp: auto_now
  // alone never fires there. auto_now is mutually exclusive with
  // default/db_default.
  if (field.isUpdatedAt === true) return ['auto_now=True']

  const generated = dbGeneratedExpr(field)
  // dbgenerated() is a raw DDL expression no client library can evaluate.
  if (generated !== null) return [`db_default=RawSQL(${toPythonString(generated)}, [])`]

  // Prisma Client fills now() itself, in UTC. A db_default would be evaluated in
  // the session's zone and, on MySQL, which has no RETURNING, would leave the
  // expression on the instance for the next save() to write back.
  if (isNowDefault(field)) return [NOW_DEFAULTS[dateTimeKind(field)]]

  const uuidVersion = uuidDefaultVersion(field)
  if (uuidVersion !== null) {
    const isNativeUuid = field.nativeType?.[0] === 'Uuid'
    if (isNativeUuid) return [uuidVersion === 7 ? 'default=uuid6.uuid7' : 'default=uuid.uuid4']
    return [uuidVersion === 7 ? 'default=uuid7_str' : 'default=uuid4_str']
  }
  if (isUlidDefault(field)) return ['default=ulid_str']
  // cuid() is the cuid package's (version 1), cuid(2) cuid2's and nanoid() nanoid's, the ids
  // Prisma Client makes.
  const cuidVersion = cuidDefaultVersion(field)
  if (cuidVersion !== null) return [cuidVersion === 2 ? 'default=cuid2_str' : 'default=cuid_str']
  const nanoid = nanoidDefault(field)
  if (nanoid !== null) return [nanoidDefaultArg(nanoid.length)]
  return null
}

// DMMF carries BigInt defaults as digit strings, DateTime literals as ISO
// strings, and Json defaults as JSON text; each needs its Python shape,
// not a bare quoted string.
function stringDefaultArgs(model: DMMF.Model, field: DMMF.Field, def: string, names: Names) {
  if (field.type === 'BigInt') return [`default=${def}`]
  if (field.type === 'Decimal') return [`default=Decimal("${def}")`]
  if (field.type === 'DateTime') return [`default=${dateTimeLiteral(field, def)}`]
  // A Bytes default is base64 text; the column holds the bytes it encodes.
  if (field.type === 'Bytes') return [`default=${pythonBytesLiteral(def)}`]
  if (field.type === 'Json') {
    const parsed: unknown = JSON.parse(def)
    if (Array.isArray(parsed) && parsed.length === 0) return ['default=list']
    if (isEmptyObject(parsed)) return ['default=dict']
    return [`default=${helperNameOf(names, model, field)}`]
  }
  return [`default=${toPythonString(def)}`]
}

function formatDefaultArgs(model: DMMF.Model, field: DMMF.Field, names: Names) {
  const generated = generatedDefaultArgs(field)
  if (generated !== null) return generated

  const def = field.default
  if (def === undefined || def === null) return []
  // autoincrement() and sequence() are the database's to fill: no Python-side
  // default is emitted (an autoincrement key is the AutoField ctor).
  if (isFunctionDefault(def)) return []

  if (Array.isArray(def)) {
    return def.length === 0 ? ['default=list'] : [`default=${helperNameOf(names, model, field)}`]
  }
  // An enum default arrives as the Prisma-level value name; the TextChoices
  // member carries the @map-ped database value.
  if (field.kind === 'enum' && typeof def === 'string') {
    return [`default=${makePascalCase(field.type)}.${enumMemberName(def)}`]
  }
  if (typeof def === 'boolean') return [def ? 'default=True' : 'default=False']
  if (typeof def === 'number') {
    return field.type === 'Decimal' ? [`default=Decimal("${def}")`] : [`default=${def}`]
  }
  if (typeof def === 'string') return stringDefaultArgs(model, field, def, names)
  return []
}

function autoFieldCtor(field: DMMF.Field) {
  if (field.nativeType?.[0] === 'SmallInt') return 'SmallAutoField'
  return field.type === 'BigInt' ? 'BigAutoField' : 'AutoField'
}

function scalarFieldClass(field: DMMF.Field, provider: string, ctor: string) {
  const stamped = stampedFieldClass(field, provider)
  if (stamped !== null) return stamped
  if (holdsUtc(field, provider)) return 'UtcDateTimeField'
  return isPlainJson(field, provider) ? 'PlainJSONField' : `models.${ctor}`
}

// The field class of a scalar column. Prisma makes a String with no native
// type VARCHAR(191) on MySQL: a TextField would be longtext there, which MySQL
// cannot use in a key, a unique constraint or an index without a key length.
function columnDjangoField(field: DMMF.Field, provider: string) {
  if (field.kind === 'enum') {
    return { ctor: 'TextField', typeArgs: [`choices=${makePascalCase(field.type)}.choices`] }
  }
  return provider === 'mysql' && field.type === 'String' && !field.nativeType
    ? { ctor: 'CharField', typeArgs: ['max_length=191'] }
    : resolveDjangoField(field)
}

function generateScalarField(
  model: DMMF.Model,
  field: DMMF.Field,
  isPk: boolean,
  names: Names,
  provider: string,
  enumTypes: ReadonlyMap<string, string>,
) {
  const columnName = fieldColumnName(field)
  const attrName = attrNameOf(names, model, field)

  const resolved = columnDjangoField(field, provider)

  const ctorResolved =
    isPk && isAutoincrement(field) ? { ctor: autoFieldCtor(field), typeArgs: [] } : resolved

  const defaultArgs = formatDefaultArgs(model, field, names)

  // Django fills an unset value of a string-backed field with "" rather than
  // None, and an empty-string primary key still counts as set: save() would
  // UPDATE the row that already holds "" instead of inserting. A primary key
  // the model gives no default is pinned to None so an unassigned one fails
  // loudly on INSERT.
  const emptyStringPk =
    isPk &&
    defaultArgs.length === 0 &&
    ['TextField', 'CharField', 'BinaryField'].includes(ctorResolved.ctor)

  const outerArgs = [
    isPk ? 'primary_key=True' : null,
    // A Prisma scalar list is never optional (an empty array, not NULL).
    !field.isList && !field.isRequired ? 'null=True' : null,
    // A primary key is unique already; a @unique standing in for a missing @id
    // would only say it twice.
    field.isUnique && !isPk ? 'unique=True' : null,
    attrName !== columnName ? `db_column=${toPythonString(columnName)}` : null,
    ...defaultArgs,
    emptyStringPk ? 'default=None' : null,
  ].filter((a) => a !== null)

  const fieldClass = scalarFieldClass(field, provider, ctorResolved.ctor)
  if (field.isList) {
    const inner = `${fieldClass}(${ctorResolved.typeArgs.join(', ')})`
    if (isEnumArray(field, provider)) {
      const sqlType = enumTypes.get(field.type) ?? quotedIdentifier(field.type)
      const dbEnum = `db_enum=${toPythonString(sqlType)}`
      return `    ${attrName} = EnumArrayField(${[inner, dbEnum, ...outerArgs].join(', ')})`
    }
    return `    ${attrName} = ArrayField(${[inner, ...outerArgs].join(', ')})`
  }
  return `    ${attrName} = ${fieldClass}(${[...ctorResolved.typeArgs, ...outerArgs].join(', ')})`
}

const ON_DELETE: { [k: string]: string } = {
  Cascade: 'models.CASCADE',
  SetNull: 'models.SET_NULL',
  Restrict: 'models.RESTRICT',
  NoAction: 'models.DO_NOTHING',
  SetDefault: 'models.SET_DEFAULT',
}

function onDeleteFor(relationField: DMMF.Field, scalarField: DMMF.Field) {
  const action = ON_DELETE[relationField.relationOnDelete ?? '']
  if (action !== undefined) return action
  // Prisma's implicit referential actions: SetNull where the key can be null,
  // Restrict where it cannot. Prisma reads that from the key, not from the `?`
  // on the relation, which can be optional over a required column.
  return scalarField.isRequired ? 'models.RESTRICT' : 'models.SET_NULL'
}

// to_field names a Django field on the target, so it uses the attribute that
// model resolved for it. The target's primary key is what a ForeignKey
// points at without one.
function toFieldArg(relationField: DMMF.Field, allModels: readonly DMMF.Model[], names: Names) {
  const targetModel = allModels.find((m) => m.name === relationField.type)
  const referencedName = relationField.relationToFields?.[0]
  const referencedField = targetModel?.fields.find((f) => f.name === referencedName)
  const targetPk = targetModel ? primaryKeyFields(targetModel) : []
  return referencedField &&
    targetModel &&
    !(targetPk.length === 1 && targetPk[0] === referencedName)
    ? `to_field=${toPythonString(attrNameOf(names, targetModel, referencedField))}`
    : null
}

function generateForeignKeyField(
  model: DMMF.Model,
  relationField: DMMF.Field,
  scalarField: DMMF.Field,
  allModels: readonly DMMF.Model[],
  names: Names,
  isPk: boolean,
  views: ReadonlySet<string>,
) {
  const attrName = attrNameOf(names, model, relationField)
  const columnName = fieldColumnName(scalarField)
  const backField = backRelation(relationField, model, allModels)
  const ctor = backField && !backField.isList ? 'OneToOneField' : 'ForeignKey'
  const target =
    relationField.type === model.name ? '"self"' : `"${makePascalCase(relationField.type)}"`
  // The reverse accessor is read as an attribute on the target, so it goes
  // through the same folding a field name does.
  const relatedName = backField
    ? toPythonString(djangoAttrName(makeSnakeCase(backField.name)))
    : '"+"'

  const args = [
    target,
    // A view's relation is no foreign key the database holds: Django must neither refuse a delete
    // over it nor cascade one into the view.
    `on_delete=${views.has(model.name) ? 'models.DO_NOTHING' : onDeleteFor(relationField, scalarField)}`,
    `related_name=${relatedName}`,
    toFieldArg(relationField, allModels, names),
    isPk ? 'primary_key=True' : null,
    columnName !== `${attrName}_id` ? `db_column=${toPythonString(columnName)}` : null,
    // The column is nullable as its scalar field is: a relation can be optional
    // (`PublicTypebot?`) over a required key, which a CompositePrimaryKey then
    // takes (models.E042 refuses a null=True field there).
    !scalarField.isRequired ? 'null=True' : null,
    // Django indexes every ForeignKey by default (plus a text_pattern_ops
    // companion on a text column); Prisma indexes none of them. Whatever the
    // schema actually declares arrives through Meta.indexes instead, so leaving
    // this on would add one or two indexes the database does not have.
    ctor === 'ForeignKey' ? 'db_index=False' : null,
    // Prisma Migrate makes no foreign key to or from a view, and the database could not hold one.
    views.has(relationField.type) || views.has(model.name) ? 'db_constraint=False' : null,
    ...formatDefaultArgs(model, scalarField, names),
  ].filter((a) => a !== null)

  return `    ${attrName} = models.${ctor}(${args.join(', ')})`
}

// A through model is a class Prisma never named, so its name can land on one a
// model or enum already owns. Python would redefine the class and Django would
// keep only the last one, dropping the other model with a warning, so the
// through class steps aside instead.
function uniqueClassName(preferred: string, taken: ReadonlySet<string>) {
  if (!taken.has(preferred)) return preferred
  const suffixed = `${preferred}Through`
  if (!taken.has(suffixed)) return suffixed
  const nth = Array.from({ length: taken.size + 1 }, (_, i) => `${suffixed}${i + 2}`).find(
    (candidate) => !taken.has(candidate),
  )
  return nth ?? suffixed
}

export function collectManyToManyTables(
  allModels: readonly DMMF.Model[],
  enums?: readonly DMMF.DatamodelEnum[],
) {
  const candidates = allModels.flatMap((model) =>
    model.fields.flatMap((field) => {
      if (field.kind !== 'object' || !field.isList) return []
      const otherSide = backRelation(field, model, allModels)
      if (otherSide?.isList !== true) return []

      const [leftName, rightName] =
        model.name < field.type ? [model.name, field.type] : [field.type, model.name]

      // Prisma names the implicit join table `_<relationName>` (default
      // relationName is the two model names alphabetically joined by "To").
      const relationName = field.relationName ?? `${leftName}To${rightName}`
      return [
        {
          relationName,
          tableName: `_${relationName}`,
          preferredClassName: makePascalCase(relationName),
          leftModel: leftName,
          rightModel: rightName,
        },
      ]
    }),
  )

  const taken = new Set([
    ...allModels.map((m) => makePascalCase(m.name)),
    ...(enums ?? []).map((e) => makePascalCase(e.name)),
  ])
  const seen = new Set<string>()
  return candidates.flatMap((candidate) => {
    if (seen.has(candidate.relationName)) return []
    seen.add(candidate.relationName)
    const className = uniqueClassName(candidate.preferredClassName, taken)
    taken.add(className)
    return [
      {
        relationName: candidate.relationName,
        tableName: candidate.tableName,
        className,
        leftModel: candidate.leftModel,
        rightModel: candidate.rightModel,
      },
    ]
  })
}

// The Prisma-managed join table has exactly two columns "A"/"B" (no surrogate
// id), which an implicit Django ManyToManyField cannot reproduce — hence an
// explicit through model with a composite primary key.
export function generateThroughModel(info: {
  tableName: string
  className: string
  leftModel: string
  rightModel: string
}) {
  // Prisma indexes the join table's second column only — the first is already
  // the leading column of the composite primary key — so Django's per-foreign-key
  // index is turned off on both and the one that exists is declared in Meta.
  return [
    `class ${info.className}(models.Model):`,
    '    pk = models.CompositePrimaryKey("a_id", "b_id")',
    `    a = models.ForeignKey("${makePascalCase(info.leftModel)}", on_delete=models.CASCADE, related_name="+", db_column="A", db_index=False)`,
    `    b = models.ForeignKey("${makePascalCase(info.rightModel)}", on_delete=models.CASCADE, related_name="+", db_column="B", db_index=False)`,
    '',
    '    class Meta:',
    `        db_table = ${toPythonString(info.tableName)}`,
    '        indexes = [',
    '            models.Index(fields=["b"]),',
    '        ]',
  ].join('\n')
}

function generateManyToManyField(
  model: DMMF.Model,
  field: DMMF.Field,
  allModels: readonly DMMF.Model[],
  m2mTables: readonly {
    relationName: string
    className: string
    leftModel: string
    rightModel: string
  }[],
  names: Names,
) {
  const backField = backRelation(field, model, allModels)
  const table = m2mTables.find((t) => t.relationName === field.relationName)
  if (!table) return null
  const attrName = attrNameOf(names, model, field)
  const relatedName = backField
    ? toPythonString(djangoAttrName(makeSnakeCase(backField.name)))
    : '"+"'
  const targetClass = makePascalCase(field.type)
  const args = [
    // A self-referential many-to-many names its own class rather than "self":
    // Django reads "self" as symmetrical, which drops related_name and makes
    // the relation undirected, while Prisma's is directed.
    `"${targetClass}"`,
    `through="${table.className}"`,
    // A self-referential through table holds two FKs to the same model, so
    // Django needs through_fields to tell the two ends apart.
    table.leftModel === table.rightModel ? 'through_fields=("a", "b")' : null,
    `related_name=${relatedName}`,
  ].filter((a) => a !== null)
  // django-stubs cannot infer the [To, Through] type parameters from the
  // string references, so the annotation is spelled out; the string form is
  // never evaluated at runtime.
  const annotation = `"models.ManyToManyField[${targetClass}, ${table.className}]"`
  return `    ${attrName}: ${annotation} = models.ManyToManyField(${args.join(', ')})`
}

// The declaring side of a many-to-many mirrors the join table's column order:
// the model whose name sorts first is column "A" and declares the
// ManyToManyField; the other side gets the reverse accessor via related_name.
function isDeclaringM2MSide(
  model: DMMF.Model,
  field: DMMF.Field,
  m2mTables: readonly { relationName: string; leftModel: string; rightModel: string }[],
) {
  const table = m2mTables.find((t) => t.relationName === field.relationName)
  if (!table) return false
  if (table.leftModel !== model.name) return false
  if (table.leftModel !== table.rightModel) return true
  // Self-referential: only the first field of the pair declares.
  const first = model.fields.find(
    (f) => f.kind === 'object' && f.relationName === field.relationName,
  )
  return first?.name === field.name
}

const POSTGRES_INDEX_CLASS: { [k: string]: string } = {
  BTree: 'BTreeIndex',
  Hash: 'HashIndex',
  Gist: 'GistIndex',
  Gin: 'GinIndex',
  SpGist: 'SpGistIndex',
  Brin: 'BrinIndex',
}

function postgresIndexClass(algorithm: string | undefined) {
  return algorithm === undefined ? null : (POSTGRES_INDEX_CLASS[algorithm] ?? null)
}

function singleColumnBelongsTo(model: DMMF.Model) {
  return model.fields.filter(
    (f) =>
      f.kind === 'object' && f.relationFromFields?.length === 1 && f.relationToFields !== undefined,
  )
}

// The name each @@unique was given, keyed by its fields; the first of two over
// the same fields wins.
function declaredUniqueNames(uniqueIndexes: readonly DMMF.Index[]) {
  const names = new Map<string, string | undefined>()
  for (const idx of uniqueIndexes) {
    const key = idx.fields.map((f) => f.name).join(',')
    if (!names.has(key)) names.set(key, idx.dbName)
  }
  return names
}

// The name Django's schema editor gives the `_like` index of a column
// (`_create_index_name`): past PostgreSQL's 63 characters, the table and the
// column are cut to 24 each. A Node.js in FIPS mode has no MD5 to name it with.
function likeIndexName(tableName: string, column: string) {
  const suffix = (() => {
    try {
      const digest = createHash('md5').update(`${tableName}${column}`).digest('hex')
      return `${digest.slice(0, 8)}_like`
    } catch {
      return null
    }
  })()
  if (suffix === null) return null
  const full = `${tableName}_${column}_${suffix}`
  // Python counts and cuts by code point.
  if ([...full.matchAll(/./gsu)].length <= 63) return full
  const [table, col] = [tableName, column].map((text) => text.match(/^.{0,24}/su)?.[0] ?? '')
  const short = `${table}_${col}_${suffix}`
  return /^[_\d]/u.test(short) ? `D${short.slice(0, -1)}` : short
}

// On PostgreSQL Django gives every unique varchar or text column a second index
// of its own, for LIKE, named `<table>_<column>_<digest>_like`. A schema pulled
// from tables Django created lists it as an @@index under that name, which
// `migrate` would then create a second time.
function likeIndexNames(
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
  indexes: readonly DMMF.Index[],
  provider: string,
) {
  const named = indexes.some(
    (idx) => idx.model === model.name && idx.dbName?.endsWith('_like') === true,
  )
  if (provider !== 'postgresql' || !named) return new Map<string, string>()
  const tableName = model.dbName ?? model.name
  const pkFields = primaryKeyFields(model)
  const singlePk = pkFields.length === 1 ? pkFields[0] : undefined
  const ownerByScalarName = new Map(
    singleColumnBelongsTo(model).map((f) => [f.relationFromFields?.[0], f]),
  )
  const modelsByName = new Map(allModels.map((m) => [m.name, m]))
  const isText = (column: DMMF.Field | undefined) =>
    column !== undefined &&
    !column.isList &&
    ['CharField', 'TextField'].includes(columnDjangoField(column, provider).ctor)
  return new Map(
    model.fields
      .filter((field) => {
        if (field.kind === 'object') return false
        const isPk = field.name === singlePk
        const owner = ownerByScalarName.get(field.name)
        if (owner === undefined) return (isPk || field.isUnique) && isText(field)
        // A relation's column is of the type of the key it references.
        const back = backRelation(owner, model, allModels)
        const target = modelsByName.get(owner.type)
        const referenced = target?.fields.find((f) => f.name === owner.relationToFields?.[0])
        return (isPk || (back !== undefined && !back.isList)) && isText(referenced)
      })
      .flatMap((field): [string, string][] => {
        const name = likeIndexName(tableName, fieldColumnName(field))
        return name === null ? [] : [[name, field.name]]
      }),
  )
}

// The @@index entries Meta.indexes declares. One that lists an @ignore field is
// left out, and so is the index Django creates by itself.
function writtenIndexes(
  model: DMMF.Model,
  indexes: readonly DMMF.Index[],
  likeNames: ReadonlyMap<string, string>,
) {
  return indexes.filter(
    (idx) =>
      idx.model === model.name &&
      (idx.type === 'normal' || idx.type === 'fulltext') &&
      coversWrittenFields(
        model,
        idx.fields.map((f) => f.name),
      ) &&
      !(idx.fields.length === 1 && idx.fields[0]?.name === likeNames.get(idx.dbName ?? '')),
  )
}

/** A partial index (the `partialIndexes` preview feature) and its condition as SQL. */
export type PartialIndex = { readonly index: DMMF.Index; readonly where: string }

// A partial index is left out of Meta: Django's `condition=` takes a Q, which SQL does not turn
// into. It is named, by the name Prisma Migrate gives it, with its condition, so that a migration
// can create it.
function partialIndexComment(
  index: DMMF.Index,
  where: string,
  tableName: string,
  columnRef: (prismaFieldName: string) => string,
  provider: string,
) {
  const columns = index.fields.map((f) => columnRef(f.name))
  const suffix = index.type === 'unique' ? 'key' : 'idx'
  const name = index.dbName ?? constraintName(tableName, columns, suffix, provider)
  const kind = index.type === 'unique' ? 'unique index' : 'index'
  const on = columns.map((c) => quotedIdentifier(c)).join(', ')
  // A comment is one line: a raw condition that spans lines is read as one.
  const condition = where
    .split(/\r\n|\r|\n/u)
    .map((line) => line.trim())
    .join(' ')
  return [
    `        # The partial ${kind} ${quotedIdentifier(name)} on (${on}) WHERE ${condition} is left out:`,
    "        # Django's condition= takes a Q, not SQL, so it is left to a migration (e.g. RunSQL).",
  ]
}

function generateMetaLines(
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
  indexes: readonly DMMF.Index[],
  names: Names,
  views: ReadonlySet<string>,
  provider: string,
  partials: readonly PartialIndex[],
) {
  const tableName = model.dbName ?? model.name

  // Meta constraints/indexes name Django *fields*: a column held by a
  // ForeignKey is reached through the relation attribute, not the raw column,
  // and both answer to the same resolved attribute.
  const fieldRef = (prismaFieldName: string) =>
    names.attr.get(nameKey(model.name, prismaFieldName)) ?? makeSnakeCase(prismaFieldName)
  const columnRef = (prismaFieldName: string) => {
    const fieldObj = model.fields.find((f) => f.name === prismaFieldName)
    return fieldObj ? fieldColumnName(fieldObj) : prismaFieldName
  }

  // A @@unique carries its own name only when it was given one with map:;
  // otherwise the database name Prisma derives is reproduced.
  const declaredNames = declaredUniqueNames(
    indexes.filter(
      (idx) => idx.model === model.name && idx.type === 'unique' && !idx.isDefinedOnField,
    ),
  )
  const constraints = model.uniqueFields
    .filter((fields) => coversWrittenFields(model, fields))
    .map((fields) => {
      const fieldNames = fields.map((f) => toPythonString(fieldRef(f))).join(', ')
      const declared = declaredNames.get(fields.join(','))
      const name = declared ?? `${tableName}_${fields.map((f) => columnRef(f)).join('_')}_key`
      return `models.UniqueConstraint(fields=[${fieldNames}], name=${toPythonString(name)})`
    })

  const likeNames = likeIndexNames(model, allModels, indexes, provider)
  const indexEntries = writtenIndexes(model, indexes, likeNames).map((idx) => {
    // Prisma records a descending index column as a sort order; Django spells
    // the same thing as a "-" prefix on the field name.
    const fieldNames = idx.fields
      .map((f) => {
        const ref = fieldRef(f.name)
        return toPythonString(f.sortOrder === 'desc' ? `-${ref}` : ref)
      })
      .join(', ')
    // An explicit @@index(map:) name is carried over only when Django accepts
    // it verbatim: over 30 characters trips models.E034, and a leading
    // underscore or digit trips models.E033. Truncating instead would name
    // neither the database's index nor Django's, and two long names sharing a
    // prefix would collide into models.E029 — an unnamed index lets Django
    // derive a valid, unique one.
    const carriesName =
      idx.dbName !== undefined &&
      idx.dbName !== null &&
      idx.dbName.length <= 30 &&
      /^[a-zA-Z]/u.test(idx.dbName) &&
      // An index over other columns that took the name of Django's own.
      !likeNames.has(idx.dbName)
    const name = carriesName ? `, name=${toPythonString(idx.dbName)}` : ''
    // An explicit index method has its own class in django.contrib.postgres;
    // an unrecognised one falls back to the plain btree Index rather than
    // naming a class that does not exist.
    const ctor = postgresIndexClass(idx.algorithm)
    return ctor === null
      ? `models.Index(fields=[${fieldNames}]${name})`
      : `${ctor}(fields=[${fieldNames}]${name})`
  })

  const partialComments = (unique: boolean) =>
    partials
      .filter((p) => p.index.model === model.name && (p.index.type === 'unique') === unique)
      .flatMap((p) => partialIndexComment(p.index, p.where, tableName, columnRef, provider))

  return [
    '',
    '    class Meta:',
    `        db_table = ${toPythonString(tableName)}`,
    // A Prisma `view` is a database view whose SQL is written by hand: `migrate` leaves it alone.
    ...(views.has(model.name) ? ['        managed = False'] : []),
    ...(constraints.length > 0
      ? ['        constraints = [', ...constraints.map((c) => `            ${c},`), '        ]']
      : []),
    ...partialComments(true),
    // Two @@index over the same columns differ only in map:, which an index too
    // long for Django leaves out: Django would derive one name for both
    // (models.E029), so the index is written once.
    ...(indexEntries.length > 0
      ? [
          '        indexes = [',
          ...[...new Set(indexEntries)].map((i) => `            ${i},`),
          '        ]',
        ]
      : []),
    ...partialComments(false),
  ]
}

// A one-column key is the field's own primary_key=True: Django refuses a
// CompositePrimaryKey of fewer than two fields.
function compositePkLine(model: DMMF.Model, names: Names) {
  const pkFields = primaryKeyFields(model)
  if (pkFields.length < 2) return null
  const foreignKeys = new Set(singleColumnBelongsTo(model).map((f) => f.relationFromFields?.[0]))
  const attnames = pkFields.map((prismaFieldName) => {
    const attr = names.attr.get(nameKey(model.name, prismaFieldName)) ?? prismaFieldName
    // CompositePrimaryKey takes attnames: a ForeignKey contributes
    // `<attr>_id`, a scalar contributes its own attribute name.
    const isForeignKey = foreignKeys.has(prismaFieldName)
    return toPythonString(isForeignKey ? `${attr}_id` : attr)
  })
  return `    pk = models.CompositePrimaryKey(${attnames.join(', ')})`
}

// Two enum names can differ only in a way PascalCase erases (`UserRole` and
// `user_role`), and every field that names one would then reference the wrong
// class; the schema is reported rather than one of them silently dropped. A
// Python identifier that collides is stepped aside instead, because that one
// is losslessly renameable.
export function findNameConflicts(enums?: readonly DMMF.DatamodelEnum[]) {
  // Two enums can only differ in a way PascalCase erases, and every field that
  // names one would then reference the wrong class.
  const byEnumClass = new Map<string, string[]>()
  for (const enumDef of enums ?? []) {
    const className = makePascalCase(enumDef.name)
    byEnumClass.set(className, [...(byEnumClass.get(className) ?? []), enumDef.name])
  }
  const enumConflicts = [...byEnumClass]
    .filter(([, owners]) => owners.length > 1)
    .map(
      ([className, owners]) =>
        `enums ${owners.join(' and ')} both produce the Python class ${className}. Rename one of them.`,
    )

  return enumConflicts
}

// An @@index or @@unique that lists an @ignore field is left out: the field is
// not in the DMMF model, so there is no attribute for the entry to name.
function coversWrittenFields(model: DMMF.Model, fieldNames: readonly string[]) {
  const written = new Set(model.fields.map((f) => f.name))
  return fieldNames.every((name) => written.has(name))
}

/** A class's docstring, with the blank line that parts it from the body. */
function classDocstring(prose: string | undefined) {
  const lines = pythonDocstringLines(prose, '    ')
  return lines.length > 0 ? [...lines, ''] : []
}

export function generateModelBody(
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
  indexes: readonly DMMF.Index[],
  m2mTables: readonly {
    relationName: string
    tableName: string
    className: string
    leftModel: string
    rightModel: string
  }[],
  names: Names,
  provider: string,
  enumTypes: ReadonlyMap<string, string> = new Map(),
  views: ReadonlySet<string> = new Set(),
  partials: readonly PartialIndex[] = [],
) {
  const pkFields = primaryKeyFields(model)
  if (pkFields.length === 0) return null
  const compositePk = compositePkLine(model, names)
  const singlePk = pkFields.length === 1 ? pkFields[0] : undefined

  const belongsTo = singleColumnBelongsTo(model)
  const fkByScalarName = new Map(belongsTo.map((f) => [f.relationFromFields?.[0], f]))

  // The composite-PK line owns the FK columns it names; a field emitted as a
  // ForeignKey stays where its scalar column sits so the DDL column order is
  // preserved.
  const fieldLines = model.fields.flatMap((field) => {
    if (field.kind === 'object') {
      if (field.isList && isDeclaringM2MSide(model, field, m2mTables)) {
        const line = generateManyToManyField(model, field, allModels, m2mTables, names)
        return line === null
          ? []
          : [line, ...pythonDocstringLines(stripAnnotations(field.documentation), '    ')]
      }
      return []
    }
    const isPk = field.name === singlePk
    const owner = fkByScalarName.get(field.name)
    if (owner) {
      return [
        generateForeignKeyField(model, owner, field, allModels, names, isPk, views),
        ...pythonDocstringLines(
          stripAnnotations(field.documentation) ?? stripAnnotations(owner.documentation),
          '    ',
        ),
      ]
    }
    return [
      generateScalarField(model, field, isPk, names, provider, enumTypes),
      ...pythonDocstringLines(stripAnnotations(field.documentation), '    '),
    ]
  })

  return [
    `class ${makePascalCase(model.name)}(models.Model):`,
    ...classDocstring(stripAnnotations(model.documentation)),
    ...(compositePk === null ? [] : [compositePk]),
    ...fieldLines,
    ...(model.fields.some((f) => f.isUpdatedAt === true)
      ? ['    objects = AutoNowQuerySet.as_manager()']
      : []),
    ...generateMetaLines(model, allModels, indexes, names, views, provider, partials),
  ].join('\n')
}

// The database stores the @map-ped value; TextChoices derives the
// human-readable label from the member name.
export function generateEnumClass(enumDef: DMMF.DatamodelEnum) {
  return [
    `class ${makePascalCase(enumDef.name)}(models.TextChoices):`,
    ...classDocstring(stripAnnotations(enumDef.documentation)),
    ...enumDef.values.map(
      (v) => `    ${enumMemberName(v.name)} = ${toPythonString(v.dbName ?? v.name)}`,
    ),
  ].join('\n')
}

// The django.contrib.postgres index classes the written indexes are declared with.
function indexClassesOf(
  models: readonly DMMF.Model[],
  allModels: readonly DMMF.Model[],
  indexes: readonly DMMF.Index[],
  provider: string,
) {
  return models
    .flatMap((model) =>
      writtenIndexes(model, indexes, likeIndexNames(model, allModels, indexes, provider)),
    )
    .map((idx) => postgresIndexClass(idx.algorithm))
    .filter((ctor) => ctor !== null)
}

function needsDecimalImport(scalarFields: readonly DMMF.Field[]) {
  return scalarFields.some(
    (f) =>
      f.type === 'Decimal' &&
      (typeof f.default === 'number' ||
        typeof f.default === 'string' ||
        (Array.isArray(f.default) && f.default.length > 0)),
  )
}

function needsAnyImport(scalarFields: readonly DMMF.Field[]) {
  return scalarFields.some((f) => {
    if (f.type !== 'Json') return false
    // A Json list default is annotated list[Any] from the element type.
    if (f.isList) return Array.isArray(f.default) && f.default.length > 0
    if (typeof f.default !== 'string') return false
    const parsed: unknown = JSON.parse(f.default)
    if (typeof parsed !== 'object' || parsed === null) return false
    return Array.isArray(parsed) ? parsed.length > 0 : Object.keys(parsed).length > 0
  })
}

type ImportNeeds = {
  readonly uuid: boolean
  readonly uuid6: boolean
  readonly ulid: boolean
  readonly cuid: boolean
  readonly cuid2: boolean
  readonly nanoid: boolean
  readonly partial: boolean
  readonly array: boolean
  readonly rawSql: boolean
  readonly utcField: boolean
  readonly enumArray: boolean
  readonly plainJson: boolean
  readonly databaseWrapper: boolean
  readonly autoNow: boolean
  readonly decimal: boolean
  readonly any: boolean
  readonly fromDatetime: readonly string[]
  readonly nowHelpers: boolean
  readonly nowDatetime: boolean
  readonly indexClasses: readonly string[]
}

function stdlibImports(needs: ImportNeeds) {
  const fromTyping = [
    needs.any || needs.utcField || needs.autoNow || needs.enumArray || needs.plainJson
      ? 'Any'
      : null,
    needs.autoNow ? 'TypeVar' : null,
  ].filter((name) => name !== null)
  return [
    needs.uuid ? 'import uuid' : null,
    needs.fromDatetime.length > 0 ? `from datetime import ${needs.fromDatetime.join(', ')}` : null,
    needs.utcField || needs.nowHelpers ? 'from datetime import timezone as dt_timezone' : null,
    needs.decimal ? 'from decimal import Decimal' : null,
    needs.partial ? 'from functools import partial' : null,
    fromTyping.length > 0 ? `from typing import ${fromTyping.join(', ')}` : null,
  ].filter((l) => l !== null)
}

function thirdPartyImports(needs: ImportNeeds) {
  return [
    // cuid ships no types, nor does typeshed have any; nanoid's are typeshed's types-nanoid.
    // unused-ignore: a project with ignore_missing_imports has nothing for it to silence.
    needs.cuid ? 'import cuid  # type: ignore[import-untyped, unused-ignore]' : null,
    needs.cuid2 ? 'import cuid2' : null,
    needs.nanoid ? 'import nanoid' : null,
    needs.uuid6 ? 'import uuid6' : null,
    needs.utcField ? 'from django.conf import settings' : null,
    needs.array ? 'from django.contrib.postgres.fields import ArrayField' : null,
    needs.indexClasses.length > 0
      ? `from django.contrib.postgres.indexes import ${needs.indexClasses.join(', ')}`
      : null,
    'from django.db import models',
    needs.databaseWrapper ? 'from django.db.backends.base.base import BaseDatabaseWrapper' : null,
    needs.rawSql ? 'from django.db.models.expressions import RawSQL' : null,
    needs.utcField || needs.autoNow || needs.nowDatetime
      ? 'from django.utils import timezone'
      : null,
    needs.ulid ? 'from ulid import ULID' : null,
  ].filter((l) => l !== null)
}

export function collectGlobalImports(
  models: readonly DMMF.Model[],
  indexes: readonly DMMF.Index[],
  provider: string,
  allModels: readonly DMMF.Model[] = models,
) {
  const scalarFields = models.flatMap((m) => m.fields.filter((f) => f.kind !== 'object'))
  const needsUtcField = scalarFields.some((f) => holdsUtc(f, provider))
  const literalKinds = scalarFields
    .filter(
      (f) =>
        f.type === 'DateTime' &&
        (typeof f.default === 'string' ||
          (Array.isArray(f.default) && f.default.some((v) => typeof v === 'string'))),
    )
    .map((f) => dateTimeKind(f))
  const nowKinds = scalarFields
    .filter((f) => isNowDefault(f) || f.isUpdatedAt === true)
    .map((f) => dateTimeKind(f))
  // utc_today() and utc_time() read the clock through datetime, as
  // UtcDateTimeField checks a value against it and now_milliseconds() returns one.
  const nowHelperKinds = nowKinds.filter((kind) => kind !== 'datetime')
  const kinds = new Set([
    ...literalKinds,
    ...nowKinds,
    ...(needsUtcField || nowHelperKinds.length > 0 ? ['datetime'] : []),
  ])
  const needs: ImportNeeds = {
    uuid: scalarFields.some((f) => uuidDefaultVersion(f) === 4),
    uuid6: scalarFields.some((f) => uuidDefaultVersion(f) === 7),
    ulid: scalarFields.some((f) => isUlidDefault(f)),
    cuid: scalarFields.some((f) => cuidDefaultVersion(f) === 1),
    cuid2: scalarFields.some((f) => cuidDefaultVersion(f) === 2),
    nanoid: scalarFields.some((f) => nanoidDefault(f) !== null),
    partial: scalarFields.some((f) => (nanoidDefault(f)?.length ?? null) !== null),
    array: scalarFields.some((f) => f.isList),
    rawSql: scalarFields.some((f) => dbGeneratedExpr(f) !== null),
    utcField: needsUtcField,
    enumArray: scalarFields.some((f) => isEnumArray(f, provider)),
    plainJson: scalarFields.some((f) => isPlainJson(f, provider)),
    // The field classes that take a connection: UtcDateTimeField, EnumArrayField, PlainJSONField.
    databaseWrapper:
      needsUtcField ||
      scalarFields.some((f) => isEnumArray(f, provider) || isPlainJson(f, provider)),
    autoNow: scalarFields.some((f) => f.isUpdatedAt === true),
    decimal: needsDecimalImport(scalarFields),
    any: needsAnyImport(scalarFields),
    fromDatetime: ['date', 'datetime', 'time'].filter((kind) => kinds.has(kind)),
    nowHelpers: nowHelperKinds.length > 0,
    nowDatetime: nowKinds.includes('datetime'),
    indexClasses: [...new Set(indexClassesOf(models, allModels, indexes, provider))].toSorted(),
  }
  const stdlib = stdlibImports(needs)
  const thirdParty = thirdPartyImports(needs)
  return stdlib.length > 0 ? [...stdlib, '', ...thirdParty] : thirdParty
}
