import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { memo } from 'react'

import { MODEL_HANDLE, targetHandle } from '../features/schema/graph.js'
import type { EnumNodeType } from '../features/schema/graph.js'
import { NODE_ROW_HEIGHT } from '../features/schema/layout.js'
import { OpenNodeLink } from './open-node-link.js'

function EnumNodeComponent({ data, selected }: NodeProps<EnumNodeType>) {
  const { value } = data
  return (
    <div
      className={`enum-node w-[280px] overflow-visible rounded-lg border bg-surface font-mono shadow-sm ${
        selected ? 'border-accent ring-[3px] ring-accent-soft' : 'border-line-strong'
      }`}
    >
      <div className="relative flex h-9 items-center gap-2 rounded-t-[7px] bg-node px-2.5 text-node-text">
        <Handle
          type="target"
          position={Position.Left}
          id={targetHandle(MODEL_HANDLE)}
          className="model-handle"
        />
        <span className="mr-auto flex min-w-0 items-center gap-2">
          <span className="text-body font-bold">{value.name}</span>
          {value.dbName ? (
            <span className="truncate text-meta opacity-60">{value.dbName}</span>
          ) : null}
        </span>
        <span className="rounded-full bg-surface/15 px-2 py-px font-sans text-meta">enum</span>
        <OpenNodeLink to="/enums/$name" name={value.name} />
      </div>
      <div className="py-2">
        {value.values.map((member) => (
          <div
            key={member.name}
            className="flex items-center gap-2 px-2.5 text-code"
            style={{ height: NODE_ROW_HEIGHT }}
          >
            <span className="min-w-0 flex-1 truncate text-enum">{member.name}</span>
            {member.dbName ? (
              <span className="shrink-0 text-meta text-faint">{member.dbName}</span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

export const EnumNode = memo(EnumNodeComponent)
