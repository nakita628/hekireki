import type { DMMF } from '@prisma/generator-helper'

import { tsString } from '../utils/typescript.js'

/** One field as a value (`kind: 'scalar'`) or as a type (`readonly kind: 'scalar'`). */
function fieldEntry(field: DMMF.Field, declaration: boolean) {
  const key = declaration ? 'readonly ' : ''
  const list = declaration ? 'readonly ' : ''
  const owning =
    field.kind === 'object' && (field.relationFromFields ?? []).length > 0
      ? `; ${key}relationFromFields: ${list}[${(field.relationFromFields ?? []).map(tsString).join(', ')}]`
      : ''
  const relation =
    field.kind === 'object' && field.relationName !== undefined
      ? `; ${key}relationName: ${tsString(field.relationName)}${owning}`
      : ''
  const hasDefault = field.hasDefaultValue || field.isUpdatedAt === true
  return `{ ${key}name: ${tsString(field.name)}; ${key}kind: '${field.kind}'; ${key}type: ${tsString(field.type)}; ${key}isList: ${String(field.isList)}; ${key}isRequired: ${String(field.isRequired)}; ${key}hasDefault: ${String(hasDefault)}${relation} }`.replaceAll(
    declaration ? /(?!)/gu : /; /gu,
    ', ',
  )
}

/** Every way to name one row of the model, `@id` and `@unique` fields first, then `@@id` and `@@unique`. */
function uniqueSets(model: DMMF.Model) {
  const singles = model.fields
    .filter((f) => f.kind !== 'object' && (f.isUnique || f.isId))
    .map((f) => [f.name])
  const composite = [
    ...(model.primaryKey === null ? [] : [model.primaryKey.fields]),
    ...model.uniqueFields,
  ]
  const all = [...singles, ...composite]
  return all.filter(
    (set, index) => all.findIndex((other) => other.join(' ') === set.join(' ')) === index,
  )
}

function modelEntries(datamodel: DMMF.Datamodel, declaration: boolean) {
  const key = declaration ? 'readonly ' : ''
  const list = declaration ? 'readonly ' : ''
  const sep = declaration ? ';' : ','
  return datamodel.models
    .map((model) => {
      const uniques = uniqueSets(model)
        .map((set) => `${list}[${set.map(tsString).join(', ')}]`)
        .join(', ')
      return `{ ${key}name: ${tsString(model.name)}${sep} ${key}fields: ${list}[${model.fields.map((field) => fieldEntry(field, declaration)).join(', ')}]${sep} ${key}uniques: ${list}[${uniques}] }`
    })
    .join(', ')
}

function enumEntries(datamodel: DMMF.Datamodel, declaration: boolean) {
  const key = declaration ? 'readonly ' : ''
  const list = declaration ? 'readonly ' : ''
  return datamodel.enums
    .map(
      (declared) =>
        `{ ${key}name: ${tsString(declared.name)}${declaration ? ';' : ','} ${key}values: ${list}[${declared.values.map((value) => tsString(value.name)).join(', ')}] }`,
    )
    .join(', ')
}

/**
 * The schema module `hekireki-seed` writes: the models, fields, unique keys and enums as one
 * `defineSchema` literal, so `defineConfig(schema, { ... })` in hekireki.config.ts is checked
 * against them. One TypeScript file: `hekireki seed` runs the config as TypeScript and resolves
 * `import { schema } from './generated/seed/schema'` to it.
 */
export function seedSchemaCode(datamodel: DMMF.Datamodel) {
  return `import { defineSchema } from 'hekireki'

export const schema = defineSchema({
  models: [${modelEntries(datamodel, false)}],
  enums: [${enumEntries(datamodel, false)}],
})
`
}
