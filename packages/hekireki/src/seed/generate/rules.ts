import { Effect } from 'effect'

import type { LooseModelRule, SeedRow } from '../config.js'
import { SeedGenerationError } from '../errors.js'
import type { ResolvedSeedConfig } from '../options.js'
import type { ModelTable, SeedTable } from '../plan.js'
import {
  inverseOwner,
  isKeyObject,
  isLinkField,
  isParentSide,
  isSeedList,
  modelTable,
} from './context.js'

/** What is wrong in one real row and the rows nested in it, as sentences. */
function checkDataRow(
  tables: readonly SeedTable[],
  table: ModelTable,
  row: SeedRow,
  where: string,
): readonly string[] {
  return Object.entries(row).flatMap(([name, value]) => {
    const field = table.model.fields.find((f) => f.name === name)
    if (field === undefined) {
      return [`${where}.${name}: ${table.name} has no field named ${name}.`]
    }
    if (field.kind !== 'object') return []
    if ((field.relationFromFields ?? []).length > 0) {
      return isKeyObject(value)
        ? []
        : [
            `${where}.${name}: name the ${field.type} row by a unique key, \`{ id }\` or \`{ email }\`, or give ${(field.relationFromFields ?? []).join(', ')}.`,
          ]
    }
    if (isLinkField(tables, table.name, name)) {
      return isSeedList(value) || value === null
        ? []
        : [`${where}.${name}: expected a list of ${field.type} ids or keys.`]
    }
    const owner = inverseOwner(tables, table, field)
    const child = modelTable(tables, field.type)
    if (owner === undefined || child === undefined) {
      return [`${where}.${name}: ${table.name}.${name} cannot be written in a row.`]
    }
    const nested = isSeedList(value) ? value : [value]
    return nested.flatMap((item, i) =>
      isKeyObject(item)
        ? checkDataRow(
            tables,
            child,
            item,
            field.isList ? `${where}.${name}[${i}]` : `${where}.${name}`,
          )
        : [`${where}.${name}: expected ${field.isList ? 'rows' : 'a row'} of ${field.type}.`],
    )
  })
}

/** What is wrong with the rules for one model, as sentences; nothing when they fit the schema. */

/** What is wrong with the rules for one model, as sentences; nothing when they fit the schema. */
function checkModel(name: string, rule: LooseModelRule, tables: readonly SeedTable[]) {
  const table = modelTable(tables, name)
  if (table === undefined) return [`models.${name}: no model named ${name} in the schema.`]
  const isColumn = (field: string) =>
    table.model.fields.some((f) => f.name === field && f.kind !== 'object')
  const fields = Object.keys(rule.fields ?? {}).flatMap((field) =>
    isColumn(field)
      ? []
      : [`models.${name}.fields.${field}: ${name} has no scalar field named ${field}.`],
  )
  const data = (rule.data ?? []).flatMap((row, index) =>
    checkDataRow(tables, table, row, `models.${name}.data[${index}]`),
  )
  const bounds = Object.entries(rule.fields ?? {}).flatMap(([field, fieldRule]) => {
    if (typeof fieldRule === 'function') return []
    const range = typeof fieldRule.length === 'object' ? fieldRule.length : null
    const inverted =
      fieldRule.min !== undefined && fieldRule.max !== undefined && fieldRule.min > fieldRule.max
    const invertedLength = range !== null && range.min > range.max
    const dated =
      fieldRule.from !== undefined &&
      fieldRule.to !== undefined &&
      new Date(fieldRule.from).getTime() > new Date(fieldRule.to).getTime()
    const problems: readonly (readonly [boolean, string])[] = [
      [
        inverted,
        `models.${name}.fields.${field}: min ${String(fieldRule.min)} is above max ${String(fieldRule.max)}.`,
      ],
      [
        invertedLength,
        `models.${name}.fields.${field}: length.min ${String(range?.min)} is above length.max ${String(range?.max)}.`,
      ],
      [
        dated,
        `models.${name}.fields.${field}: from ${new Date(fieldRule.from ?? 0).toISOString()} is after to ${new Date(fieldRule.to ?? 0).toISOString()}.`,
      ],
    ]
    return problems.filter(([found]) => found).map(([, message]) => message)
  })
  const relations = Object.entries(rule.relations ?? {}).flatMap(([field, bound]) =>
    isLinkField(tables, name, field) || isParentSide(tables, table, field)
      ? bound.min !== undefined && bound.max !== undefined && bound.min > bound.max
        ? [
            `models.${name}.relations.${field}: min ${String(bound.min)} is above max ${String(bound.max)}.`,
          ]
        : []
      : [
          `models.${name}.relations.${field}: ${name} has no relation field named ${field} that a rule can bound (a list, or the other side of a key).`,
        ],
  )
  const count =
    rule.count !== undefined && (!Number.isInteger(rule.count) || rule.count < 0)
      ? [`models.${name}.count: expected a non-negative integer, got ${String(rule.count)}.`]
      : []
  const exclusive =
    rule.data !== undefined && (rule.count !== undefined || rule.fields !== undefined)
      ? [
          `models.${name}: \`data\` and \`count\` / \`fields\` are exclusive. Give the real rows in \`data\`, or let faker make them with \`count\` and \`fields\`, not both.`,
        ]
      : []
  return [...fields, ...bounds, ...data, ...relations, ...count, ...exclusive]
}

export function checkRules(tables: readonly SeedTable[], config: ResolvedSeedConfig) {
  return Effect.gen(function* () {
    const problems = Object.entries(config.models).flatMap(([name, rule]) =>
      checkModel(name, rule, tables),
    )
    if (problems.length > 0) yield* new SeedGenerationError({ message: problems.join('\n   ') })
  })
}
