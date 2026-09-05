import { Button, Dropdown } from '@heroui/react'
import type { Selection } from 'react-aria-components'
import { LuColumns3 } from 'react-icons/lu'

/**
 * Which columns the grid draws. It is the one control behind every other flexible copy: what is
 * on screen is what Copy and Export take, so narrowing a forty-column table to the three that
 * matter is also how those three alone reach the clipboard.
 */
export function ColumnsPicker({
  columns,
  hidden,
  onHiddenChange,
}: {
  readonly columns: readonly string[]
  readonly hidden: ReadonlySet<string>
  readonly onHiddenChange: (hidden: ReadonlySet<string>) => void
}) {
  const shown = columns.filter((column) => !hidden.has(column))
  return (
    <Dropdown>
      <Button variant="outline">
        <LuColumns3 size={15} />
        Columns
        {hidden.size === 0 ? null : (
          <span className="text-faint">
            {shown.length}/{columns.length}
          </span>
        )}
      </Button>
      <Dropdown.Popover placement="bottom start">
        <Dropdown.Menu
          aria-label="Columns to show"
          className="max-h-[60vh] overflow-y-auto"
          selectionMode="multiple"
          selectedKeys={new Set(shown)}
          onSelectionChange={(keys: Selection) => {
            // Every column off would leave a table of nothing to look at, and no way back to it.
            if (keys !== 'all' && keys.size === 0) return
            onHiddenChange(
              keys === 'all' ? new Set() : new Set(columns.filter((column) => !keys.has(column))),
            )
          }}
        >
          {columns.map((column) => (
            <Dropdown.Item key={column} id={column} textValue={column}>
              <Dropdown.ItemIndicator />
              <span className="font-mono">{column}</span>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  )
}
