import type { DMMF } from '@prisma/generator-helper'

import {
  makePascalCase,
  makeValidationExtractor,
  parseDocumentWithoutAnnotations,
} from '../utils/index.js'

const PRISMA_TO_PYDANTIC: { [k: string]: string } = {
  String: 'str',
  Int: 'int',
  BigInt: 'int',
  Float: 'float',
  Decimal: 'Decimal',
  Boolean: 'bool',
  DateTime: 'datetime',
  Json: 'JsonValue',
  Bytes: 'bytes',
}

// Python hard keywords cannot be attribute names (`async`/`yield` etc. are a
// syntax error). Soft keywords (match/case/type/_) are valid names and
// excluded. A keyword field is exposed as `<name>_` and still validated under
// its real name via Field(alias=...).
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

export function pydanticFieldName(name: string) {
  return PYTHON_KEYWORDS.has(name) ? `${name}_` : name
}

// Names an `@p.` annotation (or the built-in type mapping) may reference,
// grouped by the module that exports them; imports are derived by
// word-boundary matching over the field type expressions.
const PYDANTIC_NAMES = [
  'AnyUrl',
  'AwareDatetime',
  'Base64Bytes',
  'Base64Str',
  'ByteSize',
  'EmailStr',
  'Field',
  'FutureDate',
  'FutureDatetime',
  'HttpUrl',
  'IPvAnyAddress',
  'Json',
  'JsonValue',
  'NaiveDatetime',
  'NegativeFloat',
  'NegativeInt',
  'NonNegativeFloat',
  'NonNegativeInt',
  'NonPositiveFloat',
  'NonPositiveInt',
  'PastDate',
  'PastDatetime',
  'PositiveFloat',
  'PositiveInt',
  'SecretBytes',
  'SecretStr',
  'StrictBool',
  'StrictBytes',
  'StrictFloat',
  'StrictInt',
  'StrictStr',
  'StringConstraints',
  'UUID1',
  'UUID3',
  'UUID4',
  'UUID5',
  'UUID6',
  'UUID7',
  'UUID8',
]

const TYPING_NAMES = ['Annotated', 'Any', 'Literal', 'Optional', 'Union']

const DATETIME_NAMES = ['date', 'datetime', 'time', 'timedelta']

const extractPydanticAnnotation = makeValidationExtractor('@p.')

function pythonBaseType(field: DMMF.Field, enums: readonly DMMF.DatamodelEnum[] | undefined) {
  if (field.kind === 'enum') {
    const enumDef = enums?.find((e) => e.name === field.type)
    return enumDef ? `Literal[${enumDef.values.map((v) => `"${v.name}"`).join(', ')}]` : 'str'
  }
  const nativeName = field.nativeType?.[0]
  if (nativeName === 'Uuid') return 'UUID'
  if (nativeName === 'Date') return 'date'
  if (nativeName === 'Time' || nativeName === 'Timetz') return 'time'
  return PRISMA_TO_PYDANTIC[field.type] ?? 'str'
}

export function makePydanticField(
  field: DMMF.Field,
  enums: readonly DMMF.DatamodelEnum[] | undefined,
) {
  if (field.kind === 'object') return null
  const annotation = extractPydanticAnnotation(field.documentation)
  const base = annotation ?? pythonBaseType(field, enums)
  const withList = field.isList ? `list[${base}]` : base
  const optional = !(field.isRequired || field.isList)
  const typeExpr = optional ? `${withList} | None` : withList
  const attrName = pydanticFieldName(field.name)
  const rhs =
    attrName !== field.name
      ? optional
        ? ` = Field(default=None, alias="${field.name}")`
        : ` = Field(alias="${field.name}")`
      : optional
        ? ' = None'
        : ''
  return {
    line: `    ${attrName}: ${typeExpr}${rhs}`,
    expression: `${typeExpr}${rhs}`,
  }
}

function makeDocstring(lines: readonly string[], indent: string) {
  if (lines.length === 0) return []
  const escaped = lines.map((l) => l.replaceAll('\\', '\\\\').replaceAll('"""', '\\"\\"\\"'))
  // Text ending in `"` would fuse with an appended closing `"""` into four
  // quotes (a Python SyntaxError), so those fall back to the multi-line form
  // whose closing quotes sit on their own line.
  if (escaped.length === 1 && !escaped[0].endsWith('"')) {
    return [`${indent}"""${escaped[0]}"""`]
  }
  return [
    `${indent}"""${escaped[0]}`,
    ...escaped.slice(1).map((l) => `${indent}${l}`),
    `${indent}"""`,
  ]
}

