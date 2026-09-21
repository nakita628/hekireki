import type { DMMF } from '@prisma/generator-helper'

import { isAnnotationLine, makePascalCase, makeSnakeCase } from '../utils/index.js'
import { RAILS_RESERVED_NAMES } from './activerecord-reserved.js'
import { pluralize } from './humanizer.js'

function fieldColumn(model: DMMF.Model, fieldName: string) {
  const field = model.fields.find((f) => f.name === fieldName)
  return field?.dbName ?? fieldName
}

function primaryKeyFields(model: DMMF.Model) {
  const idField = model.fields.find((f) => f.isId)
  return idField ? [idField.name] : (model.primaryKey?.fields ?? [])
}

function isSameList(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((value, i) => value === b[i])
}

// A Ruby array literal as RuboCop's defaults and rubocop-rails-omakase both
// accept it: %i[] for symbols, %w[] for plain words, and otherwise brackets
// with a space inside (none in an empty pair).
function rubyArray(items: readonly string[]) {
  if (items.length === 0) return '[]'
  if (items.every((item) => /^:[a-z_][a-z0-9_]*$/u.test(item))) {
    return `%i[${items.map((item) => item.slice(1)).join(' ')}]`
  }
  if (items.every((item) => /^"[^\s"\\#\]]+"$/u.test(item))) {
    return `%w[${items.map((item) => item.slice(1, -1)).join(' ')}]`
  }
  return `[ ${items.join(', ')} ]`
}

// An integer literal with the underscores RuboCop asks of five digits or more.
function rubyInteger(value: string) {
  const [sign, digits] = value.startsWith('-') ? ['-', value.slice(1)] : ['', value]
  return digits.length < 5 ? value : `${sign}${digits.replaceAll(/\B(?=(\d{3})+(?!\d))/gu, '_')}`
}

// A composite FK uses Active Record 7.2's array form for
// foreign_key/primary_key; the single-column form stays a plain string.
function foreignKeyOpt(columns: readonly string[]) {
  return columns.length > 1
    ? `foreign_key: ${rubyArray(columns.map((c) => `:${c}`))}`
    : `foreign_key: "${columns[0]}"`
}

// primary_key names the referenced column(s) when they are not the primary
// key Rails reads from the table: without it a FK referencing a unique column
// joins against the primary key.
function primaryKeyOpt(columns: readonly string[], referencesPrimaryKey: boolean) {
  return referencesPrimaryKey
    ? []
    : columns.length > 1
      ? [`primary_key: ${rubyArray(columns.map((c) => `:${c}`))}`]
      : [`primary_key: "${columns[0]}"`]
}

// What Rails does to the children when the owner is destroyed, as the
// foreign key's ON DELETE does it in the database: Cascade destroys them
// (callbacks and all), SetNull clears the key, Restrict and NoAction refuse
// with an error on the owner. SetDefault has no Rails counterpart.
const DEPENDENT: { readonly [action: string]: string } = {
  Cascade: 'destroy',
  SetNull: 'nullify',
  Restrict: 'restrict_with_error',
  NoAction: 'restrict_with_error',
}

// A call whose keyword options would run a class-body line past RuboCop's
// 120 columns continues on the next line, the keys aligned under the first
// one (Layout/HashAlignment); when not even the first fits, the keywords all
// move down, aligned under the first argument (Layout/ArgumentAlignment).
function rubyCall(method: string, positional: readonly string[], keywords: readonly string[]) {
  const head = `${method} ${positional.join(', ')}`
  const [firstKeyword, ...rest] = keywords
  if (firstKeyword === undefined) return head
  const fits = `${head}, ${firstKeyword}`.length + 2 <= 120
  const indent = ' '.repeat(fits ? head.length + 2 : method.length + 1)
  const lines = fits ? [`${head}, ${firstKeyword}`] : [`${head},`, `${indent}${firstKeyword}`]
  for (const opt of rest) {
    const last = lines.length - 1
    const joined = `${lines[last]}, ${opt}`
    if (joined.length + 2 <= 120) {
      lines[last] = joined
    } else {
      lines[last] = `${lines[last]},`
      lines.push(`${indent}${opt}`)
    }
  }
  return lines.join('\n')
}

// The `/// @ar.` calls of a doc comment, after the prefix, one call to a
// line. On a field each is a validator, `presence(message: "Title is
// required")` or `presence`, which becomes an option of the field's
// `validates`; on a model each is a whole Ruby line for the class body,
// `validates :a, :b, presence: true, on: :create` or `normalizes :title,
// with: ->(title) { title.strip }`, written as it is. The prose comes first:
// once an `@ar.` call has been written, a line that is neither a call, a
// blank nor another annotation is a problem. A call is not continued on the
// next `///`: a field's call opens its parentheses and closes them on the
// same line, and a model's line does not end in a comma.
function arCalls(documentation: string | undefined, on: 'model' | 'field') {
  const calls: string[] = []
  const problems: string[] = []
  let annotated = false
  for (const raw of (documentation ?? '').split('\n')) {
    const line = raw.trim()
    if (line.startsWith('@ar.')) {
      annotated = true
      const call = line.slice('@ar.'.length).trim()
      calls.push(call)
      if (on === 'field') {
        if (call.includes('(') && !call.endsWith(')')) {
          problems.push(
            `the @ar. call "${call}" does not close its parentheses on its line; an @ar. call is one /// line`,
          )
        } else if (!/^[a-z_][a-z0-9_]*(?:\s*\([\s\S]*\))?$/u.test(call)) {
          problems.push(`the @ar. call "${call}" is not name or name(arguments)`)
        }
      } else if (call.endsWith(',')) {
        problems.push(
          `the @ar. line "${call}" ends in a comma as if it went on; an @ar. call is one /// line`,
        )
      } else if (!/^[a-z_][a-z0-9_]*[!?]?(?:\s*\([\s\S]*\)|\s[\s\S]*)?$/u.test(call)) {
        problems.push(
          `the @ar. line "${call}" is not a Ruby call, name, name(arguments) or name arguments`,
        )
      }
    } else if (line !== '' && !isAnnotationLine(line) && annotated) {
      problems.push(`the line "${line}" comes after an @ar. call; write the description above them`)
    }
  }
  return { calls, problems }
}

/**
 * What keeps the schema's `@ar.` comments from being read: a description
 * written after the calls, a call left open, a call in a shape that is not a
 * validator. Each names the model or field it is on.
 */
export function activeRecordProblems(models: readonly DMMF.Model[]) {
  return models.flatMap((model) => [
    ...arCalls(model.documentation, 'model').problems.map((problem) => `model ${model.name}: ${problem}`),
    ...model.fields.flatMap((field) =>
      arCalls(field.documentation, 'field').problems.map(
        (problem) => `field ${model.name}.${field.name}: ${problem}`,
      ),
    ),
  ])
}

// The top-level pieces of a Ruby argument list, split at commas that are
// not inside brackets or strings.
function splitArguments(text: string) {
  const parts: string[] = []
  let depth = 0
  let quote: string | null = null
  let start = 0
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quote !== null) {
      if (ch === '\\') i += 1
      else if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === '(' || ch === '{' || ch === '[') {
      depth += 1
    } else if (ch === ')' || ch === '}' || ch === ']') {
      depth -= 1
    } else if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts.map((part) => part.trim()).filter((part) => part.length > 0)
}

