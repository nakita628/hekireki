import { defineConfig } from 'typespeclint'

// typespeclint (https://github.com/nakita628/typespeclint) checks the design of the Studio API
// in main.tsp. tspconfig.yaml enables it, `pnpm lint:tsp` runs it (`pnpm check` with it), and
// the TypeSpec editor extension shows the same findings while main.tsp is edited.
//
// A finding is fixed in main.tsp. Where the API is as it is on purpose, a `#suppress` beside
// the declaration says why. What is set here is only what holds for the API as a whole.
export default defineConfig({
  // Every rule, the opt-in ones too: main.tsp already gives each payload model an @example and
  // answers every error as an RFC 9457 problem.
  extends: ['all'],
  rules: {
    // Studio listens on loopback only and has no authentication (see the doc comment of the
    // HekirekiStudio namespace): there is no security scheme to cover the operations with.
    'operation-secured': 'off',
    // The only consumer is the Studio client, built from the same main.tsp and shipped in the
    // same package: no published version exists for a change to break.
    'breaking-change': 'off',
    // The language-server shapes nest as LSP nests them: CodeActions → CodeAction →
    // LspFileEdit → LspTextEdit → LspRange → LspPosition is six levels.
    'model-structure': { maxDepth: 6 },
  },
})
