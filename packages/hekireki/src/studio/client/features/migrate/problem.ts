function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Why a request failed, as the server said it. A request the API refuses throws an error whose
 * own message is the status line and nothing else (`503 Service Unavailable`); what happened is in
 * the problem+json body under it: the `errors` of a validation problem when it has them (the
 * decision that names a field the schema does not have), else its `detail` (the database's own
 * words when the schema engine or a statement failed). A request that never reached the server
 * says so in its own message.
 *
 * @param error - what the request threw
 * @returns the reason to show, or null when there is none to give
 */
export function problemReason(error: unknown) {
  const carried = isRecord(error) && isRecord(error.detail) ? error.detail.data : undefined
  if (isRecord(carried)) {
    const errors = Array.isArray(carried.errors)
      ? carried.errors.flatMap((entry) =>
          isRecord(entry) && typeof entry.message === 'string' ? [entry.message] : [],
        )
      : []
    if (errors.length > 0) return errors.join('\n')
    if (typeof carried.detail === 'string') return carried.detail
  }
  return error instanceof Error && error.message !== '' ? error.message : null
}
