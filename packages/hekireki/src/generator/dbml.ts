import type { DMMF } from '@prisma/generator-helper'

import { autoLayout } from '../diagram/layout.js'
import { svgToPng } from '../diagram/png.js'
import { renderDiagramSvg, withRasterFonts } from '../diagram/svg.js'
import type { DiagramTheme } from '../diagram/svg.js'
import { annotatedDbmlRefs, makeEnums, makeRelations, makeTables } from '../helper/dbml.js'
import { makeSchema } from '../studio/server/domain/schema.js'

/** The schema as DBML, named as the database names it: every `@map` / `@@map` applied. */
export function dbmlContent(datamodel: DMMF.Datamodel) {
  const tables = makeTables(datamodel.models, datamodel.enums)
  const enums = makeEnums(datamodel.enums)
  const refs = makeRelations(datamodel.models)
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
  const positions = autoLayout(schema)
  return renderDiagramSvg({
    models: schema.models,
    relations: schema.relations,
    enums: schema.enums,
    positions,
    theme,
  })
}

/**
 * The ER diagram as Studio draws it, rasterised to PNG at 2x. The font stacks are swapped for the
 * ones that put CJK first: resvg draws no text at all for a family that lacks the glyphs, where
 * the browser the SVG is written for falls back a glyph at a time.
 */
export function erDiagramPng(datamodel: DMMF.Datamodel, theme: DiagramTheme = 'light') {
  return svgToPng(withRasterFonts(erDiagramSvg(datamodel, theme)))
}
