import type { DMMF } from '@prisma/generator-helper'

import { makePascalCase, makeSnakeCase } from '../utils/index.js'

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

// Python hard keywords cannot be attribute names (`async`/`yield` etc. are a
// syntax error). Soft keywords (match/case/type/_) are valid names and excluded.
const PYTHON_KEYWORDS = new Set([
  'False',
  'None',
  'True',
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield',
])

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

// TextChoices members are class attributes, not model fields, so a trailing
// underscore is enough to dodge a keyword (fields.E001 does not apply).
function enumMemberName(valueName: string) {
  return PYTHON_KEYWORDS.has(valueName) || CHOICES_RESERVED.has(valueName)
    ? `${valueName}_`
    : valueName
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

  switch (nativeName) {
    case 'VarChar':
    case 'Char':
      return args.length > 0
        ? { ctor: 'CharField', typeArgs: [`max_length=${args[0]}`] }
        : { ctor: 'TextField', typeArgs: [] }
    case 'Text':
    case 'TinyText':
    case 'MediumText':
    case 'LongText':
    case 'Citext':
    case 'Xml':
    case 'Bit':
    case 'VarBit':
      return { ctor: 'TextField', typeArgs: [] }
    case 'SmallInt':
    case 'TinyInt':
      return { ctor: 'SmallIntegerField', typeArgs: [] }
    case 'MediumInt':
    case 'Integer':
    case 'Oid':
      return { ctor: 'IntegerField', typeArgs: [] }
    case 'BigInt':
      return { ctor: 'BigIntegerField', typeArgs: [] }
    case 'Real':
    case 'DoublePrecision':
    case 'Double':
      return { ctor: 'FloatField', typeArgs: [] }
    case 'Decimal':
    case 'Money':
      return args.length >= 2
        ? { ctor: 'DecimalField', typeArgs: [`max_digits=${args[0]}`, `decimal_places=${args[1]}`] }
        : { ctor: 'DecimalField', typeArgs: ['max_digits=65', 'decimal_places=30'] }
    case 'Uuid':
      return { ctor: 'UUIDField', typeArgs: [] }
    case 'Date':
      return { ctor: 'DateField', typeArgs: [] }
    case 'Time':
    case 'Timetz':
      return { ctor: 'TimeField', typeArgs: [] }
    case 'Timestamp':
    case 'Timestamptz':
      return { ctor: 'DateTimeField', typeArgs: [] }
    case 'Json':
    case 'JsonB':
      return { ctor: 'JSONField', typeArgs: [] }
    case 'ByteA':
      return { ctor: 'BinaryField', typeArgs: [] }
    case 'Inet':
      return { ctor: 'GenericIPAddressField', typeArgs: [] }
    case 'Boolean':
      return { ctor: 'BooleanField', typeArgs: [] }
    default:
      return baseResolved
  }
}

function toPythonString(value: string) {
  const escaped = value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')
  return `"${escaped}"`
}

function jsonToPythonLiteral(value: unknown): string {
  if (value === null) return 'None'
  if (value === true) return 'True'
  if (value === false) return 'False'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return toPythonString(value)
  if (Array.isArray(value)) return `[${value.map(jsonToPythonLiteral).join(', ')}]`
  if (typeof value === 'object') {
    return `{${Object.entries(value)
      .map(([k, v]) => `${toPythonString(k)}: ${jsonToPythonLiteral(v)}`)
      .join(', ')}}`
  }
  return 'None'
}

function isFunctionDefault(
  def: DMMF.Field['default'],
): def is { readonly name: string; readonly args: readonly (string | number)[] } {
  return def !== null && typeof def === 'object' && 'name' in def && !Array.isArray(def)
}

function isAutoincrement(field: DMMF.Field) {
  return isFunctionDefault(field.default) && field.default.name === 'autoincrement'
}

function uuidDefaultVersion(field: DMMF.Field) {
  if (!(isFunctionDefault(field.default) && field.default.name === 'uuid')) return null
  return field.default.args[0] === 7 ? 7 : 4
}

function isUlidDefault(field: DMMF.Field) {
  return isFunctionDefault(field.default) && field.default.name === 'ulid'
}

function isNowDefault(field: DMMF.Field) {
  return (
    field.type === 'DateTime' && isFunctionDefault(field.default) && field.default.name === 'now'
  )
}

function dbGeneratedExpr(field: DMMF.Field) {
  return isFunctionDefault(field.default) &&
    field.default.name === 'dbgenerated' &&
    typeof field.default.args[0] === 'string'
    ? field.default.args[0]
    : null
}

