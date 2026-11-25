import type { DMMF } from '@prisma/generator-helper'

import {
  collectDefaultHelpers,
  collectFieldClasses,
  collectGlobalImports,
  collectManyToManyTables,
  enumSqlTypes,
  generateEnumClass,
  generateModelBody,
  generateThroughModel,
  resolveNames,
} from '../helper/django.js'
import { enumSchemas } from '../helper/exposed.js'
import { primaryKeyFields } from '../prisma/model.js'
import { partialIndexWhere } from '../prisma/partial-index.js'
import { prismaBlocks, viewNames } from '../prisma/schema-text.js'

export function djangoCode(
  models: readonly DMMF.Model[],
  enums?: readonly DMMF.DatamodelEnum[],
  indexes?: readonly DMMF.Index[],
  provider = 'postgresql',
  source = '',
) {
  // What DMMF drops is read off the schema's text: the @@schema of an enum, which models are
  // views, and the `where` of a partial index.
  const blocks = prismaBlocks(source)
  // Django's `condition=` takes a Q, not SQL, so a partial index is not declared at all: written
  // as a plain one it would hold every row. It is named in a comment instead.
  const whereOf = partialIndexWhere(blocks)
  const modelsByName = new Map(models.map((m) => [m.name, m]))
  const conditionOf = (index: DMMF.Index) => {
    const model = modelsByName.get(index.model)
    return model === undefined ? undefined : whereOf(model, index)
  }
  const partials = (indexes ?? []).flatMap((index) => {
    const where = conditionOf(index)
    return where === undefined ? [] : [{ index, where }]
  })
  const idx = (indexes ?? []).filter((index) => conditionOf(index) === undefined)
  const views = viewNames(blocks)
  const enumTypes = enumSqlTypes(enums ?? [], enumSchemas(blocks))
  // Imports and default helpers are collected from the models that are actually
  // emitted; a model with nothing to key it by (neither an id nor a required
  // unique, which Prisma refuses) contributes neither. Relations still resolve
  // against every model.
  const emitted = models.filter((model) => primaryKeyFields(model).length > 0)
  const m2mTables = collectManyToManyTables(emitted, enums)
  // Attribute and helper-function names are resolved once so that the columns,
  // the Meta options, the composite primary key and the default helpers all
  // agree on the name each field ended up with.
  const names = resolveNames(emitted, m2mTables)

  const sections = [
    collectGlobalImports(emitted, idx, provider, models).join('\n'),
    ...collectFieldClasses(emitted, provider),
    ...collectDefaultHelpers(emitted, names, enums),
    ...(enums ?? []).map((e) => generateEnumClass(e)),
    ...emitted
      .map((model) =>
        generateModelBody(
          model,
          models,
          idx,
          m2mTables,
          names,
          provider,
          enumTypes,
          views,
          partials,
        ),
      )
      .filter((body) => body !== null),
    ...m2mTables.map((t) => generateThroughModel(t)),
  ]

  return `${sections.join('\n\n\n')}\n`
}
