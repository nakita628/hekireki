import type { DMMF } from '@prisma/generator-helper'

import { autoLayout } from '../diagram/layout.js'
import { svgToPng } from '../diagram/png.js'
import { renderDiagramSvg } from '../diagram/svg.js'
import { withRasterFonts } from '../diagram/text.js'
import { annotatedDbmlRefs, makeEnums, makeRelations, makeTables } from '../helper/dbml.js'
import { makeSchema } from '../studio/server/domain/schema.js'
import type { DiagramTheme } from '../types/index.js'

/** The schema as DBML, named as the database names it: every `@map` / `@@map` applied. */
export function dbmlContent(datamodel: DMMF.Datamodel) {
  const tables = makeTables(datamodel.models, datamodel.enums)
  const enums = makeEnums(datamodel.enums)
  const refs = makeRelations(datamodel.models)
  const logicalRefs = annotatedDbmlRefs(datamodel.models)

  return [...enums, ...tables, ...refs, ...logicalRefs].join('\n\n')
}

type DiagramSchema = ReturnType<typeof makeSchema>

/** The ER diagram as Studio draws it, laid out automatically, as an SVG document. */
export function erDiagramSvg(datamodel: DMMF.Datamodel, theme: DiagramTheme = 'light') {
  return schemaSvg(
    makeSchema({ dmmf: { datamodel }, files: [], provider: null, blocks: [] }),
    theme,
  )
}

/**
 * Draws a schema as Studio holds it, laid out automatically, as an SVG document.
 *
 * @param schema - the models, relations and enums to draw
 * @param theme - the colour scheme, light by default
 * @returns the SVG document
 */
export function schemaSvg(
  schema: Pick<DiagramSchema, 'models' | 'relations' | 'enums'>,
  theme: DiagramTheme = 'light',
) {
  return renderDiagramSvg({
    models: schema.models,
    relations: schema.relations,
    enums: schema.enums,
    positions: autoLayout(schema),
    theme,
  })
}

/**
 * The part of a schema around one model: the model, the models a relation joins it to, the
 * relations that touch it, and the enums those models hold. What the model's own diagram draws.
 *
 * @param schema - the whole schema, as Studio holds it
 * @param model - the model's name
 * @returns the same shape, cut down to the model's neighbourhood
 */
export function neighborhood(schema: DiagramSchema, model: string) {
  const relations = schema.relations.filter(
    (relation) => relation.from.model === model || relation.to.model === model,
  )
  const names = new Set([model, ...relations.flatMap((r) => [r.from.model, r.to.model])])
  const models = schema.models.filter((m) => names.has(m.name))
  const held = new Set(
    models.flatMap((m) => m.fields.filter((f) => f.kind === 'enum').map((f) => f.type)),
  )
  return { models, relations, enums: schema.enums.filter((e) => held.has(e.name)) }
}

/**
 * The ER diagram as Studio draws it, rasterised to PNG at 2x. The font stacks are swapped for the
 * ones that put CJK first: resvg draws no text at all for a family that lacks the glyphs, where
 * the browser the SVG is written for falls back a glyph at a time.
 */
export function erDiagramPng(datamodel: DMMF.Datamodel, theme: DiagramTheme = 'light') {
  return svgToPng(withRasterFonts(erDiagramSvg(datamodel, theme)))
}