// `{ ja: "...", en: "..." }`: a hash keyed by locale, which is a translation
// rather than a Ruby option. A locale's value is a string literal, or a hash
// of plural forms (`{ one: "...", other: "%{count} ..." }`) as I18n picks
// them by `count`. Anything else is null.
const PLURAL_FORMS = new Set(['zero', 'one', 'two', 'few', 'many', 'other'])

function stringLiteral(value: string) {
  const m = value.match(/^(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')$/u)
  return m ? (m[1] ?? m[2] ?? '').replaceAll('\\"', '"') : null
}

function translations(value: string) {
  const inner = value.match(/^\{([\s\S]*)\}$/u)?.[1]
  if (inner === undefined) return null
  const found: { locale: string; form: string | null; text: string }[] = []
  for (const pair of splitArguments(inner)) {
    const m = pair.match(/^([a-z]{2,3}(?:[-_][A-Za-z0-9]+)?):\s*([\s\S]+)$/u)
    if (!m) return null
    const [, locale = '', rest = ''] = m
    const text = stringLiteral(rest)
    if (text !== null) {
      found.push({ locale, form: null, text })
      continue
    }
    const forms = rest.match(/^\{([\s\S]*)\}$/u)?.[1]
    if (forms === undefined) return null
    for (const formPair of splitArguments(forms)) {
      const f = formPair.match(/^([a-z]+):\s*([\s\S]+)$/u)
      const formText = f ? stringLiteral(f[2] ?? '') : null
      if (!f || formText === null || !PLURAL_FORMS.has(f[1] ?? '')) return null
      found.push({ locale, form: f[1] ?? '', text: formText })
    }
  }
  return found.length === 0 ? null : found
}

// The i18n error keys a validator's `message:` stands for, as the Rails
// i18n guide lists them: `message:` replaces every message the validator
// can add, so the translation goes under each key it could raise. length's
// are its three; numericality's and comparison's depend on the options
// given (`greater_than: 0` raises `greater_than`), so they are read from
// the call; a validator with no key of its own is `invalid`.
const MESSAGE_KEYS: { readonly [validator: string]: readonly string[] } = {
  presence: ['blank'],
  absence: ['present'],
  format: ['invalid'],
  uniqueness: ['taken'],
  inclusion: ['inclusion'],
  exclusion: ['exclusion'],
  acceptance: ['accepted'],
  confirmation: ['confirmation'],
  associated: ['invalid'],
  length: ['too_long', 'too_short', 'wrong_length'],
}

// The numericality and comparison options that are error keys of their own.
const COMPARISON_KEYS = new Set([
  'greater_than',
  'greater_than_or_equal_to',
  'equal_to',
  'less_than',
  'less_than_or_equal_to',
  'other_than',
  'in',
  'odd',
  'even',
])

function messageKeys(validator: string, options: readonly string[]) {
  const found = MESSAGE_KEYS[validator]
  if (found !== undefined) return found
  if (validator !== 'numericality' && validator !== 'comparison') return ['invalid']
  const keys = options.flatMap((option) => {
    const name = option.match(/^([a-z_]+):/u)?.[1] ?? ''
    return COMPARISON_KEYS.has(name)
      ? [name]
      : name === 'only_integer' && validator === 'numericality'
        ? ['not_an_integer']
        : []
  })
  return validator === 'numericality' ? ['not_a_number', ...keys] : keys
}

// One `@ar.` call of a field taken apart: the validator, the option it
// becomes in `validates`, and the translations to write to the locale files
// under Rails' error keys (`too_long:` is one already; `message:` is the
// validator's own).
function validatorCall(call: string) {
  const match = call.match(/^([a-z_][a-z0-9_]*)\s*(?:\(([\s\S]*)\))?$/u)
  if (!match) return { validator: null, option: call, messages: [] }
  const [, validator = '', args = ''] = match
  const messages: { key: string; locale: string; form: string | null; text: string }[] = []
  // `name(ja: "...", en: "...")` is nothing but translations.
  if (validator === 'name') {
    for (const t of translations(`{ ${args} }`) ?? []) {
      messages.push({ key: 'name', locale: t.locale, form: t.form, text: t.text })
    }
    return { validator, option: null, messages }
  }
  const kept: string[] = []
  const translated: {
    name: string
    found: { locale: string; form: string | null; text: string }[]
  }[] = []
  for (const argument of splitArguments(args)) {
    const pair = argument.match(/^([a-z_][a-z0-9_]*):\s*([\s\S]+)$/u)
    const found = pair ? translations(pair[2] ?? '') : null
    if (pair && found) {
      translated.push({ name: pair[1] ?? '', found })
    } else {
      kept.push(argument)
    }
  }
  for (const { name, found } of translated) {
    for (const key of name === 'message' ? messageKeys(validator, kept) : [name]) {
      for (const t of found) {
        messages.push({ key, locale: t.locale, form: t.form, text: t.text })
      }
    }
  }
  const option = kept.length === 0 ? `${validator}: true` : `${validator}: { ${kept.join(', ')} }`
  return { validator, option, messages }
}

type LocaleTree = { [key: string]: string | LocaleTree }

// A plural form is one more key under the message (`too_long: { one:, other: }`).
function form(m: { form: string | null }) {
  return m.form === null ? [] : [m.form]
}

function setPath(tree: LocaleTree, path: readonly string[], text: string) {
  const [head, ...rest] = path
  if (head === undefined) return
  if (rest.length === 0) {
    tree[head] = text
    return
  }
  const next = tree[head]
  const child = typeof next === 'object' ? next : {}
  tree[head] = child
  setPath(child, rest, text)
}

// The YAML of a locale tree, every string double-quoted so `%{count}` and
// Japanese survive as written.
function yamlLines(tree: LocaleTree, depth: number): string[] {
  const lines: string[] = []
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === 'string') {
      lines.push(
        `${'  '.repeat(depth)}${key}: "${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`,
      )
    } else {
      lines.push(`${'  '.repeat(depth)}${key}:`, ...yamlLines(value, depth + 1))
    }
  }
  return lines
}

