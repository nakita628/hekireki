import type { DMMF } from '@prisma/generator-helper'

/**
 * Generate Effect Schema
 * @param modelName - The name of the model
 * @param fields - The fields of the model
 * @returns The generated Effect Schema
 */
export function schema(
  modelName: string,
  fields: string,
): `export const ${string}Schema = Schema.Struct({\n${string}\n})` {
  return `export const ${modelName}Schema = Schema.Struct({\n${fields}\n})`
}

/**
 * Make Effect relations schema for a model.
 * @param model - The DMMF model
 * @param relProps - The relation properties
 * @param options - Options for the relation generation
 * @returns The generated Effect relations schema or null if no relations
 */
export function makeEffectRelations(
  model: DMMF.Model,
  relProps: readonly {
    readonly key: string
    readonly targetModel: string
    readonly isMany: boolean
  }[],
  options?: { readonly includeType?: boolean },
): string | null {
  if (relProps.length === 0) return null
  const base = `...${model.name}Schema.fields,`
  const rels = relProps
    .map(
      (r) =>
        `${r.key}:${r.isMany ? `Schema.Array(${r.targetModel}Schema)` : `${r.targetModel}Schema`},`,
    )
    .join('')

  const fields = `${base}${rels}`

  const typeLine = options?.includeType
    ? `\n\nexport type ${model.name}Relations = Schema.Schema.Type<typeof ${model.name}RelationsSchema>`
    : ''
  return `export const ${model.name}RelationsSchema = Schema.Struct({${fields}})${typeLine}`
}
