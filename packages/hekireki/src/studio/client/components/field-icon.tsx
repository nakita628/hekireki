import type { ReactNode } from 'react'
import { LuKey, LuLink } from 'react-icons/lu'

/**
 * The mark a field wears wherever it is listed: a key on the primary key, whether its own `@id`
 * or a column of the model's `@@id`, a link on a foreign key, and `blank` on the rest, so a key is
 * a key on the card, in the table, in the grid and in the palette alike.
 */
export function FieldIcon({
  field,
  primaryKey,
  size,
  className,
  blank = null,
}: {
  readonly field: {
    readonly name: string
    readonly isId: boolean
    readonly isForeignKey: boolean
  }
  readonly primaryKey: ReadonlySet<string>
  readonly size?: number
  readonly className?: string
  /** What stands in the mark's place on a field that wears none. */
  readonly blank?: ReactNode
}) {
  const classes = (color: string) => (className === undefined ? color : `${color} ${className}`)
  const sized = size === undefined ? {} : { size }
  if (field.isId || primaryKey.has(field.name)) {
    return <LuKey {...sized} className={classes('text-key')} />
  }
  if (field.isForeignKey) return <LuLink {...sized} className={classes('text-accent')} />
  return blank
}
