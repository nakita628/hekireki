import type { DMMF } from '@prisma/generator-helper'
import { Resvg } from '@resvg/resvg-js'
import { run } from '@softwaretechnik/dbml-renderer'

import { makeEnums, makeRelations, makeTables } from '../helper/dbml.js'

export function dbmlContent(datamodel: DMMF.Datamodel, mapToDbSchema = false) {
  const tables = makeTables(datamodel.models, mapToDbSchema)
  const enums = makeEnums(datamodel.enums)
  const refs = makeRelations(datamodel.models, mapToDbSchema)

  return [...enums, ...tables, ...refs].join('\n\n')
}

export function dbmlToPng(dbml: string) {
  const svg = run(dbml, 'svg')
  const resvg = new Resvg(svg, {
    font: {
      loadSystemFonts: true,
    },
  })
  return resvg.render().asPng()
}