/**
 * The locale files of the schema's `@ar.` calls, laid out as the Rails i18n
 * guide organises them: `models/<model>/<locale>.yml`, one directory per
 * model and one file per locale it names, so model and attribute names stay
 * apart from the views' text and the defaults. Each holds that model's name
 * from `@ar.name(ja: "...")`, its attributes' names, and the error messages
 * of its validators' translated options, under the keys Rails reads
 * (`activerecord.errors.models.todo.attributes.title.blank`).
 */
export function activeRecordLocaleFiles(models: readonly DMMF.Model[]) {
  return models.flatMap((model) => {
    const modelKey = makeSnakeCase(model.name)
    const trees = new Map<string, LocaleTree>()
    const tree = (locale: string) => {
      const found = trees.get(locale) ?? {}
      trees.set(locale, found)
      return found
    }
    for (const call of arCalls(model.documentation, 'model').calls) {
      const { validator, messages } = validatorCall(call)
      if (validator !== 'name') continue
      for (const m of messages) {
        setPath(tree(m.locale), ['activerecord', 'models', modelKey, ...form(m)], m.text)
      }
    }
    for (const field of model.fields) {
      if (field.kind === 'object') continue
      const attribute = field.dbName ?? field.name
      for (const call of arCalls(field.documentation, 'field').calls) {
        const { validator, messages } = validatorCall(call)
        for (const m of messages) {
          setPath(
            tree(m.locale),
            validator === 'name'
              ? ['activerecord', 'attributes', modelKey, attribute, ...form(m)]
              : [
                  'activerecord',
                  'errors',
                  'models',
                  modelKey,
                  'attributes',
                  attribute,
                  m.key,
                  ...form(m),
                ],
            m.text,
          )
        }
      }
    }
    return [...trees]
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([locale, content]) => ({
        fileName: `models/${modelKey}/${locale}.yml`,
        code: `${yamlLines({ [locale]: content }, 0).join('\n')}\n`,
      }))
  })
}

