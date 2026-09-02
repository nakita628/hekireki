import { describe, expect, it } from 'vite-plus/test'

import { saveStatus } from './save-status.js'

describe('saveStatus', () => {
  it('labels a save in flight even while the last failure is still shown', () => {
    expect(saveStatus({ pending: true, dirty: true, failed: true, saved: false })).toStrictEqual({
      label: 'Saving…',
      tone: 'danger',
    })
  })

  it('reports a save in flight after a clean save', () => {
    expect(saveStatus({ pending: true, dirty: true, failed: false, saved: true })).toStrictEqual({
      label: 'Saving…',
      tone: 'busy',
    })
  })

  it('reports unsaved changes while the debounce is running', () => {
    expect(saveStatus({ pending: false, dirty: true, failed: false, saved: true })).toStrictEqual({
      label: 'Unsaved changes',
      tone: 'busy',
    })
  })

  it('keeps a failed save visible until the next change', () => {
    expect(saveStatus({ pending: false, dirty: false, failed: true, saved: false })).toStrictEqual({
      label: 'Save failed',
      tone: 'danger',
    })
  })

  it('shows the danger tone even while unsaved changes pile up on a failure', () => {
    expect(saveStatus({ pending: false, dirty: true, failed: true, saved: false })).toStrictEqual({
      label: 'Unsaved changes',
      tone: 'danger',
    })
  })

  it('reports a completed save', () => {
    expect(saveStatus({ pending: false, dirty: false, failed: false, saved: true })).toStrictEqual({
      label: 'Saved',
      tone: 'ok',
    })
  })

  it('reports the on-disk file before the first edit', () => {
    expect(saveStatus({ pending: false, dirty: false, failed: false, saved: false })).toStrictEqual(
      { label: 'Synced with disk', tone: 'ok' },
    )
  })
})
