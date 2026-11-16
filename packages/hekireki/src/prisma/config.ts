export function getString(v: string | string[] | undefined) {
  if (typeof v === 'string') return v
  return Array.isArray(v) ? v[0] : undefined
}

export function getStrings(v: string | string[] | undefined) {
  if (typeof v === 'string') return [v]
  return Array.isArray(v) ? v : undefined
}

export function getBool(v: unknown, fallback = false) {
  return v === true || v === 'true' || (Array.isArray(v) && v[0] === 'true') ? true : fallback
}
