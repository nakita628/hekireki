import * as z from 'zod'

import type { LayoutPositions } from '../../../diagram/layout.js'

const PositionSchema = z
  .object({
    x: z.number().meta({ description: 'Left edge in canvas pixels', example: 120 }),
    y: z.number().meta({ description: 'Top edge in canvas pixels', example: 48 }),
  })
  .meta({ description: 'A remembered node position' })

// One position that does not read is left out rather than taking the whole layout with it: what
// is not a position reads as null, and the entries that are null are dropped below.
const StoredLayoutSchema = z
  .record(z.string(), z.union([PositionSchema, z.unknown().transform(() => null)]))
  .meta({ description: 'The per-schema layout map as stored in localStorage' })

export function layoutStorageKey(schemaPath: string) {
  return `hekireki-studio:layout:${schemaPath}`
}

export function loadLayout(key: string): LayoutPositions {
  try {
    const raw = globalThis.localStorage.getItem(key)
    if (raw === null) return {}
    const json: unknown = JSON.parse(raw)
    const result = StoredLayoutSchema.safeParse(json)
    if (!result.success) return {}
    return Object.fromEntries(
      Object.entries(result.data).flatMap(([name, position]) =>
        position === null ? [] : [[name, { x: position.x, y: position.y }]],
      ),
    )
  } catch {
    return {}
  }
}

export function saveLayout(key: string, positions: LayoutPositions) {
  try {
    globalThis.localStorage.setItem(key, JSON.stringify(positions))
  } catch {
    // Storage can be unavailable (private mode, quota); the layout is a convenience only.
  }
}

export function loadString(key: string) {
  try {
    return globalThis.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function saveString(key: string, value: string) {
  try {
    globalThis.localStorage.setItem(key, value)
  } catch {
    // Storage can be unavailable (private mode, quota); the value is a convenience only.
  }
}
