export function fieldTypeLabel(field: {
  readonly type: string
  readonly isList: boolean
  readonly isRequired: boolean
}) {
  return `${field.type}${field.isList ? '[]' : ''}${field.isRequired || field.isList ? '' : '?'}`
}

/** The chip a mark on a card sits in: `UK` beside a column, `UNIQUE` beside a block attribute. */
export const BADGE = 'rounded-[3px] px-1 py-px font-sans text-badge font-semibold uppercase'

export const UNIQUE_BADGE = 'bg-unique/15 text-unique'

// What a `@@` block attribute is called on a card, and the colour it is tinted with; the export
// draws the same chips (diagram/svg.ts).
export const CONSTRAINT_STYLES = {
  id: {
    label: 'key',
    legend: 'composite primary key',
    className: 'bg-key/15 text-key',
  },
  unique: { label: 'unique', legend: 'unique together', className: UNIQUE_BADGE },
  normal: { label: 'index', legend: 'index', className: 'bg-muted/15 text-muted' },
  fulltext: { label: 'fulltext', legend: 'full-text index', className: 'bg-muted/15 text-muted' },
} as const
