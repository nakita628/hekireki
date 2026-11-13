import type { DMMF } from '@prisma/generator-helper'

import { makeSchema } from '../studio/server/domain/schema.js'

type Schema = ReturnType<typeof makeSchema>
type Model = Schema['models'][number]
type Field = Model['fields'][number]
type Relation = Schema['relations'][number]

/** The files a docs directory holds besides its README, as the README links them. */
export const DOCS_FILES = {
  diagram: 'er.svg',
  // One diagram per model that has a relation: the model and the models it joins.
  models: 'tables',
} as const

/**
 * Where a model's own diagram sits in a docs directory, as the README links it.
 *
 * @param model - the model's name
 * @returns the path relative to the docs directory
 */
export function modelDiagramPath(model: string) {
  return `${DOCS_FILES.models}/${model}.svg`
}

// A table cell's text: a pipe would end the cell, a line break the row.
function cell(text: string) {
  return text.replaceAll('|', '\\|').replaceAll(/\r?\n/gu, ' ')
}

// Inline code, fenced with more backticks than the text holds (`` `x` `` for a text with one).
function inline(text: string) {
  const longest = Math.max(0, ...[...text.matchAll(/`+/gu)].map((m) => m[0].length))
  const fence = '`'.repeat(longest + 1)
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : ''
  return `${fence}${pad}${text}${pad}${fence}`
}

// The anchor of a model or an enum; a model's is the one Studio's Docs page gives it.
function anchor(kind: 'model' | 'enum', name: string) {
  return `${kind}-${name}`
}

function heading(kind: 'model' | 'enum', name: string) {
  return `<a id="${anchor(kind, name)}"></a>\n\n### ${name}`
}

function sqlBlock(title: string, statements: readonly string[] | undefined) {
  if (statements === undefined || statements.length === 0) return []
  return [`#### ${title}\n\n\`\`\`sql\n${statements.join('\n\n')}\n\`\`\``]
}

// A statement's subject: the table it creates, alters or indexes, or the type it creates, by the
// last quoted name (`"auth"."User"` is `User`; MySQL quotes with backticks).
const NAME = '((?:[`"][^`"]+[`"]\\.)?[`"]([^`"]+)[`"])'
const SUBJECTS = [
  {
    kind: 'table',
    pattern: new RegExp(`^\\s*CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${NAME}`, 'iu'),
  },
  { kind: 'table', pattern: new RegExp(`^\\s*ALTER\\s+TABLE\\s+(?:ONLY\\s+)?${NAME}`, 'iu') },
  {
    kind: 'table',
    pattern: new RegExp(
      `^\\s*CREATE\\s+(?:UNIQUE\\s+)?INDEX\\b[\\s\\S]*?\\bON\\s+(?:ONLY\\s+)?${NAME}`,
      'iu',
    ),
  },
  { kind: 'enum', pattern: new RegExp(`^\\s*CREATE\\s+TYPE\\s+${NAME}`, 'iu') },
] as const

/**
 * Each table's and enum's own statements, by `table:<name in the database>` and
 * `enum:<name in the database>`, in the order the engine wrote them. A statement of neither (the
 * schema PostgreSQL is made to hold) belongs to no one.
 *
 * @param statements - the statements that make the schema in an empty database
 * @returns the statements, grouped by what they define
 */
export function ddlBySubject(statements: readonly string[]) {
  const keyed = statements.flatMap((statement) => {
    const subject = SUBJECTS.map(({ kind, pattern }) => {
      const name = pattern.exec(statement)?.[2]
      return name === undefined ? null : `${kind}:${name}`
    }).find((key) => key !== null)
    return subject === undefined || subject === null ? [] : [[subject, statement] as const]
  })
  return new Map(
    [...new Set(keyed.map(([key]) => key))].map((key) => [
      key,
      keyed.filter(([k]) => k === key).map(([, statement]) => statement),
    ]),
  )
}

function typeOf(field: Field) {
  const type = inline(`${field.type}${field.isList ? '[]' : ''}`)
  const named = field.kind === 'enum' ? `[${type}](#${anchor('enum', field.type)})` : type
  return field.nativeType === null ? named : `${named} ${inline(field.nativeType)}`
}

function constraintsOf(field: Field, model: Model) {
  // The relation this field holds the key of, and the field of the other model it points at.
  const relation = model.fields.find((f) => f.relation?.fromFields.includes(field.name))
  const at = relation?.relation?.fromFields.indexOf(field.name) ?? -1
  const target = relation?.relation?.toFields[at]
  return [
    ...(field.isId || model.primaryKey?.includes(field.name) ? ['PK'] : []),
    ...(field.isUnique ? ['UNIQUE'] : []),
    field.isRequired || field.isList ? 'NOT NULL' : 'NULL',
    ...(relation === undefined || target === undefined
      ? []
      : [`→ [${relation.type}.${target}](#${anchor('model', relation.type)})`]),
  ].join(' ')
}

function fieldsOf(model: Model) {
  const rows = model.fields
    .filter((field) => field.kind !== 'object')
    .map((field) => {
      const name =
        field.dbName === null
          ? inline(field.name)
          : `${inline(field.name)} (${inline(field.dbName)})`
      const defaults = [
        ...(field.default === null ? [] : [inline(field.default)]),
        ...(field.isUpdatedAt ? [inline('@updatedAt')] : []),
      ].join(' ')
      return `| ${[name, typeOf(field), constraintsOf(field, model), defaults, field.documentation ?? ''].map(cell).join(' | ')} |`
    })
  return [
    '| Field | Type | Constraints | Default | Description |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n')
}

// How a relation reads from one of its ends: what it is, what the database does on its own, and
// that nothing backs it when only a comment declares it.
function relationNote(relation: Relation, kind: string) {
  return [
    kind,
    ...(relation.onDelete === null ? [] : [`on delete ${relation.onDelete}`]),
    ...(relation.onUpdate === null ? [] : [`on update ${relation.onUpdate}`]),
    ...(relation.origin === 'annotated' ? ['`/// @relation`, no foreign key'] : []),
  ].join(', ')
}

function relationsOf(model: Model, relations: readonly Relation[]) {
  const keyed = relations.filter((r) => r.origin !== 'implicit-many-to-many')
  // The model holds the key: the other end has one of it, or many.
  const references = keyed
    .filter((r) => r.to.model === model.name)
    .map((r) => {
      const many = r.to.cardinality === 'zero-many' || r.to.cardinality === 'many'
      return `- ${inline(r.to.field)} → [${r.from.model}.${r.from.field}](#${anchor('model', r.from.model)}) (${relationNote(r, many ? 'many-to-one' : 'one-to-one')})`
    })
  const referencedBy = keyed
    .filter((r) => r.from.model === model.name)
    .map((r) => {
      const many = r.to.cardinality === 'zero-many' || r.to.cardinality === 'many'
      return `- ${inline(r.from.field)} ← [${r.to.model}.${r.to.field}](#${anchor('model', r.to.model)}) (${relationNote(r, many ? 'one-to-many' : 'one-to-one')})`
    })
  // Prisma keeps the pairs in a join table of its own, named after the relation.
  const manyToMany = relations
    .filter(
      (r) =>
        r.origin === 'implicit-many-to-many' &&
        (r.from.model === model.name || r.to.model === model.name),
    )
    .map((r) => {
      const [own, other] = r.from.model === model.name ? [r.from, r.to] : [r.to, r.from]
      const table = r.name === null ? '' : ` through ${inline(`_${r.name}`)}`
      return `- ${inline(own.field)} ↔ [${other.model}.${other.field}](#${anchor('model', other.model)})${table}`
    })
  return [
    { title: 'References', lines: references },
    { title: 'Referenced by', lines: referencedBy },
    { title: 'Many to many', lines: manyToMany },
  ].flatMap(({ title, lines }) =>
    lines.length === 0 ? [] : [`#### ${title}\n\n${lines.join('\n')}`],
  )
}

function modelSection(
  model: Model,
  relations: readonly Relation[],
  ddl: ReadonlyMap<string, readonly string[]>,
) {
  const table = model.dbName ?? model.name
  const intro = [
    ...(model.dbName === null ? [] : [`Table ${inline(model.dbName)}.`]),
    ...(model.documentation === null ? [] : [model.documentation]),
  ].join(' ')
  const related = relations.some((r) => r.from.model === model.name || r.to.model === model.name)
  const indexes = (model.indexes ?? []).map((index) => `- ${inline(index.attribute)}`)
  return [
    heading('model', model.name),
    ...(intro === '' ? [] : [intro]),
    ...(related
      ? [`![${model.name} and the models it relates to](${modelDiagramPath(model.name)})`]
      : []),
    fieldsOf(model),
    ...(indexes.length === 0 ? [] : [`#### Indexes\n\n${indexes.join('\n')}`]),
    ...relationsOf(model, relations),
    ...sqlBlock('Definition', ddl.get(`table:${table}`)),
  ].join('\n\n')
}

function enumSection(value: Schema['enums'][number], ddl: ReadonlyMap<string, readonly string[]>) {
  const intro = [
    ...(value.dbName === null ? [] : [`Type ${inline(value.dbName)}.`]),
    ...(value.documentation === null ? [] : [value.documentation]),
  ].join(' ')
  const values = value.values.map((v) =>
    v.dbName === null ? `- ${inline(v.name)}` : `- ${inline(v.name)} (${inline(v.dbName)})`,
  )
  return [
    heading('enum', value.name),
    ...(intro === '' ? [] : [intro]),
    values.join('\n'),
    ...sqlBlock('Definition', ddl.get(`enum:${value.dbName ?? value.name}`)),
  ].join('\n\n')
}

/**
 * The schema's documentation as Markdown: the ER diagram of the same directory and the whole
 * schema as SQL (folded) at the top, then every model with its own diagram, its fields,
 * constraints, defaults, indexes, relations both ways and `CREATE TABLE`, and every enum, each
 * described by the `///` comment above it.
 *
 * @param input.datamodel - the models and enums Prisma parsed
 * @param input.statements - the statements that make the schema in an empty database; each table
 *   and enum shows its own. Empty for a database hekireki writes no SQL for
 * @returns the README.md of a docs directory
 */
export function docsMarkdown(input: {
  readonly datamodel: DMMF.Datamodel
  readonly statements: readonly string[]
}) {
  const schema = makeSchema({
    dmmf: { datamodel: input.datamodel },
    files: [],
    provider: null,
    blocks: [],
  })
  const ddl = ddlBySubject(input.statements)
  const models = schema.models.map(
    (model) =>
      `| [${model.name}](#${anchor('model', model.name)}) | ${inline(model.dbName ?? model.name)} | ${cell(model.documentation ?? '')} |`,
  )
  const enums = schema.enums.map(
    (value) =>
      `| [${value.name}](#${anchor('enum', value.name)}) | ${inline(value.dbName ?? value.name)} | ${cell(value.documentation ?? '')} |`,
  )
  return `${[
    '# Schema docs',
    `![ER diagram](${DOCS_FILES.diagram})`,
    ...(input.statements.length === 0
      ? []
      : [
          `<details>\n<summary>The whole schema as SQL</summary>\n\n\`\`\`sql\n${input.statements.join('\n\n')}\n\`\`\`\n\n</details>`,
        ]),
    '## Contents',
    ['| Model | Table | Description |', '| --- | --- | --- |', ...models].join('\n'),
    ...(enums.length === 0
      ? []
      : [
          ['| Enum | Name in the database | Description |', '| --- | --- | --- |', ...enums].join(
            '\n',
          ),
        ]),
    '## Models',
    ...schema.models.map((model) => modelSection(model, schema.relations, ddl)),
    ...(schema.enums.length === 0
      ? []
      : ['## Enums', ...schema.enums.map((value) => enumSection(value, ddl))]),
  ].join('\n\n')}\n`
}
