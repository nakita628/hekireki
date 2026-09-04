import { javascript } from '@codemirror/lang-javascript'
import { classHighlighter, highlightCode } from '@lezer/highlight'

const parser = javascript({ typescript: true }).language.parser

/** A TypeScript snippet with syntax highlighting, tokenised by the same parser the editor uses. */
export function CodeBlock({ code }: { readonly code: string }) {
  const tokens: { readonly at: number; readonly text: string; readonly className: string }[] = []
  const put = (text: string, className: string) => {
    tokens.push({ at: tokens.reduce((sum, t) => sum + t.text.length, 0), text, className })
  }
  highlightCode(
    code,
    parser.parse(code),
    classHighlighter,
    (text, classes) => {
      put(text, classes)
    },
    () => {
      put('\n', '')
    },
  )
  return (
    <pre className="m-0 overflow-auto rounded-lg border border-line bg-surface-2 px-4 py-3 font-mono text-code leading-relaxed text-ink">
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