function scalarElementLiteral(type: string, value: unknown) {
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  if (typeof value === 'number') {
    return type === 'Decimal' ? `Decimal("${value}")` : String(value)
  }
  if (typeof value === 'string') {
    if (type === 'BigInt') return value
    if (type === 'Decimal') return `Decimal("${value}")`
    if (type === 'DateTime') return `datetime.fromisoformat(${toPythonString(value)})`
    // A Json list default arrives as one JSON document per element; the column
    // stores the parsed value, not the text of it.
    if (type === 'Json') return jsonToPythonLiteral(JSON.parse(value))
    return toPythonString(value)
  }
  return jsonToPythonLiteral(value)
}

function fieldColumnName(field: DMMF.Field) {
  return field.dbName ?? makeSnakeCase(field.name)
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

// The attribute a field is emitted under, resolved once per model so that the
// columns, the Meta options and the composite primary key all name the same
// thing. Walked in field order, which is the order the class body is written in,
// and claiming a name only for the fields that are actually emitted.
function modelAttrNames(
  model: DMMF.Model,
  m2mTables: readonly { relationName: string; leftModel: string; rightModel: string }[],
) {
  const belongsTo = singleColumnBelongsTo(model)
  const fkByScalarName = new Map(belongsTo.map((f) => [f.relationFromFields?.[0], f]))
  // `pk` belongs to Django, whether or not this model declares a composite one.
  const taken = new Set(['pk'])
  const names = new Map<string, string>()

  for (const field of model.fields) {
    if (field.kind === 'object') {
      if (field.isList && isDeclaringM2MSide(model, field, m2mTables)) {
        names.set(field.name, claimName(djangoAttrName(makeSnakeCase(field.name)), taken))
      }
      continue
    }
    const owner = fkByScalarName.get(field.name)
    if (owner) {
      // A foreign key is reachable by the relation field's name and by the
      // scalar column it collapsed, and both must answer with one attribute.
      const attr = claimName(djangoAttrName(makeSnakeCase(owner.name)), taken)
      names.set(owner.name, attr)
      names.set(field.name, attr)
      continue
    }
    names.set(field.name, claimName(djangoAttrName(fieldColumnName(field)), taken))
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

  const takenHelpers = new Set(['uuid4_str', 'uuid7_str', 'ulid_str'])
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
    `${makeSnakeCase(model.name)}_${djangoAttrName(fieldColumnName(field))}_default`
  )
}

// A JSON object/array or populated scalar-list default needs a module-level
// function: a shared mutable literal is the classic pitfall, and Django
// migrations cannot serialize a lambda.
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
    const pythonType = field.kind === 'enum' ? 'str' : (PRISMA_TO_PYTHON[field.type] ?? 'str')
    const items = field.default
      .map((v) =>
        enumDef && typeof v === 'string'
          ? `${makePascalCase(field.type)}.${enumMemberName(v)}`
          : scalarElementLiteral(field.type, v),
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
  const uuidHelpers = [
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
  ].filter((h) => h !== null)

  const fieldHelpers = models.flatMap((model) =>
    model.fields
      .filter((f) => f.kind !== 'object')
      .map((field) => fieldDefaultHelper(model, field, names, enumMap))
      .filter((h) => h !== null),
  )

  return [...uuidHelpers, ...fieldHelpers]
}

function formatDefaultArgs(model: DMMF.Model, field: DMMF.Field, isPk: boolean, names: Names) {
  // Prisma's @updatedAt also sets the value on create, which is exactly
  // Django's auto_now (it fires on every save, the first one included).
  // auto_now is mutually exclusive with default/db_default.
  if (field.isUpdatedAt) return ['auto_now=True']

  const generated = dbGeneratedExpr(field)
  // dbgenerated() is a raw DDL expression no client library can evaluate.
  if (generated !== null) return [`db_default=RawSQL(${toPythonString(generated)}, [])`]

  if (isNowDefault(field)) return ['db_default=Now()']

  const uuidVersion = uuidDefaultVersion(field)
  if (uuidVersion !== null) {
    const isNativeUuid = field.nativeType?.[0] === 'Uuid'
    if (isNativeUuid) return [uuidVersion === 7 ? 'default=uuid6.uuid7' : 'default=uuid.uuid4']
    return [uuidVersion === 7 ? 'default=uuid7_str' : 'default=uuid4_str']
  }
  if (isUlidDefault(field)) return ['default=ulid_str']

  const def = field.default
  if (def === undefined || def === null) return []
  // cuid()/nanoid()/autoincrement() and friends: no Python-side equivalent is
  // emitted (autoincrement is the AutoField ctor, the rest stay assignable).
  if (isFunctionDefault(def)) return []

  if (Array.isArray(def)) {
    return def.length === 0 ? ['default=list'] : [`default=${helperNameOf(names, model, field)}`]
  }
  // An enum default arrives as the Prisma-level value name; the TextChoices
  // member carries the @map-ped database value.
  if (field.kind === 'enum' && typeof def === 'string') {
    return [`default=${makePascalCase(field.type)}.${enumMemberName(def)}`]
  }
  // Literal defaults on a primary key are a DDL artifact, not something a
  // Django model should re-assert.
  if (isPk) return []
  if (typeof def === 'boolean') return [def ? 'default=True' : 'default=False']
  if (typeof def === 'number') {
    return field.type === 'Decimal' ? [`default=Decimal("${def}")`] : [`default=${def}`]
  }
  if (typeof def === 'string') {
    // DMMF carries BigInt defaults as digit strings, DateTime literals as ISO
    // strings, and Json defaults as JSON text; each needs its Python shape,
    // not a bare quoted string.
    if (field.type === 'BigInt') return [`default=${def}`]
    if (field.type === 'Decimal') return [`default=Decimal("${def}")`]
    if (field.type === 'DateTime') return [`default=datetime.fromisoformat(${toPythonString(def)})`]
    // A Bytes default is base64 text; the column holds the bytes it encodes.
    if (field.type === 'Bytes') return [`default=${pythonBytesLiteral(def)}`]
    if (field.type === 'Json') {
      const parsed: unknown = JSON.parse(def)
      if (typeof parsed === 'object' && parsed !== null) {
        const isEmpty = Array.isArray(parsed)
          ? parsed.length === 0
          : Object.keys(parsed).length === 0
        if (isEmpty) return [Array.isArray(parsed) ? 'default=list' : 'default=dict']
      }
      return [`default=${helperNameOf(names, model, field)}`]
    }
    return [`default=${toPythonString(def)}`]
  }
  return []
}

function autoFieldCtor(field: DMMF.Field) {
  if (field.nativeType?.[0] === 'SmallInt') return 'SmallAutoField'
  return field.type === 'BigInt' ? 'BigAutoField' : 'AutoField'
}

function generateScalarField(model: DMMF.Model, field: DMMF.Field, isPk: boolean, names: Names) {
  const columnName = fieldColumnName(field)
  const attrName = attrNameOf(names, model, field)

  const resolved =
    field.kind === 'enum'
      ? { ctor: 'TextField', typeArgs: [`choices=${makePascalCase(field.type)}.choices`] }
      : resolveDjangoField(field)

  const ctorResolved =
    isPk && isAutoincrement(field) ? { ctor: autoFieldCtor(field), typeArgs: [] } : resolved

  const defaultArgs = formatDefaultArgs(model, field, isPk, names)

  // Django fills an unset value of a string-backed field with "" rather than
  // None, and an empty-string primary key still counts as set: save() would
  // UPDATE the row that already holds "" instead of inserting. A primary key
  // this generator cannot give a client-side default (cuid, nanoid) is pinned
  // to None so an unassigned one fails loudly on INSERT.
  const emptyStringPk =
    isPk &&
    defaultArgs.length === 0 &&
    ['TextField', 'CharField', 'BinaryField'].includes(ctorResolved.ctor)

  const outerArgs = [
    isPk ? 'primary_key=True' : null,
    // A Prisma scalar list is never optional (an empty array, not NULL).
    !field.isList && !field.isRequired ? 'null=True' : null,
    field.isUnique ? 'unique=True' : null,
    attrName !== columnName ? `db_column=${toPythonString(columnName)}` : null,
    ...defaultArgs,
    emptyStringPk ? 'default=None' : null,
  ].filter((a) => a !== null)

  if (field.isList) {
    const inner = `models.${ctorResolved.ctor}(${ctorResolved.typeArgs.join(', ')})`
    return `    ${attrName} = ArrayField(${[inner, ...outerArgs].join(', ')})`
  }
  return `    ${attrName} = models.${ctorResolved.ctor}(${[...ctorResolved.typeArgs, ...outerArgs].join(', ')})`
}

const ON_DELETE: { [k: string]: string } = {
  Cascade: 'models.CASCADE',
  SetNull: 'models.SET_NULL',
  Restrict: 'models.RESTRICT',
  NoAction: 'models.DO_NOTHING',
  SetDefault: 'models.SET_DEFAULT',
}

function onDeleteFor(field: DMMF.Field) {
  if (field.relationOnDelete && ON_DELETE[field.relationOnDelete]) {
    return ON_DELETE[field.relationOnDelete]
  }
  // Prisma's implicit referential actions: SetNull for an optional relation,
  // Restrict for a required one.
  return field.isRequired ? 'models.RESTRICT' : 'models.SET_NULL'
}

function findBackRelationField(
  relationField: DMMF.Field,
  model: DMMF.Model,
  allModels: readonly DMMF.Model[],
) {
  const targetModel = allModels.find((m) => m.name === relationField.type)
  return targetModel?.fields.find(
    (f) =>
      f.kind === 'object' &&
      f.type === model.name &&
      f.relationName === relationField.relationName &&
      !(targetModel.name === model.name && f.name === relationField.name),
  )
}

function generateForeignKeyField(
  model: DMMF.Model,
  relationField: DMMF.Field,
  scalarField: DMMF.Field,
  allModels: readonly DMMF.Model[],
  names: Names,
) {
  const attrName = attrNameOf(names, model, relationField)
  const columnName = fieldColumnName(scalarField)
  const backField = findBackRelationField(relationField, model, allModels)
  const ctor = backField && !backField.isList ? 'OneToOneField' : 'ForeignKey'
  const target =
    relationField.type === model.name ? '"self"' : `"${makePascalCase(relationField.type)}"`
  // The reverse accessor is read as an attribute on the target, so it goes
  // through the same folding a field name does.
  const relatedName = backField
    ? toPythonString(djangoAttrName(makeSnakeCase(backField.name)))
    : '"+"'

  const targetModel = allModels.find((m) => m.name === relationField.type)
  const referencedName = relationField.relationToFields?.[0]
  const referencedField = targetModel?.fields.find((f) => f.name === referencedName)
  // to_field names a Django field on the target, so it uses the attribute that
  // model resolved for it.
  const toField =
    referencedField && !referencedField.isId && targetModel
      ? `to_field=${toPythonString(attrNameOf(names, targetModel, referencedField))}`
      : null

  const args = [
    target,
    `on_delete=${onDeleteFor(relationField)}`,
    `related_name=${relatedName}`,
    toField,
    columnName !== `${attrName}_id` ? `db_column=${toPythonString(columnName)}` : null,
    !relationField.isRequired ? 'null=True' : null,
    // Django indexes every ForeignKey by default (plus a text_pattern_ops
    // companion on a text column); Prisma indexes none of them. Whatever the
    // schema actually declares arrives through Meta.indexes instead, so leaving
    // this on would add one or two indexes the database does not have.
    ctor === 'ForeignKey' ? 'db_index=False' : null,
    ...formatDefaultArgs(model, scalarField, false, names),
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
      const targetModel = allModels.find((m) => m.name === field.type)
      if (!targetModel) return []
      const otherSide = targetModel.fields.find(
        (f) =>
          f.relationName === field.relationName &&
          f.kind === 'object' &&
          !(targetModel.name === model.name && f.name === field.name),
      )
      if (!otherSide?.isList) return []

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
  const backField = findBackRelationField(field, model, allModels)
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
    (f) => f.kind === 'object' && f.relationFromFields?.length === 1 && f.relationToFields,
  )
}

function generateMetaLines(model: DMMF.Model, indexes: readonly DMMF.Index[], names: Names) {
  const tableName = model.dbName ?? makeSnakeCase(model.name)

  // Meta constraints/indexes name Django *fields*: a column held by a
  // ForeignKey is reached through the relation attribute, not the raw column,
  // and both answer to the same resolved attribute.
  const fieldRef = (prismaFieldName: string) =>
    names.attr.get(nameKey(model.name, prismaFieldName)) ?? makeSnakeCase(prismaFieldName)
  const columnRef = (prismaFieldName: string) => {
    const fieldObj = model.fields.find((f) => f.name === prismaFieldName)
    return fieldObj ? fieldColumnName(fieldObj) : makeSnakeCase(prismaFieldName)
  }

  // A @@unique carries its own name only when it was given one with map:;
  // otherwise the database name Prisma derives is reproduced.
  const uniqueIndexes = indexes.filter(
    (idx) => idx.model === model.name && idx.type === 'unique' && !idx.isDefinedOnField,
  )
  const constraints = model.uniqueFields.map((fields) => {
    const fieldNames = fields.map((f) => toPythonString(fieldRef(f))).join(', ')
    const declared = uniqueIndexes.find(
      (idx) =>
        idx.fields.length === fields.length && idx.fields.every((f, i) => f.name === fields[i]),
    )?.dbName
    const name = declared ?? `${tableName}_${fields.map((f) => columnRef(f)).join('_')}_key`
    return `models.UniqueConstraint(fields=[${fieldNames}], name=${toPythonString(name)})`
  })

  const indexEntries = indexes
    .filter((idx) => idx.model === model.name && (idx.type === 'normal' || idx.type === 'fulltext'))
    .map((idx) => {
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
        /^[a-zA-Z]/u.test(idx.dbName)
      const name = carriesName ? `, name=${toPythonString(idx.dbName)}` : ''
      // An explicit index method has its own class in django.contrib.postgres;
      // an unrecognised one falls back to the plain btree Index rather than
      // naming a class that does not exist.
      const ctor = postgresIndexClass(idx.algorithm)
      return ctor === null
        ? `models.Index(fields=[${fieldNames}]${name})`
        : `${ctor}(fields=[${fieldNames}]${name})`
    })

  return [
    '',
    '    class Meta:',
    `        db_table = ${toPythonString(tableName)}`,
    ...(constraints.length > 0
      ? ['        constraints = [', ...constraints.map((c) => `            ${c},`), '        ]']
      : []),
    ...(indexEntries.length > 0
      ? ['        indexes = [', ...indexEntries.map((i) => `            ${i},`), '        ]']
      : []),
  ]
}

function compositePkLine(model: DMMF.Model, names: Names) {
  const pkFields = model.primaryKey?.fields ?? []
  if (pkFields.length === 0) return null
  const belongsTo = singleColumnBelongsTo(model)
  const attnames = pkFields.map((prismaFieldName) => {
    const attr = names.attr.get(nameKey(model.name, prismaFieldName)) ?? prismaFieldName
    // CompositePrimaryKey takes attnames: a ForeignKey contributes
    // `<attr>_id`, a scalar contributes its own attribute name.
    const isForeignKey = belongsTo.some((f) => f.relationFromFields?.[0] === prismaFieldName)
    return toPythonString(isForeignKey ? `${attr}_id` : attr)
  })
  return `    pk = models.CompositePrimaryKey(${attnames.join(', ')})`
}

// Names are snake_cased when the schema does not map them, so two Prisma names
// can land on one database name — `myValue` and `my_value` on the column
// `my_value`, `UserRole` and `user_role` on the table `user_role`. One of the
// two would be silently dropped, so the schema is reported instead. A Python
// identifier that collides is stepped aside rather than reported, because that
// one is losslessly renameable; a database name is not.
export function findNameConflicts(
  models: readonly DMMF.Model[],
  enums?: readonly DMMF.DatamodelEnum[],
) {
  const byTable = new Map<string, string[]>()
  for (const model of models) {
    const table = model.dbName ?? makeSnakeCase(model.name)
    byTable.set(table, [...(byTable.get(table) ?? []), model.name])
  }

  const tableConflicts = [...byTable]
    .filter(([, owners]) => owners.length > 1)
    .map(
      ([table, owners]) =>
        `models ${owners.join(' and ')} both map to the table "${table}". Add @@map to one of them.`,
    )

  const columnConflicts = models.flatMap((model) => {
    const byColumn = new Map<string, string[]>()
    for (const field of model.fields) {
      if (field.kind === 'object') continue
      const column = fieldColumnName(field)
      byColumn.set(column, [...(byColumn.get(column) ?? []), field.name])
    }
    return [...byColumn]
      .filter(([, owners]) => owners.length > 1)
      .map(
        ([column, owners]) =>
          `fields ${owners.join(' and ')} of model ${model.name} both map to the column "${column}". Add @map to one of them.`,
      )
  })

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

  return [...tableConflicts, ...columnConflicts, ...enumConflicts]
}

// Every Django model needs a primary key, so a Prisma model without one is not
// representable and is left out entirely.
export function hasPrimaryKey(model: DMMF.Model) {
  return model.fields.some((f) => f.isId) || (model.primaryKey?.fields.length ?? 0) > 0
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
) {
  if (!hasPrimaryKey(model)) return null
  const compositePk = compositePkLine(model, names)

  const belongsTo = singleColumnBelongsTo(model)
  const fkByScalarName = new Map(belongsTo.map((f) => [f.relationFromFields?.[0], f]))

  // The composite-PK line owns the FK columns it names; a field emitted as a
  // ForeignKey stays where its scalar column sits so the DDL column order is
  // preserved.
  const fieldLines = model.fields.flatMap((field) => {
    if (field.kind === 'object') {
      if (field.isList && isDeclaringM2MSide(model, field, m2mTables)) {
        const line = generateManyToManyField(model, field, allModels, m2mTables, names)
        return line === null ? [] : [line]
      }
      return []
    }
    const owner = fkByScalarName.get(field.name)
    if (owner) return [generateForeignKeyField(model, owner, field, allModels, names)]
    const isPk = field.isId
    return [generateScalarField(model, field, isPk, names)]
  })

  return [
    `class ${makePascalCase(model.name)}(models.Model):`,
    ...(compositePk === null ? [] : [compositePk]),
    ...fieldLines,
    ...generateMetaLines(model, indexes, names),
  ].join('\n')
}

// The database stores the @map-ped value; TextChoices derives the
// human-readable label from the member name.
export function generateEnumClass(enumDef: DMMF.DatamodelEnum) {
  return [
    `class ${makePascalCase(enumDef.name)}(models.TextChoices):`,
    ...enumDef.values.map(
      (v) => `    ${enumMemberName(v.name)} = ${toPythonString(v.dbName ?? v.name)}`,
    ),
  ].join('\n')
}

export function collectGlobalImports(
  models: readonly DMMF.Model[],
  indexes?: readonly DMMF.Index[],
) {
  const scalarFields = models.flatMap((m) => m.fields.filter((f) => f.kind !== 'object'))
  const modelNames = new Set(models.map((m) => m.name))
  const indexClasses = (indexes ?? [])
    .filter(
      (idx) => modelNames.has(idx.model) && (idx.type === 'normal' || idx.type === 'fulltext'),
    )
    .map((idx) => postgresIndexClass(idx.algorithm))
    .filter((ctor) => ctor !== null)

  const needsUuid = scalarFields.some((f) => uuidDefaultVersion(f) === 4)
  const needsUuid6 = scalarFields.some((f) => uuidDefaultVersion(f) === 7)
  const needsUlid = scalarFields.some((f) => isUlidDefault(f))
  const needsArray = scalarFields.some((f) => f.isList)
  const needsRawSql = scalarFields.some((f) => dbGeneratedExpr(f) !== null)
  const needsNow = scalarFields.some((f) => isNowDefault(f) && !f.isUpdatedAt)
  const needsDatetime = scalarFields.some(
    (f) =>
      (f.type === 'DateTime' && typeof f.default === 'string') ||
      (f.type === 'DateTime' &&
        Array.isArray(f.default) &&
        f.default.some((v) => typeof v === 'string')),
  )
  const needsDecimal = scalarFields.some(
    (f) =>
      f.type === 'Decimal' &&
      (typeof f.default === 'number' ||
        typeof f.default === 'string' ||
        (Array.isArray(f.default) && f.default.length > 0)),
  )
  const needsAny = scalarFields.some((f) => {
    if (f.type !== 'Json') return false
    // A Json list default is annotated list[Any] from the element type.
    if (f.isList) return Array.isArray(f.default) && f.default.length > 0
    if (typeof f.default !== 'string') return false
    const parsed: unknown = JSON.parse(f.default)
    if (typeof parsed !== 'object' || parsed === null) return false
    return Array.isArray(parsed) ? parsed.length > 0 : Object.keys(parsed).length > 0
  })

  const stdlib = [
    needsUuid ? 'import uuid' : null,
    needsDatetime ? 'from datetime import datetime' : null,
    needsDecimal ? 'from decimal import Decimal' : null,
    needsAny ? 'from typing import Any' : null,
  ].filter((l) => l !== null)

  const sortedIndexClasses = [...new Set(indexClasses)].toSorted()

  const thirdParty = [
    needsUuid6 ? 'import uuid6' : null,
    needsArray ? 'from django.contrib.postgres.fields import ArrayField' : null,
    sortedIndexClasses.length > 0
      ? `from django.contrib.postgres.indexes import ${sortedIndexClasses.join(', ')}`
      : null,
    'from django.db import models',
    needsRawSql ? 'from django.db.models.expressions import RawSQL' : null,
    needsNow ? 'from django.db.models.functions import Now' : null,
    needsUlid ? 'from ulid import ULID' : null,
  ].filter((l) => l !== null)

  return stdlib.length > 0 ? [...stdlib, '', ...thirdParty] : thirdParty
}