// Pydantic's own idiom instead of zod-style strictObject/looseObject:
// `/// @p.ConfigDict(extra='forbid')` on the model passes the expression
// through verbatim as `model_config`. Any ConfigDict arguments work; no
// annotation leaves pydantic's default (extra="ignore").
function extractConfigDict(documentation: string | undefined) {
  const annotation = extractPydanticAnnotation(documentation)
  return annotation !== null && annotation.startsWith('ConfigDict(') ? annotation : null
}

function makeConfigLine(model: DMMF.Model) {
  const config = extractConfigDict(model.documentation)
  return config === null ? null : `    model_config = ${config}`
}

export function makePydanticModel(
  model: DMMF.Model,
  enums: readonly DMMF.DatamodelEnum[] | undefined,
  comment: boolean,
) {
  const built = model.fields.flatMap((field) => {
    const result = makePydanticField(field, enums)
    return result === null ? [] : [{ field, result }]
  })
  if (built.length === 0) return null

  const docLines = comment
    ? makeDocstring(parseDocumentWithoutAnnotations(model.documentation), '    ')
    : []
  const configLine = makeConfigLine(model)
  // oxlint-disable-next-line oxc/no-map-spread -- one docstring per field, not an accumulator
  const fieldLines = built.flatMap(({ field, result }) => [
    result.line,
    ...(comment ? makeDocstring(parseDocumentWithoutAnnotations(field.documentation), '    ') : []),
  ])

  const sections = [docLines, configLine === null ? [] : [configLine], fieldLines].filter(
    (section) => section.length > 0,
  )
  return [
    `class ${makePascalCase(model.name)}(BaseModel):`,
    sections.map((section) => section.join('\n')).join('\n\n'),
  ].join('\n')
}

function hasGeneratedFields(model: DMMF.Model, enums: readonly DMMF.DatamodelEnum[] | undefined) {
  return model.fields.some((field) => makePydanticField(field, enums) !== null)
}

// zod's `relation = true` equivalent: a `<Model>Relations` subclass of the
// base model whose relation fields reference the base classes (`Post`, not
// `PostRelations`). Emitted after every base class, so no forward references
// are needed. Targets that generate no class (all-relation models) are
// skipped, matching what actually exists in the file.
export function makePydanticRelations(
  model: DMMF.Model,
  models: readonly DMMF.Model[],
  enums: readonly DMMF.DatamodelEnum[] | undefined,
) {
  if (!hasGeneratedFields(model, enums)) return null
  const relFields = model.fields.filter(
    (field) =>
      field.kind === 'object' &&
      models.some((m) => m.name === field.type && hasGeneratedFields(m, enums)),
  )
  if (relFields.length === 0) return null
  const lines = relFields.map((field) => {
    const target = makePascalCase(field.type)
    const typeExpr = field.isList ? `list[${target}]` : target
    const attrName = pydanticFieldName(field.name)
    const rhs = attrName !== field.name ? ` = Field(alias="${field.name}")` : ''
    return `    ${attrName}: ${typeExpr}${rhs}`
  })
  const className = makePascalCase(model.name)
  return [`class ${className}Relations(${className}):`, ...lines].join('\n')
}

export function collectPydanticImports(
  models: readonly DMMF.Model[],
  enums: readonly DMMF.DatamodelEnum[] | undefined,
  relation = false,
) {
  const included = models.filter((model) => hasGeneratedFields(model, enums))
  const fieldText = included
    .flatMap((model) =>
      model.fields.flatMap((field) => {
        const result = makePydanticField(field, enums)
        return result === null ? [] : [result.expression]
      }),
    )
    .join('\n')
  const relationText = relation
    ? models
        .flatMap((model) => {
          const code = makePydanticRelations(model, models, enums)
          return code === null ? [] : [code]
        })
        .join('\n')
    : ''
  const text = [fieldText, relationText].join('\n')
  const used = (names: readonly string[]) =>
    names.filter((name) => new RegExp(`\\b${name}\\b`).test(text))

  const hasConfig = included.some((model) => extractConfigDict(model.documentation) !== null)
  const pydanticNames = [
    'BaseModel',
    ...(hasConfig ? ['ConfigDict'] : []),
    ...used(PYDANTIC_NAMES),
  ].toSorted()

  const lines = [`from pydantic import ${pydanticNames.join(', ')}`]
  const typingNames = used(TYPING_NAMES)
  if (typingNames.length > 0) {
    lines.push(`from typing import ${typingNames.join(', ')}`)
  }
  if (/\bDecimal\b/.test(text)) lines.push('from decimal import Decimal')
  const datetimeNames = used(DATETIME_NAMES)
  if (datetimeNames.length > 0) {
    lines.push(`from datetime import ${datetimeNames.join(', ')}`)
  }
  if (/\bUUID\b/.test(text)) lines.push('from uuid import UUID')
  return lines
}
