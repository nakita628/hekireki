import type { DMMF as ExternalDMMF } from '@prisma/generator-helper'

export interface DMMFMapping {
  model: string
  findUnique?: string | null
  findFirst?: string | null
  findMany?: string | null
  create?: string | null
  update?: string | null
  updateMany?: string | null
  upsert?: string | null
  delete?: string | null
  deleteMany?: string | null
}

export type DMMFDocument = Omit<ExternalDMMF.Document, 'mappings'> & {
  mappings: DMMFMapping[]
}

const getMappings = (
  mappings: ExternalDMMF.Mappings,
  datamodel: ExternalDMMF.Datamodel,
): DMMFMapping[] => {
  return (
    mappings.modelOperations
      .filter((mapping) => {
        const model = datamodel.models.find((m) => m.name === mapping.model)
        if (!model) {
          throw new Error(`Mapping without model ${mapping.model}`)
        }
        return model.fields.some((f) => f.kind !== 'object')
      })
      // biome-ignore lint/suspicious/noExplicitAny: legacy Prisma mapping properties
      .map((mapping: any) => ({
        model: mapping.model,
        findUnique: mapping.findSingle || mapping.findOne || mapping.findUnique,
        findFirst: mapping.findFirst,
        findMany: mapping.findMany,
        create: mapping.createOne || mapping.createSingle || mapping.create,
        delete: mapping.deleteOne || mapping.deleteSingle || mapping.delete,
        update: mapping.updateOne || mapping.updateSingle || mapping.update,
        deleteMany: mapping.deleteMany,
        updateMany: mapping.updateMany,
        upsert: mapping.upsertOne || mapping.upsertSingle || mapping.upsert,
      }))
  )
}

export const transformDMMF = (dmmf: ExternalDMMF.Document): DMMFDocument => {
  return {
    ...dmmf,
    datamodel: dmmf.datamodel,
    mappings: getMappings(dmmf.mappings, dmmf.datamodel),
  }
}
