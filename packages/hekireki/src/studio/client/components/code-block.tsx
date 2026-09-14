import { javascript } from '@codemirror/lang-javascript'
import { StandardSQL } from '@codemirror/lang-sql'
import { classHighlighter, highlightCode } from '@lezer/highlight'

const PARSERS = {
  typescript: javascript({ typescript: true }).language.parser,
  sql: StandardSQL.language.parser,
}

// Past this, a result is shown as plain text: a span per token of a few thousand rows of JSON
// costs more than the colours are worth.
const HIGHLIGHT_LIMIT = 200_000

/** A TypeScript (or SQL) snippet with syntax highlighting, tokenised by the same parser the editor uses. */
export function CodeBlock({
  code,
  language = 'typescript',
  className = '',
}: {
  readonly code: string
  readonly language?: keyof typeof PARSERS
  readonly className?: string
}) {
  const tokens: { readonly at: number; readonly text: string; readonly className: string }[] = []
  const put = (text: string, classes: string) => {
    const last = tokens.at(-1)
    tokens.push({
      at: last === undefined ? 0 : last.at + last.text.length,
      text,
      className: classes,
    })
  }
  if (code.length > HIGHLIGHT_LIMIT) {
    put(code, '')
  } else {
    highlightCode(
      code,
      PARSERS[language].parse(code),
      classHighlighter,
      (text, classes) => {
        put(text, classes)
      },
      () => {
        put('\n', '')
      },
    )
  }
  return (
    <pre
      className={`m-0 overflow-auto rounded-lg border border-line bg-surface-2 px-4 py-3 font-mono text-code leading-relaxed text-ink ${className}`}
    >
      <code>
        {tokens.map((token) =>
          token.className === '' ? (
            token.text
          ) : (
            <span key={token.at} className={token.className}>
              {token.text}
            </span>
          ),
        )}
      </code>
    </pre>
  )
}
