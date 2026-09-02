/** Studio only listens on loopback: the API serves the raw schema and runs SQL without authentication. */
export const STUDIO_HOSTNAME = '127.0.0.1'

export const DEFAULT_PORT = 5858

export const FORBIDDEN_HOST_MESSAGE =
  'Forbidden: Hekireki Studio only answers requests addressed to localhost.'

/** Editors fire several events per save; the schema is re-parsed once, after the burst. */
export const RELOAD_DEBOUNCE_MS = 80

/** How often the schema event stream compares the snapshot timestamp. */
export const SSE_POLL_MS = 300

/** Keep-alive interval of the schema event stream. */
export const SSE_PING_MS = 15_000

/** The URI the Prisma language server sees for the single in-memory schema document. */
export const PRISMA_FILE_URI = 'file:///schema.prisma'
