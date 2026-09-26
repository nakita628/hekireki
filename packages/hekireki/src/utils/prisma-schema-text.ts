// What the Prisma schema's text says that DMMF drops: the name `@relation(map: ...)` gives a
// foreign key, and the datasource's `relationMode`. Read off the schema as written.

const PRISMA_ESCAPES: { readonly [char: string]: string } = {
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
}

// A Prisma string literal's value: Prisma takes JSON's escapes, and only those.
export function prismaString(literal: string) {
  return literal
    .slice(1, -1)
    .replaceAll(/\\(?:u([\dA-Fa-f]{4})|(.))/gu, (_, hex: string | undefined, char: string) =>
      hex === undefined
        ? (PRISMA_ESCAPES[char] ?? char)
        : String.fromCodePoint(Number.parseInt(hex, 16)),
    )
}

// The blocks of a Prisma schema with their lines, comments cut. The schema is line-based: a block
// opens with `keyword Name {` on a line of its own and closes with `}` on one, and blocks do not
// nest; a field or an attribute, arguments and all, stands on one line.
export function prismaBlocks(source: string) {
  const lines = source
    .split(/\r?\n/u)
    .map((line) => (/^(?:"(?:[^"\\]|\\.)*"|[^"/]|\/(?!\/))*/u.exec(line)?.[0] ?? line).trim())
  return lines.flatMap((line, index) => {
    const opening = /^(\w+)\s+([^\s{]+)\s*\{$/u.exec(line)
    if (!opening) return []
    const end = lines.indexOf('}', index + 1)
    return [
      {
        keyword: opening[1],
        name: opening[2],
        lines: lines.slice(index + 1, end === -1 ? lines.length : end),
      },
    ]
  })
}

export const PRISMA_STRING = String.raw`"(?:[^"\\]|\\.)*"`

/**
 * The name each foreign key is given with `@relation(map: "...")`, by `Model.field`. DMMF drops it,
 * so it is read off the schema's text.
 *
 * @param source - The Prisma schema as written (all of its files, merged).
 * @returns The constraint name of each relation field that names one.
 */
export function relationMaps(source: string) {
  const string = new RegExp(PRISMA_STRING, 'gu')
  return new Map(
    prismaBlocks(source)
      .filter((block) => block.keyword === 'model')
      .flatMap((block) =>
        block.lines.flatMap((line) => {
          // With each string stood in for by where it starts, @relation's arguments hold no
          // parenthesis.
          const strings = new Map([...line.matchAll(string)].map((m) => [String(m.index), m[0]]))
          const bare = line.replaceAll(string, (_, offset: number) => `"${offset}"`)
          const field = /^([^\s@]\S*)\s/u.exec(bare)?.[1]
          const args = /@relation\s*\(([^)]*)\)/u.exec(bare)?.[1]
          const map =
            args === undefined ? undefined : /(?:^|,)\s*map\s*:\s*"(\d+)"/u.exec(args)?.[1]
          return field === undefined || map === undefined
            ? []
            : [{ key: `${block.name}.${field}`, name: prismaString(strings.get(map) ?? '""') }]
        }),
      )
      .map(({ key, name }) => [key, name]),
  )
}

/**
 * The datasource's `relationMode`: with `"prisma"`, Prisma Migrate creates no foreign keys.
 *
 * @param source - The Prisma schema as written (all of its files, merged).
 * @returns The relation mode, `foreignKeys` unless the datasource names another.
 */
export function relationMode(source: string) {
  const setting = prismaBlocks(source)
    .filter((block) => block.keyword === 'datasource')
    .flatMap((block) => block.lines)
    .flatMap((line) => {
      const match = new RegExp(String.raw`^relationMode\s*=\s*(${PRISMA_STRING})$`, 'u').exec(line)
      return match ? [prismaString(match[1])] : []
    })
  return setting[0] ?? 'foreignKeys'
}
