import type { Parameter } from './analysis.js'
import { defaultParamInput, paramKey } from './params.js'

/** One field per placeholder, labelled by what the analysis learned about it. */
export function ParamsPanel({
  parameters,
  inputs,
  onChange,
}: {
  readonly parameters: readonly Parameter[]
  readonly inputs: Readonly<Record<string, string>>
  readonly onChange: (key: string, value: string) => void
}) {
  if (parameters.length === 0) return null
  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-line bg-surface-2 px-4 py-2">
      <span className="heading mb-1">Parameters</span>
      {parameters.map((parameter) => {
        const key = paramKey(parameter)
        const type =
          parameter.nullable === true && parameter.tsType !== 'unknown'
            ? `${parameter.tsType} | null`
            : parameter.tsType
        return (
          <label
            key={key}
            aria-label={`Parameter ${parameter.placeholder}`}
            className="flex flex-col gap-0.5 text-caption text-muted"
          >
            <span className="flex gap-1.5 font-mono">
              <span className="text-ink">
                {parameter.placeholder === '?' ? `?${parameter.index}` : parameter.placeholder}
              </span>
              <span className={parameter.tsType === 'unknown' ? 'text-faint' : 'text-kind-output'}>
                {type}
              </span>
              <span className="max-w-[200px] truncate" title={parameter.context}>
                {parameter.context}
              </span>
            </span>
            <input
              className="w-40 rounded border border-line-strong bg-surface px-2 py-1 font-mono text-code text-ink outline-none focus:border-accent"
              value={inputs[key] ?? defaultParamInput(parameter)}
              placeholder={parameter.nullable === true ? 'NULL' : ''}
              spellCheck={false}
              onChange={(event) => {
                onChange(key, event.target.value)
              }}
            />
          </label>
        )
      })}
    </div>
  )
}
