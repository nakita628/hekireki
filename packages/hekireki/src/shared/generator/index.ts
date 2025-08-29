import fsp from 'node:fs/promises'
import path from 'node:path'
import type { DMMF, GeneratorOptions } from '@prisma/generator-helper'

export async function schemaGenerator(
  outDir: Readonly<string>,
  dmmf: Readonly<GeneratorOptions['dmmf']>,
  importCode: string,
  buildSchema: (model: DMMF.Model) => Readonly<string>,
  buildRelations: (
    model: DMMF.Model,
    relProps: readonly { key: string; targetModel: string; isMany: boolean }[],
  ) => Readonly<string>,
  collectRelationProps: (models: readonly DMMF.Model[]) => Readonly<
    {
      model: string
      key: string
      targetModel: string
      isMany: boolean
    }[]
  >,
) {
  const models = dmmf.datamodel.models
  const relIndex = collectRelationProps(models)
  const relByModel = Object.groupBy(relIndex, (r) => r.model)

  const baseSchemas = models.map((m) => buildSchema(m)).join('\n\n')

  const relationSchemas = models
    .map((m) => {
      const relProps = (relByModel[m.name] ?? []).map(({ key, targetModel, isMany }) => ({
        key,
        targetModel,
        isMany,
      }))
      return buildRelations(m, relProps)
    })
    .filter(Boolean)
    .join('\n\n')

  const body = relationSchemas ? `${baseSchemas}\n\n${relationSchemas}` : baseSchemas
  const code = `${importCode}\n${body}\n`

  await fsp.mkdir(outDir, { recursive: true })
  await fsp.writeFile(path.join(outDir, 'index.ts'), code, 'utf8')
}
