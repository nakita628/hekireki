import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { layoutStorageKey, loadLayout, saveLayout } from './storage.js'

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

describe('layoutStorageKey', () => {
  it('namespaces the key by schema path', () => {
    expect(layoutStorageKey('prisma/schema.prisma')).toBe(
      'hekireki-studio:layout:prisma/schema.prisma',
    )
  })
})

describe('saveLayout and loadLayout', () => {
  it('round-trips positions', () => {
    stubStorage(new Map())
    saveLayout('k', { User: { x: 1, y: 2 }, Post: { x: 3, y: 4 } })
    expect(loadLayout('k')).toStrictEqual({ User: { x: 1, y: 2 }, Post: { x: 3, y: 4 } })
  })

  it('returns an empty layout when nothing is stored', () => {
    stubStorage(new Map())
    expect(loadLayout('k')).toStrictEqual({})
  })

  it('returns an empty layout for malformed JSON', () => {
    stubStorage(new Map([['k', '{not json']]))
    expect(loadLayout('k')).toStrictEqual({})
  })

  it('returns an empty layout for a JSON root that is not an object', () => {
    stubStorage(new Map([['k', '42']]))
    expect(loadLayout('k')).toStrictEqual({})
    stubStorage(new Map([['k', '"User"']]))
    expect(loadLayout('k')).toStrictEqual({})
    stubStorage(new Map([['k', 'null']]))
    expect(loadLayout('k')).toStrictEqual({})
  })

  it('ignores an array root instead of reading its indexes as model names', () => {
    stubStorage(new Map([['k', '[{"x":1,"y":2}]']]))
    expect(loadLayout('k')).toStrictEqual({})
  })

  it('drops entries whose shape is not a position', () => {
    stubStorage(
      new Map([['k', JSON.stringify({ A: { x: 1 }, B: { x: 1, y: 'two' }, C: { x: 5, y: 6 } })]]),
    )
    expect(loadLayout('k')).toStrictEqual({ C: { x: 5, y: 6 } })
  })

  it('returns an empty layout when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(loadLayout('k')).toStrictEqual({})
    expect(() => {
      saveLayout('k', { A: { x: 0, y: 0 } })
    }).not.toThrow()
  })
})
