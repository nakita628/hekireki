import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { columnsStorageKey, loadHiddenColumns, saveHiddenColumns } from './columns.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubStorage(store: Map<string, string>) {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
  })
  return store
}

describe('columnsStorageKey', () => {
  it('keeps one key per model', () => {
    expect(columnsStorageKey('User')).toBe('hekireki-studio:columns:User')
    expect(columnsStorageKey('User')).not.toBe(columnsStorageKey('Post'))
  })
})

describe('saveHiddenColumns and loadHiddenColumns', () => {
  it('round-trips the hidden set', () => {
    stubStorage(new Map())
    saveHiddenColumns('User', new Set(['email', 'createdAt']))
    expect(loadHiddenColumns('User')).toStrictEqual(new Set(['email', 'createdAt']))
    expect(loadHiddenColumns('Post')).toStrictEqual(new Set())
  })

  it('stores what is hidden, so an unknown field shows up on its own', () => {
    const store = stubStorage(new Map())
    saveHiddenColumns('User', new Set(['email']))
    expect(JSON.parse(store.get(columnsStorageKey('User')) ?? '')).toStrictEqual(['email'])
  })

  it('hides nothing when nothing is stored', () => {
    stubStorage(new Map())
    expect(loadHiddenColumns('User')).toStrictEqual(new Set())
  })

  it('hides nothing for malformed JSON or the wrong shape', () => {
    stubStorage(
      new Map([
        [columnsStorageKey('Broken'), '[not json'],
        [columnsStorageKey('Object'), '{"email":true}'],
        [columnsStorageKey('Mixed'), '["email", 1]'],
      ]),
    )
    expect(loadHiddenColumns('Broken')).toStrictEqual(new Set())
    expect(loadHiddenColumns('Object')).toStrictEqual(new Set())
    expect(loadHiddenColumns('Mixed')).toStrictEqual(new Set())
  })

  it('hides nothing when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(loadHiddenColumns('User')).toStrictEqual(new Set())
  })
})
