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

type TransformOptions = {
  includeRelationFields: boolean
}

const getMappings = (
  mappings: ExternalDMMF.Mappings,
  datamodel: ExternalDMMF.Datamodel,
): DMMFMapping[] => {
  return mappings.modelOperations
    .filter((mapping) => {
      const model = datamodel.models.find((m) => m.name === mapping.model)
      if (!model) {
        throw new Error(`Mapping without model ${mapping.model}`)
      }
      return model.fields.some((f) => f.kind !== 'object')
    })
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
}

export const transformDMMF = (
  dmmf: ExternalDMMF.Document,
  { includeRelationFields }: TransformOptions,
): DMMFDocument => {
  let datamodel = dmmf.datamodel

  if (!includeRelationFields) {
    datamodel = {
      ...dmmf.datamodel,
      models: dmmf.datamodel.models.map((model) => ({
        ...model,
        fields: model.fields.filter((field) => !field.relationName),
      })),
    }
  }

  return {
    ...dmmf,
    datamodel,
    mappings: getMappings(dmmf.mappings, datamodel),
  }
}
