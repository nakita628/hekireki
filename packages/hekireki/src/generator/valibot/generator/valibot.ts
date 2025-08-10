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
    const modelName = fields[0].modelName
    const hasRelations = models.some((model) => 
      model.fields.some((field) => 
        field.kind === 'object' && 
        (field.type === modelName || field.relationToFields?.includes('id'))
      )
    )
    const schema = schemas(fields, comment)
    const inferred = type ? inferInput(modelName) : ''
    
    // Only generate relations schema if the model has relations
    if (hasRelations) {
      const relatedModels = models.map((model) => ({
        name: model.name,
        fields: model.fields.filter((f) => f.kind === 'object' && f.type === modelName)
      })).filter((m) => m.fields.length > 0)

      const relationsSchema = `export const ${modelName}RelationsSchema = v.object({ 
  ...${modelName}Schema.entries,
  ${relatedModels.map((rm) => 
    rm.fields.map((f) => `${f.name}: ${f.isList ? 'v.array(' : ''}${f.type}Schema${f.isList ? ')' : ''}`).join(',\n  ')
  ).join(',\n  ')}
})`
      
      const relationsType = type ? `\n\nexport type ${modelName}Relations = v.InferInput<typeof ${modelName}RelationsSchema>` : ''
      
      return {
        generateValibotSchema: schema + '\n\n' + relationsSchema,
        generateValibotInfer: inferred + relationsType
      }
    }
    
    return {
      generateValibotSchema: schema,
      generateValibotInfer: inferred
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
