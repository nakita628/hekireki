import type { DMMF } from '@prisma/generator-helper'

import {
  extractObjectType,
  makePascalCase,
  makeValidationExtractor,
  parseDocumentWithoutAnnotations,
} from '../utils/index.js'

export const PRISMA_TO_PYDANTIC: { [k: string]: string } = {
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
// grouped by the module that exports them. Detection is word-boundary matching
// over the field type expressions, mirroring how collectGlobalImports derives
// the SQLAlchemy import list from the fields it is about to emit.
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
  const escaped = lines.map((l) => l.replace(/\\/g, '\\\\').replace(/"""/g, '\\"\\"\\"'))
  if (escaped.length === 1) return [`${indent}"""${escaped[0]}"""`]
  return [
    `${indent}"""${escaped[0]}`,
    ...escaped.slice(1).map((l) => `${indent}${l}`),
    `${indent}"""`,
  ]
}

// zod strictObject / looseObject equivalents: `/// @p.strictObject` on the
// model rejects unknown keys (extra="forbid"), `/// @p.looseObject` keeps
// them (extra="allow"); no annotation is pydantic's default (extra="ignore").
function makeConfigLine(model: DMMF.Model) {
  const objectType = extractObjectType(model.documentation, '@p.')
  if (objectType === 'strict') return '    model_config = ConfigDict(extra="forbid")'
  if (objectType === 'loose') return '    model_config = ConfigDict(extra="allow")'
  return null
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

export function collectPydanticImports(
  models: readonly DMMF.Model[],
  enums: readonly DMMF.DatamodelEnum[] | undefined,
) {
  const included = models.filter((model) =>
    model.fields.some((field) => makePydanticField(field, enums) !== null),
  )
  const text = included
    .flatMap((model) =>
      model.fields.flatMap((field) => {
        const result = makePydanticField(field, enums)
        return result === null ? [] : [result.expression]
      }),
    )
    .join('\n')
  const used = (names: readonly string[]) =>
    names.filter((name) => new RegExp(`\\b${name}\\b`).test(text))

  const hasConfig = included.some(
    (model) => extractObjectType(model.documentation, '@p.') !== undefined,
  )
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
