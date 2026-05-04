import { format } from 'oxfmt'

export async function fmt(input: string) {
  const { code, errors } = await format('<stdin>.ts', input, {
    printWidth: 100,
    singleQuote: true,
    semi: false,
  })
  if (errors.length > 0) {
    return {
      ok: false,
      error: errors.map((e) => e.message).join('\n'),
    } as const
  }
  return { ok: true, value: code } as const
}
