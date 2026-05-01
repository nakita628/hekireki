import { describe, expect, it } from 'vite-plus/test'

import { DOCS_HELP_TEXT, HELP_TEXT, handleDocs, hekireki, parsePort } from './index.js'

// =============================================================================
// HELP_TEXT / DOCS_HELP_TEXT
// =============================================================================

describe('HELP_TEXT', () => {
  it('contains usage, commands, options, examples sections', () => {
    expect(HELP_TEXT).toBe(`⚡️ hekireki - Prisma schema tools

Usage:
  hekireki <command> [options]

Commands:
  docs serve    Start a local server to view the documentation

Options:
  -p, --port <port>    Specify the port (default: 5858)
  -h, --help           Show help

Examples:
  hekireki docs serve
  hekireki docs serve -p 3000`)
  })
})

describe('DOCS_HELP_TEXT', () => {
  it('contains docs-specific usage, commands, options, examples', () => {
    expect(DOCS_HELP_TEXT).toBe(`⚡️ hekireki docs - Documentation tools

Usage:
  hekireki docs serve [options]

Commands:
  serve    Start a local server to view the documentation

Options:
  -p, --port <port>    Specify the port (default: 5858)
  -h, --help           Show help

Examples:
  hekireki docs serve
  hekireki docs serve -p 3000`)
  })
})

// =============================================================================
// parsePort
// =============================================================================

describe('parsePort', () => {
  it('returns default 5858 when no port flag', () => {
    expect(parsePort([])).toStrictEqual({ ok: true, value: 5858 })
  })

  it('parses -p flag', () => {
    expect(parsePort(['-p', '3000'])).toStrictEqual({ ok: true, value: 3000 })
  })

  it('parses --port flag', () => {
    expect(parsePort(['--port', '4000'])).toStrictEqual({ ok: true, value: 4000 })
  })

  it('returns default when unrelated args only', () => {
    expect(parsePort(['--verbose', 'true'])).toStrictEqual({ ok: true, value: 5858 })
  })

  it('parses port with other args before', () => {
    expect(parsePort(['--verbose', '-p', '8080'])).toStrictEqual({ ok: true, value: 8080 })
  })

  it('parses port with other args after', () => {
    expect(parsePort(['-p', '9090', '--verbose'])).toStrictEqual({ ok: true, value: 9090 })
  })

  it('returns error when -p has no value', () => {
    expect(parsePort(['-p'])).toStrictEqual({
      ok: false,
      error: '❌ Error: --port requires a number',
    })
  })

  it('returns error when --port has no value', () => {
    expect(parsePort(['--port'])).toStrictEqual({
      ok: false,
      error: '❌ Error: --port requires a number',
    })
  })

  it('returns error when -p followed by another flag', () => {
    expect(parsePort(['-p', '--verbose'])).toStrictEqual({
      ok: false,
      error: '❌ Error: --port requires a number',
    })
  })

  it('returns error when port is not a number', () => {
    expect(parsePort(['-p', 'abc'])).toStrictEqual({
      ok: false,
      error: '❌ Error: Invalid port number: abc',
    })
  })

  it('returns error when --port value is not a number', () => {
    expect(parsePort(['--port', 'xyz'])).toStrictEqual({
      ok: false,
      error: '❌ Error: Invalid port number: xyz',
    })
  })
})

// =============================================================================
// handleDocs
// =============================================================================

describe('handleDocs', () => {
  it('returns DOCS_HELP_TEXT when no subcommand', () => {
    expect(handleDocs([])).toStrictEqual({ ok: true, value: DOCS_HELP_TEXT })
  })

  it('returns DOCS_HELP_TEXT for -h flag', () => {
    expect(handleDocs(['-h'])).toStrictEqual({ ok: true, value: DOCS_HELP_TEXT })
  })

  it('returns DOCS_HELP_TEXT for --help flag', () => {
    expect(handleDocs(['--help'])).toStrictEqual({ ok: true, value: DOCS_HELP_TEXT })
  })

  it('returns error for unknown subcommand', () => {
    const result = handleDocs(['unknown'])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe(`❌ Unknown command: docs unknown\n\n${DOCS_HELP_TEXT}`)
    }
  })

  it('returns error for serve with invalid port', () => {
    expect(handleDocs(['serve', '-p', 'abc'])).toStrictEqual({
      ok: false,
      error: '❌ Error: Invalid port number: abc',
    })
  })

  it('returns error for serve with missing port value', () => {
    expect(handleDocs(['serve', '--port'])).toStrictEqual({
      ok: false,
      error: '❌ Error: --port requires a number',
    })
  })
})

// =============================================================================
// hekireki
// =============================================================================

describe('hekireki', () => {
  it('returns HELP_TEXT when no args', () => {
    expect(hekireki([])).toStrictEqual({ ok: true, value: HELP_TEXT })
  })

  it('returns HELP_TEXT for -h', () => {
    expect(hekireki(['-h'])).toStrictEqual({ ok: true, value: HELP_TEXT })
  })

  it('returns HELP_TEXT for --help', () => {
    expect(hekireki(['--help'])).toStrictEqual({ ok: true, value: HELP_TEXT })
  })

  it('returns error for unknown command', () => {
    const result = hekireki(['unknown'])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe(`❌ Unknown command: unknown\n\n${HELP_TEXT}`)
    }
  })

  it('dispatches docs subcommand to handleDocs', () => {
    expect(hekireki(['docs'])).toStrictEqual({ ok: true, value: DOCS_HELP_TEXT })
  })

  it('dispatches docs -h to handleDocs', () => {
    expect(hekireki(['docs', '-h'])).toStrictEqual({ ok: true, value: DOCS_HELP_TEXT })
  })

  it('dispatches docs --help to handleDocs', () => {
    expect(hekireki(['docs', '--help'])).toStrictEqual({ ok: true, value: DOCS_HELP_TEXT })
  })

  it('returns error for docs serve with invalid port', () => {
    expect(hekireki(['docs', 'serve', '-p', 'abc'])).toStrictEqual({
      ok: false,
      error: '❌ Error: Invalid port number: abc',
    })
  })

  it('returns error for docs unknown subcommand', () => {
    const result = hekireki(['docs', 'foo'])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe(`❌ Unknown command: docs foo\n\n${DOCS_HELP_TEXT}`)
    }
  })
})
