import type { DMMF } from '@prisma/generator-helper'

export type RelationProp = Readonly<{
  model: string
  key: string
  targetModel: string
  isMany: boolean
}>

export function collectRelationProps(models: readonly DMMF.Model[]): readonly RelationProp[] {
  return models.flatMap((m) =>
    m.fields
      .filter((f) => f.kind === 'object')
      .map((f) => ({ model: m.name, key: f.name, targetModel: f.type, isMany: f.isList }) as const),
  )
}
