import type { Model } from '../../mermaid-er/types.js'
import { isValibot } from '../validator/is-valibot.js'
import { schemas } from './schemas.js'
import { groupByModel } from '../../../shared/helper/group-by-model.js'
import { isFields } from '../../../shared/validator/is-fields.js'
import { inferInput } from './infer-input.js'
import { isValibotDocument } from '../validator/is-valibot-document.js'

const VALIBOT_IMPORT = `import * as v from 'valibot'\n` as const

/**
 * Generate Valibot schemas and types
 * @param models - The models to generate the Valibot schemas and types for
 * @param type - Whether to generate types
 * @param comment - Whether to include comments in the generated code
 * @returns The generated Valibot schemas and types
 */
export function valibot(models: readonly Model[], type: boolean, comment: boolean) {
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

  // null exclude
  const validFields = isFields(modelFields)
  // group by model
  const groupedByModel = groupByModel(validFields)

  const valibots = Object.values(groupedByModel).map((fields) => {
    return {
      generateValibotSchema: schemas(fields, comment),
      generateValibotInfer: type ? inferInput(fields[0].modelName) : '',
    }
  })

  return [
    VALIBOT_IMPORT,
    '',
    valibots
      .flatMap(({ generateValibotSchema, generateValibotInfer }) =>
        [generateValibotSchema, generateValibotInfer].filter(Boolean),
      )
      .join('\n\n'),
  ].join('\n')
}