// A Ruby symbol key in a hash literal: bare when it is an identifier, quoted
// otherwise ("1st": ...).
function symbolKey(name: string) {
  return /^[a-z_][a-z0-9_]*$/u.test(name) ? name : `"${name}"`
}

function getAssociations(model: DMMF.Model, allModels: readonly DMMF.Model[]) {
  const belongsTo: {
    name: string
    targetModel: string
    foreignKeyColumn: string
    primaryKeyColumn: string
    foreignKeyColumns: readonly string[]
    primaryKeyColumns: readonly string[]
    referencesPrimaryKey: boolean
    optional: boolean
    inverse: string | null
    inverseIsList: boolean
  }[] = []
  const hasMany: {
    name: string
    targetModel: string
    foreignKeyColumn: string
    foreignKeyColumns: readonly string[]
    primaryKeyColumns: readonly string[]
    referencesPrimaryKey: boolean
    inverse: string
    onDelete: string
  }[] = []
  const hasOne: {
    name: string
    targetModel: string
    foreignKeyColumn: string
    foreignKeyColumns: readonly string[]
    primaryKeyColumns: readonly string[]
    referencesPrimaryKey: boolean
    inverse: string
    onDelete: string
  }[] = []
  const habtm: {
    name: string
    targetModel: string
    joinTable: string
    foreignKey: string
    associationForeignKey: string
  }[] = []

  for (const field of model.fields) {
    if (field.kind !== 'object') continue

    if (field.relationFromFields && field.relationFromFields.length > 0) {
      const targetModel = allModels.find((m) => m.name === field.type)
      const referencedField = field.relationToFields?.[0] ?? 'id'
      const referencedFields = field.relationToFields ?? ['id']
      // The other side of the relation is the field that shares its name and
      // holds no foreign key; in a self-relation that rules out this field.
      const inverse = targetModel?.fields.find(
        (f) =>
          f.kind === 'object' &&
          f.relationName === field.relationName &&
          !(f.relationFromFields && f.relationFromFields.length > 0),
      )
      belongsTo.push({
        name: field.name,
        targetModel: field.type,
        foreignKeyColumn: fieldColumn(model, field.relationFromFields[0]),
        primaryKeyColumn: targetModel ? fieldColumn(targetModel, referencedField) : referencedField,
        foreignKeyColumns: field.relationFromFields.map((c) => fieldColumn(model, c)),
        primaryKeyColumns: referencedFields.map((c) =>
          targetModel ? fieldColumn(targetModel, c) : c,
        ),
        referencesPrimaryKey: isSameList(
          referencedFields,
          targetModel === undefined ? ['id'] : primaryKeyFields(targetModel),
        ),
        optional: !field.isRequired,
        inverse: inverse?.name ?? null,
        inverseIsList: inverse?.isList ?? false,
      })
      continue
    }

    const targetModel = allModels.find((m) => m.name === field.type)
    if (!targetModel) continue

    if (field.isList) {
      const otherSide = targetModel.fields.find(
        (f) => f.relationName === field.relationName && f.kind === 'object',
      )
      if (otherSide?.isList) {
        const [left, right] =
          model.name < field.type ? [model.name, field.type] : [field.type, model.name]
        habtm.push({
          name: field.name,
          targetModel: field.type,
          joinTable: `_${field.relationName ?? `${left}To${right}`}`,
          foreignKey: model.name === left ? 'A' : 'B',
          associationForeignKey: model.name === left ? 'B' : 'A',
        })
        continue
      }
    }

    const fkField = targetModel.fields.find(
      (f) =>
        f.relationName === field.relationName &&
        f.relationFromFields &&
        f.relationFromFields.length > 0,
    )
    const foreignKey = fkField?.relationFromFields?.[0]
    if (!(fkField && foreignKey)) continue
    const foreignKeyColumn = fieldColumn(targetModel, foreignKey)
    const foreignKeyColumns = (fkField.relationFromFields ?? [foreignKey]).map((c) =>
      fieldColumn(targetModel, c),
    )
    const primaryKeyColumns = (fkField.relationToFields ?? ['id']).map((c) => fieldColumn(model, c))
    const referencesPrimaryKey = isSameList(
      fkField.relationToFields ?? ['id'],
      primaryKeyFields(model),
    )
    // Prisma's default action when the schema names none: Restrict for a
    // required relation, SetNull for an optional one.
    const onDelete = fkField.relationOnDelete ?? (fkField.isRequired ? 'Restrict' : 'SetNull')

    if (field.isList) {
      hasMany.push({
        name: field.name,
        targetModel: field.type,
        foreignKeyColumn,
        foreignKeyColumns,
        primaryKeyColumns,
        referencesPrimaryKey,
        inverse: fkField.name,
        onDelete,
      })
    } else {
      hasOne.push({
        name: field.name,
        targetModel: field.type,
        foreignKeyColumn,
        foreignKeyColumns,
        primaryKeyColumns,
        referencesPrimaryKey,
        inverse: fkField.name,
        onDelete,
      })
    }
  }

  return { belongsTo, hasMany, hasOne, habtm }
}

