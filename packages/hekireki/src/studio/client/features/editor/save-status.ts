export function saveStatus(state: {
  readonly pending: boolean
  readonly dirty: boolean
  readonly failed: boolean
  readonly saved: boolean
}) {
  const label = state.pending
    ? 'Saving…'
    : state.dirty
      ? 'Unsaved changes'
      : state.failed
        ? 'Save failed'
        : state.saved
          ? 'Saved'
          : 'Synced with disk'
  const tone = state.failed ? 'danger' : state.dirty || state.pending ? 'busy' : 'ok'
  return { label, tone } as const
}
