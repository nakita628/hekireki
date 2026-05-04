import type { DMMF } from '@prisma/generator-helper'

import {
  createImports,
  generateImports,
  makeRelations,
  makeTable,
  resolveDbProvider,
} from '../helper/drizzle.js'

export function drizzleSchema(
  datamodel: DMMF.Datamodel,
  provider: 'postgresql' | 'cockroachdb' | 'mysql' | 'sqlite',
  indexes: readonly DMMF.Index[],
): string {
  const db = resolveDbProvider(provider)
  const imports = createImports()

  const tableLines = datamodel.models.map((model) =>
    makeTable(model, db, imports, datamodel.enums, indexes),
  )
  const relationsLines = makeRelations(datamodel.models, imports)

  const tableLinesWithGap = tableLines.flatMap((line, i) =>
    i < tableLines.length - 1 ? [line, ''] : [line],
  )
  const relationsLinesWithGap = relationsLines.flatMap((line, i) =>
    i < relationsLines.length - 1 ? [line, ''] : [line],
  )

  return [
    generateImports(imports, db),
    '',
    ...tableLinesWithGap,
    ...(relationsLinesWithGap.length > 0 ? ['', ...relationsLinesWithGap] : []),
  ].join('\n')
}

export function parsePrismaProvider(raw: string) {
  if (raw === 'postgresql' || raw === 'cockroachdb' || raw === 'mysql' || raw === 'sqlite') {
    return { ok: true, value: raw } as const
  }
  return { ok: false, error: `Unsupported provider: ${raw}` } as const
}
