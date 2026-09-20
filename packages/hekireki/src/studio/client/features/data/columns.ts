import * as z from 'zod'

import { loadString, saveString } from '../../lib/index.js'

const HiddenColumnsSchema = z
  .array(z.string().meta({ description: 'A field name the grid is not showing', example: 'bio' }))
  .meta({ description: 'The columns folded away on one model, as stored in localStorage' })

/** Where one model's folded-away columns are remembered; each model keeps its own. */
export function columnsStorageKey(model: string) {
  return `hekireki-studio:columns:${model}`
}

/**
 * What is stored is what is hidden, not what is shown: a field added to the schema afterwards
 * then appears on its own rather than staying invisible until someone goes looking for it.
 */
export function loadHiddenColumns(model: string): ReadonlySet<string> {
  try {
    const raw = loadString(columnsStorageKey(model))
    if (raw === null) return new Set()
    const json: unknown = JSON.parse(raw)
    const result = HiddenColumnsSchema.safeParse(json)
    return new Set(result.success ? result.data : [])
  } catch {
    return new Set()
  }
}

export function saveHiddenColumns(model: string, hidden: ReadonlySet<string>) {
  saveString(columnsStorageKey(model), JSON.stringify([...hidden]))
}
