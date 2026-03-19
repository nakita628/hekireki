import { format } from 'oxfmt'

export async function fmt(input: string): Promise<string> {
  const { code, errors } = await format('<stdin>.ts', input, {
    printWidth: 100,
    singleQuote: true,
    semi: false,
  })
  if (errors.length > 0) {
    throw new Error(errors.map((e) => e.message).join('\n'))
  }
  return code
}
