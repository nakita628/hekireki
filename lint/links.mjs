#!/usr/bin/env node
// Checks that every link from the repository's Markdown to a file of the repository points at one
// that is there: a relative link (`[CONTRIBUTING](CONTRIBUTING.md)`) and a link to this repository
// on GitHub (`https://github.com/nakita628/hekireki/blob/main/packages/hekireki/README.md`). A file
// removed or moved leaves such links behind, and nothing else notices: GitHub renders them, and
// they only fail for the reader who follows one. Anchors and query strings are not checked.
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync } from 'node:fs'
import path from 'node:path'

const REPOSITORY = 'https://github.com/nakita628/hekireki/'
const GITHUB_PATH = /^(?:blob|tree)\/main\/([^#?)\s]+)/u
// `[text](target)` and `[text](target "title")`, and `<https://...>` or bare URLs of this repository.
const INLINE_LINK = /\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/gu
const BARE_URL = new RegExp(
  `${REPOSITORY.replaceAll(/[.*+?^${}()|[\]\\/]/gu, '\\$&')}[^\\s)>\`'"\\]]+`,
  'gu',
)
const FENCE = /^\s*(```|~~~)/u

// Markdown files git knows, so node_modules, build output and anything ignored stay out; a
// symlink (the root README.md) is read where it points.
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '*.md'],
  {
    encoding: 'utf8',
  },
)
  .split('\n')
  .filter((file) => file !== '' && existsSync(file) && !lstatSync(file).isSymbolicLink())

// The lines outside fenced code blocks: a link shown as code is an example, not a link.
function proseLines(text) {
  const lines = text.split('\n')
  const fenced = lines.reduce(
    (state, line) => {
      const toggles = FENCE.test(line)
      const inside = toggles ? !state.inside : state.inside
      return { inside, keep: [...state.keep, !state.inside && !toggles] }
    },
    { inside: false, keep: [] },
  )
  return lines.map((line, index) => ({ line, number: index + 1 })).filter((_, i) => fenced.keep[i])
}

// The repository path a link names, or null for a link that leaves the repository or stays in
// the page.
function targetOf(file, link) {
  if (link.startsWith(REPOSITORY)) {
    const match = GITHUB_PATH.exec(link.slice(REPOSITORY.length))
    return match ? decodeURIComponent(match[1]).replace(/\/$/u, '') : null
  }
  if (/^[a-z][a-z0-9+.-]*:/iu.test(link) || link.startsWith('#') || link.startsWith('//'))
    return null
  const bare = link.replace(/[#?].*$/u, '')
  if (bare === '') return null
  return path.normalize(path.join(path.dirname(file), decodeURIComponent(bare)))
}

const broken = files.flatMap((file) =>
  proseLines(readFileSync(file, 'utf8')).flatMap(({ line, number }) => {
    // Inline code is shown, not followed.
    const text = line.replaceAll(/`[^`]*`/gu, '')
    const links = [
      ...[...text.matchAll(INLINE_LINK)].map((match) => match[1]),
      ...[...text.matchAll(BARE_URL)].map((match) => match[0]),
    ]
    return [...new Set(links)].flatMap((link) => {
      const target = targetOf(file, link)
      return target === null || existsSync(target) ? [] : [`${file}:${number}: ${link}`]
    })
  }),
)

if (broken.length > 0) {
  for (const entry of broken) console.error(entry)
  console.error(`links: ${broken.length} link(s) to a file of the repository that is not there`)
  process.exit(1)
}
console.log(`links: every repository link in ${files.length} Markdown files resolves`)
