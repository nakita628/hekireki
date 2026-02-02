import type { DMMF } from '@prisma/generator-helper'

/**
 * Generate ArkType schema
 * @param modelName - The name of the model
 * @param fields - The fields of the model
 * @returns The generated ArkType schema
 */
export function schema(
  modelName: string,
  fields: string,
): `export const ${string}Schema = type({\n${string}\n})` {
  return `export const ${modelName}Schema = type({\n${fields}\n})`
}

/**
 * Make ArkType relations schema for a model.
 * @param model - The DMMF model
 * @param relProps - The relation properties
 * @param options - Options for the relation generation
 * @returns The generated ArkType relations schema or null if no relations
 */
export function makeArktypeRelations(
  model: DMMF.Model,
  relProps: readonly {
    readonly key: string
    readonly targetModel: string
    readonly isMany: boolean
  }[],
  options?: { readonly includeType?: boolean },
): string | null {
  if (relProps.length === 0) return null
  const base = `...${model.name}Schema.t,`
  const rels = relProps
    .map(
      (r) =>
        `${r.key}:${r.isMany ? `${r.targetModel}Schema.array()` : `${r.targetModel}Schema`},`,
    )
    .join('')

  const fields = `${base}${rels}`

  const typeLine = options?.includeType
    ? `\n\nexport type ${model.name}Relations = typeof ${model.name}RelationsSchema.infer`
    : ''
  return `export const ${model.name}RelationsSchema = type({${fields}})${typeLine}`
}
