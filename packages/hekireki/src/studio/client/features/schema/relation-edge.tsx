import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react'
import type { EdgeProps } from '@xyflow/react'

import { useEdgeGeometry } from './geometry.js'
import type { RelationEdgeType } from './graph.js'

// The same corner radius the exported SVG bends by, for the fallback path React Flow draws until
// the models have been measured.
const BORDER_RADIUS = 5

/**
 * An edge routed by the shared diagram geometry, so the canvas and the exported drawing draw the
 * same wire — a self relation included, which loops clear of the model instead of folding into it.
 * Its caption goes in React Flow's label layer, which sits over the models, and is placed by the
 * pass in `geometry.ts`: beside the wire and off the cards rather than on top of either.
 */
export function RelationEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerStart,
  markerEnd,
  data,
}: EdgeProps<RelationEdgeType>) {
  const geometry = useEdgeGeometry(id)
  const [fallback, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: BORDER_RADIUS,
  })
  const [what, rules] = data?.caption ?? []
  const caption = geometry?.caption ?? { x: labelX, y: labelY }
  return (
    <>
      <BaseEdge
        id={id}
        path={geometry?.path ?? fallback}
        markerStart={markerStart}
        markerEnd={markerEnd}
      />
      {what === undefined ? null : (
        <EdgeLabelRenderer>
          <div
            className={`relation-label nodrag nopan${data?.dimmed === true ? ' is-dimmed' : ''}`}
            style={{ transform: `translate(-50%, -50%) translate(${caption.x}px, ${caption.y}px)` }}
          >
            <div>{what}</div>
            {rules === undefined ? null : <div className="text-faint">{rules}</div>}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
