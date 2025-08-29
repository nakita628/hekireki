import type { DMMF } from '@prisma/generator-helper'

const vPrim = (f: DMMF.Field): string => {
  const anno = extractAnno(f.documentation ?? '', '@v.')
  if (anno) return wrapV(`v.${anno}`, f)
  const base =
    f.type === 'String'
      ? 'v.string()'
      : f.type === 'Int'
        ? 'v.pipe(v.number(), v.integer())'
        : f.type === 'BigInt'
          ? 'v.bigint()'
          : f.type === 'DateTime'
            ? 'v.pipe(v.string(), v.isoTimestamp())'
            : 'v.unknown()'
  return wrapV(base, f)
}

const wrapV = (expr: string, f: DMMF.Field): string => {
  const card = f.isList ? `v.array(${expr})` : expr
  return f.isRequired ? card : `v.optional(${card})`
}

const jsdoc = (doc?: string): string => {
  const lines = (doc ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter((l) => l && !l.startsWith('@z.') && !l.startsWith('@v.'))
  return lines.length ? `/**\n * ${lines.join('\n * ')}\n */\n` : ''
}

export function buildValibotModel(model: DMMF.Model): string {
  const fields = model.fields
    .filter((f) => f.kind !== 'object')
    .map((f) => `${jsdoc(f.documentation)}  ${f.name}: ${vPrim(f)},`)
    .join('\n')

  const modelAnno = extractAnno(model.documentation ?? '', '@v.')
  const objectDef =
    modelAnno === 'strictObject'
      ? `v.strictObject({\n${fields}\n})`
      : modelAnno === 'looseObject'
        ? `v.looseObject({\n${fields}\n})`
        : `v.object({\n${fields}\n})`

  return `export const ${model.name}Schema = ${objectDef}\n\nexport type ${model.name} = v.InferInput<typeof ${model.name}Schema>`
}

export function buildValibotRelations(
  model: DMMF.Model,
  relProps: readonly { key: string; targetModel: string; isMany: boolean }[],
): string | null {
  if (relProps.length === 0) return null
  const base = `...${model.name}Schema.entries`
  const rels = relProps
    .map(
      (r) => `${r.key}: ${r.isMany ? `v.array(${r.targetModel}Schema)` : `${r.targetModel}Schema`}`,
    )
    .join(', ')

  const modelAnno = extractAnno(model.documentation ?? '', '@v.')
  const objectDef =
    modelAnno === 'strictObject'
      ? `v.strictObject({ ${base}, ${rels} })`
      : modelAnno === 'looseObject'
        ? `v.looseObject({ ${base}, ${rels} })`
        : `v.object({ ${base}, ${rels} })`

  return `export const ${model.name}RelationsSchema = ${objectDef}\n\nexport type ${model.name}Relations = v.InferInput<typeof ${model.name}RelationsSchema>`
}

export const extractAnno = (doc: string, tag: '@z.' | '@v.'): string | null => {
  const line = doc
    .split('\n')
    .map((s) => s.trim())
    .find((l) => l.startsWith(tag))
  return line ? line.slice(tag.length) : null
}

/**
 * Generate Valibot schema
 * @param modelName - The name of the model
 * @param fields - The fields of the model
 * @returns The generated Valibot schema
 */
export function schema(modelName: string, fields: string) {
  return `export const ${modelName}Schema = v.object({\n${fields}\n})`
}
