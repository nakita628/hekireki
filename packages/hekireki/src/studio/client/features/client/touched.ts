/**
 * What the canvas lights up for the models a call touches. The canvas knows tables and columns by
 * their database names (`@@map`, `@map`), as the SQL page lights them; the analysis names models
 * and fields as the call does.
 *
 * @param touched - the models the call reaches, each with the fields it names
 * @param models - the models of the schema
 * @returns the lowercased tables with their lowercased columns, or null to leave every model lit
 */
export function touchedHighlight(
  touched: readonly { readonly model: string; readonly fields: readonly string[] }[],
  models: readonly {
    readonly name: string
    readonly dbName: string | null
    readonly fields: readonly { readonly name: string; readonly dbName?: string | null }[]
  }[],
) {
  const tables = touched.flatMap(({ model, fields }) => {
    const declared = models.find((entry) => entry.name === model)
    if (declared === undefined) return []
    const columns = fields.map((name) =>
      (declared.fields.find((field) => field.name === name)?.dbName ?? name).toLowerCase(),
    )
    return [[(declared.dbName ?? declared.name).toLowerCase(), new Set(columns)] as const]
  })
  return tables.length === 0 ? null : new Map(tables)
}
