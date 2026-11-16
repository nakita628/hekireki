export function isLoopbackHostname(hostname: string) {
  const bare = hostname.replace(/^\[(.*)\]$/u, '$1').toLowerCase()
  return (
    bare === 'localhost' || bare.endsWith('.localhost') || bare === '127.0.0.1' || bare === '::1'
  )
}
