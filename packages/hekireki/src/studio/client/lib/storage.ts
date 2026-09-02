import * as v from 'valibot'

export type Position = { readonly x: number; readonly y: number }

export type LayoutPositions = Readonly<Record<string, Position>>

const PositionSchema = v.pipe(
  v.object({
    x: v.pipe(v.number(), v.description('Left edge in canvas pixels')),
    y: v.pipe(v.number(), v.description('Top edge in canvas pixels')),
  }),
  v.description('A remembered node position'),
)

// `record` would read an array's indexes as model names, so arrays are rejected up front.
const StoredLayoutSchema = v.pipe(
  v.unknown(),
  v.check((value) => !Array.isArray(value)),
  v.record(v.string(), v.unknown()),
  v.description('The per-schema layout map as stored in localStorage'),
)

export function layoutStorageKey(schemaPath: string) {
  return `hekireki-studio:layout:${schemaPath}`
}

export function loadLayout(key: string): LayoutPositions {
  try {
    const raw = globalThis.localStorage.getItem(key)
    if (raw === null) return {}
    const parsed: unknown = JSON.parse(raw)
    const stored = v.safeParse(StoredLayoutSchema, parsed)
    if (!stored.success) return {}
    return Object.fromEntries(
      Object.entries(stored.output).flatMap(([name, position]) => {
        const checked = v.safeParse(PositionSchema, position)
        return checked.success ? [[name, checked.output]] : []
      }),
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
