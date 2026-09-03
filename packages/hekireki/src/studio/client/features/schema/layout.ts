import { autoLayout } from '../../../../diagram/layout.js'
import type { LayoutPositions } from '../../../../diagram/layout.js'
import type { Schema } from '../../../server/routes/index.js'

export {
  autoLayout,
  diagramFields,
  fieldRowHeight,
  hasDescription,
  NODE_DESCRIPTION_HEIGHT,
  NODE_HEADER_HEIGHT,
  NODE_PADDING,
  NODE_ROW_HEIGHT,
  NODE_WIDTH,
  nodeHeight,
} from '../../../../diagram/layout.js'

// Stored positions win; models the store does not know are placed by dagre and models that
// left the schema are forgotten.
export function positionsFor(schema: Schema, stored: LayoutPositions): LayoutPositions {
  const complete = schema.models.every((m) => stored[m.name] !== undefined)
  const computed = complete ? {} : autoLayout(schema.models, schema.relations)
  return Object.fromEntries(
    schema.models.map((m) => [m.name, stored[m.name] ?? computed[m.name] ?? { x: 0, y: 0 }]),
  )
}
