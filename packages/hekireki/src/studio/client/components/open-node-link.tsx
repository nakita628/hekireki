import { Link } from '@tanstack/react-router'

import { ArrowRightIcon } from './icons.js'

/**
 * The way into a node's page: one click, on something you can see. The diagram used to open a node
 * on a double click instead, a gesture with nothing on screen to announce it — nobody could tell a
 * missing feature from a missed double click. `nodrag`/`nopan` keep React Flow from reading the
 * press as the start of a drag, so the click reaches the link.
 */
export function OpenNodeLink({
  to,
  name,
}: {
  readonly to: '/models/$name' | '/enums/$name'
  readonly name: string
}) {
  return (
    <Link
      to={to}
      params={{ name }}
      title={`Open ${name}`}
      aria-label={`Open ${name}`}
      className="nodrag nopan flex size-5 shrink-0 items-center justify-center rounded-full bg-surface/15 hover:bg-surface/35"
      onClick={(event) => {
        event.stopPropagation()
      }}
    >
      <ArrowRightIcon size={11} />
    </Link>
  )
}
