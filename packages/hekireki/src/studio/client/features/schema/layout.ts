import { autoLayout } from '../../../../diagram/layout.js'
import type { DiagramSchema, LayoutPositions } from '../../../../diagram/layout.js'

export {
  autoLayout,
  diagramConstraints,
  diagramFields,
  fieldDetail,
  firstLine,
  fieldRowHeight,
  ENUM_WIDTH,
  enumHeight,
  NODE_CONSTRAINT_HEIGHT,
  NODE_DESCRIPTION_HEIGHT,
  NODE_HEADER_HEIGHT,
  NODE_PADDING,
  NODE_ROW_HEIGHT,
  NODE_WIDTH,
  nodeHeight,
} from '../../../../diagram/layout.js'

// Stored positions win; blocks the store does not know are placed by dagre and blocks that
// left the schema are forgotten.
export function positionsFor(schema: DiagramSchema, stored: LayoutPositions): LayoutPositions {
  const names = [...schema.models.map((m) => m.name), ...(schema.enums ?? []).map((e) => e.name)]
  const complete = names.every((name) => stored[name] !== undefined)
  const computed = complete ? {} : autoLayout(schema)
  return Object.fromEntries(
    names.map((name) => [name, stored[name] ?? computed[name] ?? { x: 0, y: 0 }]),
  )
}
