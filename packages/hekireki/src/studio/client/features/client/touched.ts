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
  const byName = new Map(models.map((entry) => [entry.name, entry]))
  const tables = touched.flatMap(({ model, fields }) => {
    const declared = byName.get(model)
    if (declared === undefined) return []
    const fieldsByName = new Map(declared.fields.map((field) => [field.name, field]))
    const columns = fields.map((name) => (fieldsByName.get(name)?.dbName ?? name).toLowerCase())
    return [[(declared.dbName ?? declared.name).toLowerCase(), new Set(columns)] as const]
  })
  return tables.length === 0 ? null : new Map(tables)
}
