export function saveStatus(state: {
  readonly pending: boolean
  readonly dirty: boolean
  readonly failed: boolean
  readonly saved: boolean
}) {
  return { label: labelOf(state), tone: toneOf(state) } as const
}

type SaveState = Parameters<typeof saveStatus>[0]

function labelOf(state: SaveState) {
  if (state.pending) return 'Saving…'
  if (state.dirty) return 'Unsaved changes'
  if (state.failed) return 'Save failed'
  if (state.saved) return 'Saved'
  return 'Synced with disk'
}

function toneOf(state: SaveState) {
  if (state.failed) return 'danger'
  return state.dirty || state.pending ? 'busy' : 'ok'
}
