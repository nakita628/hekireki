import { describe, expect, it } from 'vite-plus/test'

import { GRID } from '../constants/index.js'
import type { Point } from '../types/index.js'
import { smoothStepPoints } from './route.js'
import { separateRoutes } from './tracks.js'

describe('separateRoutes', () => {
  // Two edges from different models that cross the same gap: the plain route puts both down its
  // middle, one on top of the other from y 100 to 200.
  const upper = smoothStepPoints({ x: 340, y: 50 }, { x: 620, y: 200 })
  const lower = smoothStepPoints({ x: 340, y: 100 }, { x: 620, y: 350 })
  const channel = (points: readonly Point[]) => points[2]?.x

  it('draws two edges that share a channel a track apart', () => {
    const [a = [], b = []] = separateRoutes([upper, lower], [])
    expect(Math.abs((channel(a) ?? 0) - (channel(b) ?? 0))).toBe(GRID / 2)
  })

  it('puts the one that goes further down on the outside, so the two do not cross', () => {
    // On the inside, the edge that goes further down would cross the other on its way in, and
    // the other would cross it on the way out.
    const [a = [], b = []] = separateRoutes([upper, lower], [])
    expect(channel(b)).toBeLessThan(channel(a) ?? 0)
  })

  it('keeps edges that leave from the same point on one wire', () => {
    const fork = smoothStepPoints({ x: 340, y: 50 }, { x: 620, y: 350 })
    expect(separateRoutes([upper, fork], [])).toStrictEqual([upper, fork])
  })

  it('leaves an edge with nothing beside it where it was', () => {
    expect(separateRoutes([upper], [])).toStrictEqual([upper])
  })
})
