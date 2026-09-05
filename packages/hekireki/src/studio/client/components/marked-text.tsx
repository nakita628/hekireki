import { matchRuns } from '../features/data/cells.js'

/**
 * The text with what the search matched picked out. A row is twenty columns wide and the word
 * that put it on screen is in one of them; marking it is the difference between reading the row
 * and scanning it.
 */
export function MarkedText({ text, query }: { readonly text: string; readonly query: string }) {
  if (query.trim() === '') return text
  return matchRuns(text, query).map((run) =>
    run.matched ? (
      <mark key={run.start} className="rounded-[3px] bg-accent-soft px-px text-accent-text">
        {run.text}
      </mark>
    ) : (
      <span key={run.start}>{run.text}</span>
    ),
  )
}
