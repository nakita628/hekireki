/** The message to show for a failed request; details stay in the server log. */
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Request failed'
}
