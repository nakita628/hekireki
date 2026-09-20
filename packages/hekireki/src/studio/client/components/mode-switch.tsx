/** Two or more ways to show the same thing, as pills: the one in use is marked. */
export function ModeSwitch<Mode extends string>({
  modes,
  selected,
  onSelect,
}: {
  readonly modes: readonly Mode[]
  readonly selected: Mode
  readonly onSelect: (mode: Mode) => void
}) {
  return (
    <div className="flex items-center gap-1">
      {modes.map((mode) => (
        <button
          key={mode}
          type="button"
          aria-pressed={mode === selected}
          className={`pill ${mode === selected ? 'border-accent bg-accent-soft text-accent-text' : 'border-line bg-canvas text-muted hover:border-accent'}`}
          onClick={() => {
            onSelect(mode)
          }}
        >
          {mode}
        </button>
      ))}
    </div>
  )
}
