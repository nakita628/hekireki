import type { DMMF } from '@prisma/generator-helper'

import { autoLayout } from '../diagram/layout.js'
import { svgToPng } from '../diagram/png.js'
import { renderDiagramSvg } from '../diagram/svg.js'
import type { DiagramTheme } from '../diagram/svg.js'
import { annotatedDbmlRefs, makeEnums, makeRelations, makeTables } from '../helper/dbml.js'
import { makeSchema } from '../studio/server/domain/schema.js'

export function dbmlContent(datamodel: DMMF.Datamodel, mapToDbSchema = false) {
  const tables = makeTables(datamodel.models, mapToDbSchema)
  const enums = makeEnums(datamodel.enums)
  const refs = makeRelations(datamodel.models, mapToDbSchema)
  const logicalRefs = annotatedDbmlRefs(datamodel.models)

  return [...enums, ...tables, ...refs, ...logicalRefs].join('\n\n')
}

/** The ER diagram as Studio draws it, laid out automatically, as an SVG document. */
export function erDiagramSvg(datamodel: DMMF.Datamodel, theme: DiagramTheme = 'light') {
  const schema = makeSchema({
    dmmf: { datamodel },
    files: [],
    provider: null,
    blocks: [],
  })
  const positions = autoLayout(schema.models, schema.relations)
  return renderDiagramSvg({
    models: schema.models,
    relations: schema.relations,
    positions,
    theme,
  })
}

/** The ER diagram as Studio draws it, rasterised to PNG at 2x. */
export function erDiagramPng(datamodel: DMMF.Datamodel, theme: DiagramTheme = 'light') {
  return svgToPng(erDiagramSvg(datamodel, theme))
}
