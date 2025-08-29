import type { DMMF } from '@prisma/generator-helper'

const zPrim = (f: DMMF.Field): string => {
  // コメント注釈があれば優先
  const anno = extractAnno(f.documentation ?? '', '@z.')
  if (anno) return wrapCardinality(`z.${anno}`, f)
  // 既定マッピング
  const base =
    f.type === 'String'
      ? f.isId ||
        (typeof f.default === 'object' &&
          f.default &&
          'name' in f.default &&
          f.default.name === 'uuid')
        ? 'z.uuid()'
        : 'z.string()'
      : f.type === 'Int'
        ? 'z.number().int()'
        : f.type === 'BigInt'
          ? 'z.bigint()'
          : f.type === 'DateTime'
            ? 'z.string().datetime()'
            : 'z.unknown()'
  return wrapCardinality(base, f)
}

const wrapCardinality = (expr: string, f: DMMF.Field): string => {
  const arr = f.isList ? `z.array(${expr})` : expr
  return f.isRequired ? arr : `${arr}.optional()`
}

const jsdoc = (doc?: string): string => {
  const lines = (doc ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter((l) => l && !l.startsWith('@z.') && !l.startsWith('@v.'))
  return lines.length ? `/**\n * ${lines.join('\n * ')}\n */\n` : ''
}

export function buildZodModel(model: DMMF.Model): Readonly<string> {
  const fields = model.fields
    .filter((f) => f.kind !== 'object')
    .map((f) => `${jsdoc(f.documentation)}  ${f.name}: ${zPrim(f)},`)
    .join('\n')

  const modelAnno = extractAnno(model.documentation ?? '', '@z.')
  const objectDef =
    modelAnno === 'strictObject'
      ? `z.strictObject({\n${fields}\n})`
      : modelAnno === 'looseObject'
        ? `z.looseObject({\n${fields}\n})`
        : `z.object({\n${fields}\n})`

  return `export const ${model.name}Schema = ${objectDef}\n\nexport type ${model.name} = z.infer<typeof ${model.name}Schema>`
}

export function buildZodRelations(
  model: DMMF.Model,
  relProps: readonly { key: string; targetModel: string; isMany: boolean }[],
): string | null {
  if (relProps.length === 0) return null
  const base = `...${model.name}Schema.shape`
  const rels = relProps
    .map(
      (r) => `${r.key}: ${r.isMany ? `z.array(${r.targetModel}Schema)` : `${r.targetModel}Schema`}`,
    )
    .join(', ')

  // モデルレベルのアノテーションをチェック
  const modelAnno = extractAnno(model.documentation ?? '', '@z.')
  const objectDef =
    modelAnno === 'strictObject'
      ? `z.strictObject({ ${base}, ${rels} })`
      : modelAnno === 'looseObject'
        ? `z.looseObject({ ${base}, ${rels} })`
        : `z.object({ ${base}, ${rels} })`

  return `export const ${model.name}RelationsSchema = ${objectDef}\n\nexport type ${model.name}Relations = z.infer<typeof ${model.name}RelationsSchema>`
}

export const extractAnno = (doc: string, tag: '@z.' | '@v.'): string | null => {
  const line = doc
    .split('\n')
    .map((s) => s.trim())
    .find((l) => l.startsWith(tag))
  return line ? line.slice(tag.length) : null
}

/**
 * Generate Zod schema
 * @param modelName - The name of the model
 * @param fields - The fields of the model
 * @param config - The configuration for the generator
 * @returns The generated Zod schema
 */
export function schema(modelName: string, fields: string) {
  return `export const ${modelName}Schema = z.object({\n${fields}\n})`
}
