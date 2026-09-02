import type { Schema } from '../../../server/routes/index.js'
import { blockAtLine } from './blocks.js'

export type CompletionKind =
  | 'keyword'
  | 'type'
  | 'attribute'
  | 'function'
  | 'field'
  | 'enum'
  | 'value'

export type LocalCompletion = {
  readonly label: string
  readonly kind: CompletionKind
  readonly snippet: string | null
  readonly detail: string | null
}

export type LocalCompletions = {
  readonly from: number
  readonly options: readonly LocalCompletion[]
}

const SCALARS = [
  'String',
  'Int',
  'BigInt',
  'Float',
  'Decimal',
  'Boolean',
  'DateTime',
  'Json',
  'Bytes',
]

const BLOCKS: readonly LocalCompletion[] = [
  {
    label: 'model',
    kind: 'keyword',
    snippet: 'model ${Name} {\n  ${}\n}',
    detail: 'Define a model',
  },
  { label: 'enum', kind: 'keyword', snippet: 'enum ${Name} {\n  ${}\n}', detail: 'Define an enum' },
  {
    label: 'datasource',
    kind: 'keyword',
    snippet: 'datasource db {\n  provider = "${postgresql}"\n}',
    detail: 'Database connection',
  },
  {
    label: 'generator',
    kind: 'keyword',
    snippet: 'generator ${client} {\n  provider = "${}"\n}',
    detail: 'Code generator',
  },
]

const FIELD_ATTRIBUTES: readonly LocalCompletion[] = [
  { label: '@id', kind: 'attribute', snippet: null, detail: 'Primary key' },
  { label: '@unique', kind: 'attribute', snippet: null, detail: 'Unique constraint' },
  { label: '@default', kind: 'attribute', snippet: '@default(${})', detail: 'Default value' },
  {
    label: '@map',
    kind: 'attribute',
    snippet: '@map("${}")',
    detail: 'Column name in the database',
  },
  {
    label: '@relation',
    kind: 'attribute',
    snippet: '@relation(fields: [${}], references: [${}])',
    detail: 'Relation',
  },
  { label: '@updatedAt', kind: 'attribute', snippet: null, detail: 'Set to now() on update' },
  { label: '@db', kind: 'attribute', snippet: '@db.${}', detail: 'Native database type' },
  { label: '@ignore', kind: 'attribute', snippet: null, detail: 'Exclude from the client' },
]

const BLOCK_ATTRIBUTES: readonly LocalCompletion[] = [
  { label: '@@id', kind: 'attribute', snippet: '@@id([${}])', detail: 'Composite primary key' },
  {
    label: '@@unique',
    kind: 'attribute',
    snippet: '@@unique([${}])',
    detail: 'Composite unique constraint',
  },
  { label: '@@index', kind: 'attribute', snippet: '@@index([${}])', detail: 'Index' },
  {
    label: '@@map',
    kind: 'attribute',
    snippet: '@@map("${}")',
    detail: 'Table name in the database',
  },
  { label: '@@schema', kind: 'attribute', snippet: '@@schema("${}")', detail: 'Database schema' },
  {
    label: '@@fulltext',
    kind: 'attribute',
    snippet: '@@fulltext([${}])',
    detail: 'Full-text index',
  },
  { label: '@@ignore', kind: 'attribute', snippet: null, detail: 'Exclude from the client' },
]

const DEFAULT_FUNCTIONS: readonly LocalCompletion[] = [
  { label: 'autoincrement()', kind: 'function', snippet: null, detail: 'Sequence (Int / BigInt)' },
  { label: 'now()', kind: 'function', snippet: null, detail: 'Current timestamp' },
  { label: 'uuid()', kind: 'function', snippet: null, detail: 'UUID v4' },
  { label: 'uuid(7)', kind: 'function', snippet: null, detail: 'UUID v7' },
  { label: 'cuid()', kind: 'function', snippet: null, detail: 'CUID' },
  { label: 'cuid(2)', kind: 'function', snippet: null, detail: 'CUID v2' },
  { label: 'ulid()', kind: 'function', snippet: null, detail: 'ULID' },
  { label: 'nanoid()', kind: 'function', snippet: null, detail: 'Nano ID' },
  {
    label: 'dbgenerated',
    kind: 'function',
    snippet: 'dbgenerated("${}")',
    detail: 'Database expression',
  },
  { label: 'true', kind: 'value', snippet: null, detail: null },
  { label: 'false', kind: 'value', snippet: null, detail: null },
]

const RELATION_ARGUMENTS: readonly LocalCompletion[] = [
  {
    label: 'fields',
    kind: 'field',
    snippet: 'fields: [${}]',
    detail: 'Foreign key fields on this model',
  },
  { label: 'references', kind: 'field', snippet: 'references: [${}]', detail: 'Referenced fields' },
  {
    label: 'onDelete',
    kind: 'field',
    snippet: 'onDelete: ${Cascade}',
    detail: 'Referential action',
  },
  {
    label: 'onUpdate',
    kind: 'field',
    snippet: 'onUpdate: ${Cascade}',
    detail: 'Referential action',
  },
  { label: 'name', kind: 'field', snippet: 'name: "${}"', detail: 'Relation name' },
  { label: 'map', kind: 'field', snippet: 'map: "${}"', detail: 'Constraint name' },
]

