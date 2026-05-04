export function collectRelationProps(
  models: readonly {
    readonly name: string
    readonly fields: readonly {
      readonly name: string
      readonly type: string
      readonly kind: string
      readonly isList: boolean
    }[]
  }[],
): readonly { model: string; key: string; targetModel: string; isMany: boolean }[] {
  return models.flatMap((m) =>
    m.fields
      .filter((f) => f.kind === 'object')
      .map((f) => ({ model: m.name, key: f.name, targetModel: f.type, isMany: f.isList })),
  )
}

export function makeRelationsOnly(
  dmmf: {
    readonly datamodel: {
      readonly models: readonly {
        readonly name: string
        readonly documentation?: string
        readonly fields: readonly {
          readonly name: string
          readonly type: string
          readonly kind: string
          readonly documentation?: string
          readonly isRequired: boolean
          readonly isList: boolean
        }[]
      }[]
    }
  },
  includeType: boolean,
  makeRelations: (
    model: {
      readonly name: string
      readonly documentation?: string
      readonly fields: readonly {
        readonly name: string
        readonly type: string
        readonly kind: string
        readonly documentation?: string
        readonly isRequired: boolean
        readonly isList: boolean
      }[]
    },
    relProps: readonly {
      readonly key: string
      readonly targetModel: string
      readonly isMany: boolean
    }[],
    options: { readonly includeType: boolean },
  ) => string | null,
) {
  const models = dmmf.datamodel.models
  const relIndex = collectRelationProps(models)
  const relByModel = Object.groupBy(relIndex, (r) => r.model)
  return models
    .map((model) =>
      makeRelations(
        model,
        (relByModel[model.name] ?? []).map(({ key, targetModel, isMany }) => ({
          key,
          targetModel,
          isMany,
        })),
        { includeType },
      ),
    )
    .filter((code) => Boolean(code))
    .join('\n\n')
}
