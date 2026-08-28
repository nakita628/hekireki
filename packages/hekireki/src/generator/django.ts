import type { DMMF } from '@prisma/generator-helper'

import {
  collectDefaultHelpers,
  collectGlobalImports,
  collectManyToManyTables,
  generateEnumClass,
  generateModelBody,
  generateThroughModel,
  hasPrimaryKey,
  resolveNames,
} from '../helper/django.js'

export function djangoCode(
  models: readonly DMMF.Model[],
  enums?: readonly DMMF.DatamodelEnum[],
  indexes?: readonly DMMF.Index[],
) {
  const idx = indexes ?? []
  // Imports and default helpers are collected from the models that are actually
  // emitted; a model without a primary key contributes neither. Relations still
  // resolve against every model.
  const emitted = models.filter((model) => hasPrimaryKey(model))
  const m2mTables = collectManyToManyTables(emitted, enums)
  // Attribute and helper-function names are resolved once so that the columns,
  // the Meta options, the composite primary key and the default helpers all
  // agree on the name each field ended up with.
  const names = resolveNames(emitted, m2mTables)

  const blocks = [
    collectGlobalImports(emitted, idx).join('\n'),
    ...collectDefaultHelpers(emitted, names, enums),
    ...(enums ?? []).map((e) => generateEnumClass(e)),
    ...emitted
      .map((model) => generateModelBody(model, models, idx, m2mTables, names))
      .filter((body) => body !== null),
    ...m2mTables.map((t) => generateThroughModel(t)),
  ]

  return `${blocks.join('\n\n\n')}\n`
}