// A Ruby double-quoted literal: backslash, quote and the interpolation
// sigil are escaped, and newlines are written as escapes so the line holds.
function rubyString(value: string) {
  return `"${value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('#', '\\#')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r')}"`
}

// The Ruby expression for one literal default of a scalar column, or null
// where the value is not a literal (a database expression, a generator the
// attribute defaults above handle, a type Ruby has no literal for).
function rubyDefault(type: string, value: DMMF.FieldDefault | DMMF.FieldDefaultScalar) {
  if (typeof value === 'object') return null
  switch (type) {
    case 'Boolean':
      return value === true || value === 'true' ? 'true' : 'false'
    case 'Int':
    case 'BigInt':
      return rubyInteger(String(value))
    case 'Float':
      return String(value)
    case 'Decimal':
      return `BigDecimal(${rubyString(String(value))})`
    case 'String':
      return rubyString(String(value))
    case 'DateTime':
      return `Time.iso8601(${rubyString(String(value))})`
    case 'Json':
      return `JSON.parse(${rubyString(String(value))})`
    default:
      return null
  }
}

function nativeLength(field: DMMF.Field) {
  if (!field.nativeType) return null
  const [name, args] = field.nativeType
  if (!['VarChar', 'Char', 'NVarChar', 'NChar'].includes(name)) return null
  const length = Number(args[0])
  return Number.isInteger(length) && length > 0 ? length : null
}

