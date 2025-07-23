import type { DMMF } from '@prisma/generator-helper'
import { groupByModel, isFields } from '../../../shared/utils/index.js'
import { inferInput, isValibot, isValibotDocument } from '../utils/index.js'
import { schemas } from './schemas.js'

/**
 * Generate Valibot schemas and types
 * @param models - The models to generate the Valibot schemas and types for
 * @param type - Whether to generate types
 * @param comment - Whether to include comments in the generated code
 * @returns The generated Valibot schemas and types
 */
export function valibot(models: readonly Readonly<DMMF.Model>[], type: boolean, comment: boolean) {
  const modelInfos = models.map((model) => {
    return {
      documentation: model.documentation ?? '',
      name: model.name,
      fields: model.fields,
    }
  })

  const modelFields = modelInfos.map((model) => {
    const fields = model.fields.map((field) => ({
      documentation: model.documentation,
      modelName: model.name,
      fieldName: field.name,
      comment: isValibotDocument(field.documentation),
      validation: isValibot(field.documentation),
    }))
    return fields
  })

  const valibots = Object.values(groupByModel(isFields(modelFields))).map((fields) => {
    return {
      generateValibotSchema: schemas(fields, comment),
      generateValibotInfer: type ? inferInput(fields[0].modelName) : '',
    }
  })

  return [
    `import * as v from 'valibot'`,
    '',
    valibots
      .flatMap(({ generateValibotSchema, generateValibotInfer }) =>
        [generateValibotSchema, generateValibotInfer].filter(Boolean),
      )
      .join('\n\n'),
  ].join('\n')
}
