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

// Prisma 2.x named some model operations differently (`findOne`, `createOne`, …).
// Those keys are gone from the current ModelMapping type, so read them off the
// object and keep only string hits.
const legacyName = (mapping: object, key: string) => {
  const value = Object.entries(mapping).find(([k]) => k === key)?.[1]
  return typeof value === 'string' ? value : undefined
}

const getMappings = (mappings: ExternalDMMF.Mappings, datamodel: ExternalDMMF.Datamodel) => {
  return mappings.modelOperations
    .filter((mapping) => {
      const model = datamodel.models.find((m) => m.name === mapping.model)
      if (!model) {
        throw new Error(`Mapping without model ${mapping.model}`)
      }
      return model.fields.some((f) => f.kind !== 'object')
    })
    .map((mapping) => ({
      model: mapping.model,
      findUnique:
        legacyName(mapping, 'findSingle') || legacyName(mapping, 'findOne') || mapping.findUnique,
      findFirst: mapping.findFirst,
      findMany: mapping.findMany,
      create:
        legacyName(mapping, 'createOne') || legacyName(mapping, 'createSingle') || mapping.create,
      delete:
        legacyName(mapping, 'deleteOne') || legacyName(mapping, 'deleteSingle') || mapping.delete,
      update:
        legacyName(mapping, 'updateOne') || legacyName(mapping, 'updateSingle') || mapping.update,
      deleteMany: mapping.deleteMany,
      updateMany: mapping.updateMany,
      upsert:
        legacyName(mapping, 'upsertOne') || legacyName(mapping, 'upsertSingle') || mapping.upsert,
    }))
}

export const transformDMMF = (dmmf: ExternalDMMF.Document) => {
  return {
    ...dmmf,
    datamodel: dmmf.datamodel,
    mappings: getMappings(dmmf.mappings, dmmf.datamodel),
  }
}