export function activeRecordModels(
  models: readonly DMMF.Model[],
  allModels?: readonly DMMF.Model[],
  enums?: readonly DMMF.DatamodelEnum[],
) {
  const contextModels = allModels ?? models
  const enumMap = new Map((enums ?? []).map((e) => [e.name, e.values]))
  return models
    .map((model) => {
      const associations = getAssociations(model, contextModels)
      const className = makePascalCase(model.name)
      // Prisma names the table after the model as written (Todo -> "Todo")
      // unless @@map says otherwise; Rails infers the plural of the class
      // (todos), so only a table named that way goes unsaid.
      const tableName = model.dbName ?? model.name
      const tableNameLines =
        tableName === pluralize(makeSnakeCase(model.name))
          ? []
          : [`self.table_name = "${tableName}"`]
      const idField = model.fields.find((f) => f.isId)
      const compositePkColumns = (model.primaryKey?.fields ?? []).map((name) =>
        fieldColumn(model, name),
      )

      const primaryKeyLines = idField
        ? (idField.dbName ?? idField.name) !== 'id'
          ? [`self.primary_key = "${idField.dbName ?? idField.name}"`]
          : []
        : compositePkColumns.length > 0
          ? [`self.primary_key = ${rubyArray(compositePkColumns.map((c) => `"${c}"`))}`]
          : []

      // A column named "type" triggers Rails single-table inheritance: reading
      // rows whose value is not a class name raises ActiveRecord::SubclassNotFound.
      const inheritanceColumnLines = model.fields.some(
        (f) => (f.kind === 'scalar' || f.kind === 'enum') && (f.dbName ?? f.name) === 'type',
      )
        ? ['self.inheritance_column = nil']
        : []

      // Active Record writes timestamps only into created_at/updated_at (or
      // *_on), while Prisma's convention is createdAt/updatedAt, and @updatedAt
      // is set by the Prisma client, not the database. alias_attribute is how
      // Rails 7.1+ points its timestamp machinery at a column of another name:
      // the column is filled on create, bumped on update, and `touch` works.
      const createdField = model.fields.find(
        (f) =>
          f.kind === 'scalar' &&
          f.type === 'DateTime' &&
          !f.isList &&
          (f.name === 'createdAt' || f.name === 'created_at'),
      )
      const updatedField =
        model.fields.find((f) => f.isUpdatedAt) ??
        model.fields.find(
          (f) =>
            f.kind === 'scalar' &&
            f.type === 'DateTime' &&
            !f.isList &&
            ['updatedAt', 'updated_at', 'modifiedAt', 'modified_at'].includes(f.name),
        )
      const timestampLines = [
        ...(createdField &&
        !['created_at', 'created_on'].includes(createdField.dbName ?? createdField.name)
          ? [`alias_attribute :created_at, :${createdField.dbName ?? createdField.name}`]
          : []),
        ...(updatedField &&
        !['updated_at', 'updated_on'].includes(updatedField.dbName ?? updatedField.name)
          ? [`alias_attribute :updated_at, :${updatedField.dbName ?? updatedField.name}`]
          : []),
      ]

      // `first`/`last` order by the primary key; a uuid(), cuid() or nanoid()
      // key is random, so the created timestamp orders instead, as Rails
      // suggests for UUID keys. uuid(7) and ulid() sort by time already.
      const idDefault = idField?.default
      const randomKey =
        typeof idDefault === 'object' &&
        'name' in idDefault &&
        ((idDefault.name === 'uuid' && idDefault.args[0] !== 7) ||
          idDefault.name === 'cuid' ||
          idDefault.name === 'nanoid')
      const orderColumnLines =
        randomKey && createdField
          ? [`self.implicit_order_column = "${createdField.dbName ?? createdField.name}"`]
          : []

      const attributeLines = model.fields
        .filter(
          (f) => (f.kind === 'scalar' || f.kind === 'enum') && (f.isList || f.kind === 'scalar'),
        )
        .flatMap((f) => {
          const def = f.default
          // A list without a default is a nullable array column that the
          // Prisma client reads and writes as []: so does the model.
          if (def === undefined) {
            return f.isList ? [`attribute :${f.dbName ?? f.name}, default: -> { [] }`] : []
          }
          if (f.kind === 'enum') return []
          // SecureRandom.uuid_v7 requires Ruby 3.3+; ULID.generate, Cuid.generate,
          // Cuid2.call and Nanoid.generate come from the ulid, cuid, cuid2 and
          // nanoid gems. No cast type is passed: a symbol type resolves through
          // the connection adapter at class load, while a bare default keeps
          // the column type untouched.
          if (typeof def === 'object' && 'name' in def) {
            if (f.type !== 'String') return []
            const generator =
              def.name === 'uuid'
                ? def.args[0] === 7
                  ? 'SecureRandom.uuid_v7'
                  : 'SecureRandom.uuid'
                : def.name === 'ulid'
                  ? 'ULID.generate'
                  : def.name === 'cuid'
                    ? def.args[0] === 2
                      ? 'Cuid2.call'
                      : 'Cuid.generate'
                    : def.name === 'nanoid'
                      ? typeof def.args[0] === 'number'
                        ? `Nanoid.generate(size: ${def.args[0]})`
                        : 'Nanoid.generate'
                      : null
            if (generator === null) return []
            return [`attribute :${f.dbName ?? f.name}, default: -> { ${generator} }`]
          }
          // A literal default is written into the model so a record built in
          // Ruby carries it before it is saved, whatever the table says. A
          // list or JSON value is mutable, so a lambda hands out a fresh one.
          if (typeof def === 'object') {
            const items = def.map((item) => rubyDefault(f.type, item))
            if (!f.isList || items.some((item) => item === null)) return []
            return [
              `attribute :${f.dbName ?? f.name}, default: -> { ${rubyArray(items.map(String))} }`,
            ]
          }
          const literal = rubyDefault(f.type, def)
          if (literal === null) return []
          return [
            `attribute :${f.dbName ?? f.name}, default: ${f.type === 'Json' ? `-> { ${literal} }` : literal}`,
          ]
        })

      // Array enum columns get no `enum` DSL (it casts a scalar column). Keys
      // are the Rails-cased value names (PENDING_REVIEW -> pending_review, so
      // `record.pending_review?` and the `pending_review` scope), the stored
      // value stays the database's. A key that Active Record or Ruby already
      // defines a method for, or that an earlier enum on the model took, goes
      // behind prefix: true — Rails raises on the first and would define the
      // same `VALUE?` twice for the second. A literal default names its key.
      // validate: true makes a value outside the enum, or nil where the
      // column is NOT NULL, a validation error like the other constraints,
      // instead of an ArgumentError on assignment.
      const enumLines = model.fields
        .filter((f) => f.kind === 'enum' && !f.isList)
        .reduce<{ lines: string[]; seenKeys: Set<string> }>(
          (acc, f) => {
            const values = (enumMap.get(f.type) ?? []).map((v) => ({
              key: makeSnakeCase(v.name),
              name: v.name,
              stored: v.dbName ?? v.name,
            }))
            const pairs = values.map((v) => `${symbolKey(v.key)}: "${v.stored}"`).join(', ')
            const conflicts = values.some(
              (v) => acc.seenKeys.has(v.key) || RAILS_RESERVED_NAMES.has(v.key),
            )
            const defaultValue = values.find((v) => v.name === f.default)
            const opts = [
              ...(typeof f.default === 'string' && defaultValue !== undefined
                ? [`default: :${symbolKey(defaultValue.key)}`]
                : []),
              ...(conflicts ? ['prefix: true'] : []),
              f.isRequired ? 'validate: true' : 'validate: { allow_nil: true }',
            ]
            for (const v of values) {
              acc.seenKeys.add(v.key)
            }
            return {
              lines: [
                ...acc.lines,
                rubyCall('enum', [`:${f.dbName ?? f.name}`, `{ ${pairs} }`], opts),
              ],
              seenKeys: acc.seenKeys,
            }
          },
          { lines: [], seenKeys: new Set() },
        ).lines

      // What the schema promises of a column, as a validation, so a bad value
      // is an error on the record rather than an exception from the database:
      // a required column without a default must be present (a foreign key is
      // the belongs_to's to check, a timestamp is written after validation, an
      // enum has validate: true),
      // a @unique column or @@unique set is unique, and a VarChar(n) is no
      // longer than n. A nullable unique column may be NULL any number of
      // times, which allow_nil mirrors. `presence` reads false, {} and "" as
      // blank, so a Boolean is held to true or false and a Json or Bytes
      // column only to not nil.
      const foreignKeyFields = new Set(
        model.fields.flatMap((f) => (f.kind === 'object' ? (f.relationFromFields ?? []) : [])),
      )
      const compositeKeyFields = new Set(model.primaryKey?.fields)
      const uniqueSets = [
        ...model.fields.filter((f) => f.isUnique && !f.isId).map((f) => [f.name]),
        ...model.uniqueFields,
      ]
      // A field's own `@ar.` validators come after what the schema implies; one
      // the schema also wrote (`length`) replaces it, message and all.
      const validationLines = [
        ...model.fields.flatMap((f) => {
          if (!(f.kind === 'scalar' || f.kind === 'enum')) return []
          const column = f.kind === 'scalar' && !f.isList
          const required =
            column &&
            f.isRequired &&
            !f.hasDefaultValue &&
            !f.isId &&
            !f.isUpdatedAt &&
            !foreignKeyFields.has(f.name) &&
            !compositeKeyFields.has(f.name) &&
            f !== createdField &&
            f !== updatedField
          const presence = !required
            ? []
            : f.type === 'Boolean'
              ? ['inclusion: { in: [ true, false ] }']
              : f.type === 'Json' || f.type === 'Bytes'
                ? ['exclusion: { in: [ nil ] }']
                : ['presence: true']
          const length = column && f.type === 'String' ? nativeLength(f) : null
          const lengthOpt = length === null ? [] : [`length: { maximum: ${length} }`]
          const uniqueSet = column ? uniqueSets.find((set) => set[0] === f.name) : undefined
          const uniqueness =
            uniqueSet === undefined
              ? []
              : [
                  (() => {
                    const scope = uniqueSet.slice(1).map((name) => `:${fieldColumn(model, name)}`)
                    const opts = [
                      ...(scope.length === 0
                        ? []
                        : [`scope: ${scope.length === 1 ? scope[0] : rubyArray(scope)}`]),
                      ...(f.isRequired ? [] : ['allow_nil: true']),
                    ]
                    return opts.length === 0
                      ? 'uniqueness: true'
                      : `uniqueness: { ${opts.join(', ')} }`
                  })(),
                ]
          const own = arCalls(f.documentation, 'field').calls.flatMap((call) => {
            const { option } = validatorCall(call)
            return option === null ? [] : [option]
          })
          const rules = [
            ...[...presence, ...lengthOpt, ...uniqueness].filter(
              (rule) =>
                !own.some((line) => new RegExp(`(^|[,\\s])${rule.split(':')[0]}:`, 'u').test(line)),
            ),
            ...own,
          ]
          return rules.length === 0
            ? []
            : [rubyCall('validates', [`:${f.dbName ?? f.name}`], rules)]
        }),
        ...arCalls(model.documentation, 'model').calls.filter(
          (call) => validatorCall(call).validator !== 'name',
        ),
      ]

      // Rails derives class_name from the association name (author -> Author,
      // posts -> Post), foreign_key from the name on the belongs_to side
      // (user_id) and from the owner's class on the has side (User -> user_id),
      // and the inverse from the owner's class name (Post -> :post, or :posts)
      // as long as no foreign_key is given on either side. What matches is
      // left unsaid, as a Rails developer would; anything else is written out.
      const modelSnake = makeSnakeCase(model.name)
      const belongsToLines = associations.belongsTo.map((a) => {
        const name = makeSnakeCase(a.name)
        // Rails finds the inverse only when the has side needs no
        // foreign_key either, which takes this side to be named after its
        // class, and only a has_one: the plural form is behind
        // automatically_invert_plural_associations, off unless the
        // application turns it on.
        const conventional =
          name === makeSnakeCase(a.targetModel) &&
          a.foreignKeyColumns.length === 1 &&
          a.foreignKeyColumns[0] === `${name}_id` &&
          a.referencesPrimaryKey &&
          a.inverse !== null &&
          !a.inverseIsList &&
          makeSnakeCase(a.inverse) === modelSnake
        return rubyCall(
          'belongs_to',
          [`:${name}`],
          [
            ...(makePascalCase(a.targetModel) === makePascalCase(name)
              ? []
              : [`class_name: "${makePascalCase(a.targetModel)}"`]),
            ...(a.foreignKeyColumns.length === 1 && a.foreignKeyColumns[0] === `${name}_id`
              ? []
              : [foreignKeyOpt(a.foreignKeyColumns)]),
            ...primaryKeyOpt(a.primaryKeyColumns, a.referencesPrimaryKey),
            ...(a.optional ? ['optional: true'] : []),
            ...(a.inverse === null || conventional
              ? []
              : [`inverse_of: :${makeSnakeCase(a.inverse)}`]),
          ],
        )
      })

      const hasLines = (
        macro: 'has_one' | 'has_many',
        list: typeof associations.hasOne | typeof associations.hasMany,
      ) =>
        list.map((a) => {
          const name = makeSnakeCase(a.name)
          const inverse = makeSnakeCase(a.inverse)
          const conventional =
            a.foreignKeyColumns.length === 1 &&
            a.foreignKeyColumns[0] === `${modelSnake}_id` &&
            a.referencesPrimaryKey &&
            inverse === modelSnake &&
            name ===
              (macro === 'has_many'
                ? pluralize(makeSnakeCase(a.targetModel))
                : makeSnakeCase(a.targetModel))
          const derivedClass =
            macro === 'has_many'
              ? name === pluralize(makeSnakeCase(a.targetModel))
              : makePascalCase(name) === makePascalCase(a.targetModel)
          const dependent = DEPENDENT[a.onDelete]
          return rubyCall(
            macro,
            [`:${name}`],
            [
              ...(derivedClass ? [] : [`class_name: "${makePascalCase(a.targetModel)}"`]),
              ...(a.foreignKeyColumns.length === 1 && a.foreignKeyColumns[0] === `${modelSnake}_id`
                ? []
                : [foreignKeyOpt(a.foreignKeyColumns)]),
              ...primaryKeyOpt(a.primaryKeyColumns, a.referencesPrimaryKey),
              ...(conventional ? [] : [`inverse_of: :${inverse}`]),
              ...(dependent === undefined ? [] : [`dependent: :${dependent}`]),
            ],
          )
        })

      const hasOneLines = hasLines('has_one', associations.hasOne)
      const hasManyLines = hasLines('has_many', associations.hasMany)

      // Prisma's implicit join table is _AToB with columns A and B, never
      // what Rails would derive, so those three options always stay.
      const habtmLines = associations.habtm.map((a) => {
        const name = makeSnakeCase(a.name)
        return rubyCall(
          'has_and_belongs_to_many',
          [`:${name}`],
          [
            ...(name === pluralize(makeSnakeCase(a.targetModel))
              ? []
              : [`class_name: "${makePascalCase(a.targetModel)}"`]),
            `join_table: "${a.joinTable}"`,
            `foreign_key: "${a.foreignKey}"`,
            `association_foreign_key: "${a.associationForeignKey}"`,
          ],
        )
      })

      const associationLines = [...belongsToLines, ...hasOneLines, ...hasManyLines, ...habtmLines]

      // One blank line between the groups that have anything to say.
      const body = [
        [...tableNameLines, ...primaryKeyLines, ...inheritanceColumnLines, ...orderColumnLines],
        [...attributeLines, ...timestampLines],
        enumLines,
        validationLines,
        associationLines,
      ]
        .filter((group) => group.length > 0)
        .map((group) => group.join('\n'))
        .join('\n\n')
        .split('\n')

      return [
        `class ${className} < ApplicationRecord`,
        ...body.map((line) => (line === '' ? '' : `  ${line}`)),
        'end',
      ].join('\n')
    })
    .filter(Boolean)
    .join('\n\n')
}
