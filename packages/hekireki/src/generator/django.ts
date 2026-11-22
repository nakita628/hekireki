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
import { prismaBlocks } from '../prisma/schema-text.js'

export function djangoCode(
  models: readonly DMMF.Model[],
  enums?: readonly DMMF.DatamodelEnum[],
  indexes?: readonly DMMF.Index[],
  provider = 'postgresql',
  source = '',
) {
  const idx = indexes ?? []
  // What DMMF drops is read off the schema's text: the @@schema of an enum.
  const blocks = prismaBlocks(source)
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
    collectGlobalImports(emitted, idx, provider).join('\n'),
    ...collectFieldClasses(emitted, provider),
    ...collectDefaultHelpers(emitted, names, enums),
    ...(enums ?? []).map((e) => generateEnumClass(e)),
    ...emitted
      .map((model) => generateModelBody(model, models, idx, m2mTables, names, provider, enumTypes))
      .filter((body) => body !== null),
    ...m2mTables.map((t) => generateThroughModel(t)),
  ]

  return `${sections.join('\n\n\n')}\n`
}
