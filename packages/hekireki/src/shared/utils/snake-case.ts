export function snakeCase(name: string): string {
  return `${name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()}`
}