const REFERENTIAL_ACTIONS: readonly LocalCompletion[] = [
  'Cascade',
  'Restrict',
  'NoAction',
  'SetNull',
  'SetDefault',
].map((label) => ({ label, kind: 'value', snippet: null, detail: 'Referential action' }))

function wordStart(lineBefore: string) {
  return lineBefore.length - (/[@\w.]*$/u.exec(lineBefore)?.[0].length ?? 0)
}

function fieldsOf(schema: Schema | null, model: string) {
  return (
    schema?.models.find((m) => m.name === model)?.fields.filter((f) => f.kind !== 'object') ?? []
  )
}

function fieldsFromText(text: string, block: { readonly start: number; readonly end: number }) {
  return text
    .split('\n')
    .slice(block.start, block.end - 1)
    .flatMap((line) => {
      const match = /^\s+(\w+)\s+([\w.]+)/u.exec(line)
      return match &&
        !line.trim().startsWith('@') &&
        !line.trim().startsWith('//') &&
        !line.includes('@relation(')
        ? [{ name: match[1] ?? '', type: match[2] ?? '' }]
        : []
    })
}

// Completions derived from the document and the parsed schema; the server adds the ones only
// the Prisma language server knows.
export function localCompletions(
  text: string,
  offset: number,
  schema: Schema | null,
): LocalCompletions | null {
  const before = text.slice(0, offset)
  const lineStart = before.lastIndexOf('\n') + 1
  const lineBefore = before.slice(lineStart)
  const lineNumber = before.split('\n').length
  const from = lineStart + wordStart(lineBefore)
  const block = blockAtLine(text, lineNumber)
  const modelNames = schema?.models.map((m) => m.name) ?? []
  const enumNames = schema?.enums.map((e) => e.name) ?? []

  if (block === null) {
    return /^\s*[\w]*$/u.test(lineBefore) && !/^\s+/u.test(lineBefore)
      ? { from, options: BLOCKS }
      : null
  }
  if (block.kind === 'enum') return null

  const relation = /@relation\(([^)]*)$/u.exec(lineBefore)
  if (relation) {
    const inside = relation[1] ?? ''
    const currentField = /^\s+(\w+)\s+([\w.]+)/u.exec(lineBefore)
    const relatedModel = currentField?.[2]?.replaceAll(/[[\]?]/gu, '') ?? ''
    if (/fields:\s*\[[^\]]*$/u.test(inside)) {
      const known = fieldsOf(schema, block.name).map((f) => f.name)
      const fields = known.length > 0 ? known : fieldsFromText(text, block).map((f) => f.name)
      return {
        from,
        options: fields.map((label) => ({
          label,
          kind: 'field',
          snippet: null,
          detail: `Field of ${block.name}`,
        })),
      }
    }
    if (/references:\s*\[[^\]]*$/u.test(inside)) {
      const fields = fieldsOf(schema, relatedModel).map((f) => f.name)
      return {
        from,
        options: fields.map((label) => ({
          label,
          kind: 'field',
          snippet: null,
          detail: `Field of ${relatedModel}`,
        })),
      }
    }
    if (/on(?:Delete|Update):\s*\w*$/u.test(inside)) return { from, options: REFERENTIAL_ACTIONS }
    return { from, options: RELATION_ARGUMENTS }
  }
  const defaultArg = /@default\(([^)]*)$/u.exec(lineBefore)
  if (defaultArg) {
    const type = /^\s+\w+\s+([\w.]+)/u.exec(lineBefore)?.[1]?.replaceAll(/[[\]?]/gu, '') ?? ''
    const values =
      schema?.enums.find((e) => e.name === type)?.values.map((value) => value.name) ?? []
    return {
      from,
      options: [
        ...values.map(
          (label) => ({ label, kind: 'enum', snippet: null, detail: `Value of ${type}` }) as const,
        ),
        ...DEFAULT_FUNCTIONS,
      ],
    }
  }
  if (/^\s+@@[\w.]*$/u.test(lineBefore)) return { from, options: BLOCK_ATTRIBUTES }
  if (/^\s+\w+\s+\S+.*@[\w.]*$/u.test(lineBefore)) return { from, options: FIELD_ATTRIBUTES }
  if (/^\s+\w+\s+[\w.[\]?]*$/u.test(lineBefore)) {
    return {
      from,
      options: [
        ...SCALARS.map(
          (label) => ({ label, kind: 'type', snippet: null, detail: 'Scalar type' }) as const,
        ),
        ...modelNames.map(
          (label) => ({ label, kind: 'type', snippet: null, detail: 'Model' }) as const,
        ),
        ...enumNames.map(
          (label) => ({ label, kind: 'enum', snippet: null, detail: 'Enum' }) as const,
        ),
      ],
    }
  }
  return null
}
