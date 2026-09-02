import * as z from 'zod'

const StripSnippetInput = z
  .object({
    text: z
      .string()
      .meta({ description: 'The snippet text with tab stops.', example: 'provider = $0' }),
  })
  .readonly()
  .meta({ description: 'An LSP snippet', example: { text: 'provider = $0' } })

/** Snippet placeholders like `${1:name}` or `$0` become their default text. */
export function makeSnippetText(input: z.infer<typeof StripSnippetInput>) {
  return input.text.replaceAll(/\$\{\d+:([^}]*)\}/gu, '$1').replaceAll(/\$\d+/gu, '')
}
