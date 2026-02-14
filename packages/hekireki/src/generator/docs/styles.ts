import { css } from 'hono/css'

// Global CSS - CSS Custom Properties + resets
// :-hono-global prevents css`` from scoping selectors under a generated class,
// so :root, body, *, a selectors apply globally as intended.
export const globalCss = css`
  :-hono-global {
    :root {
      --bg-primary: #e5e7eb;
      --bg-secondary: #ffffff;
      --text-primary: #111827;
      --text-secondary: #374151;
      --text-muted: #6b7280;
      --border-color: #d1d5db;
      --link-color: #4f46e5;
      --icon-color: #4f46e5;
      --code-bg: #f6f8fa;
      --code-color: inherit;
    }
    :root.dark {
      --bg-primary: #1f2937;
      --bg-secondary: #1f2937;
      --text-primary: #f9fafb;
      --text-secondary: #e5e7eb;
      --text-muted: #9ca3af;
      --border-color: #4b5563;
      --link-color: #818cf8;
      --icon-color: #818cf8;
      --code-bg: #374151;
      --code-color: #e5e7eb;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
    }
    a { color: var(--link-color); text-decoration: none; }
    a:hover { text-decoration: underline; }
  }
`

// Layout
export const containerClass = css`
  display: flex;
  min-height: 100vh;
`

export const sidebarClass = css`
  position: sticky;
  top: 0;
  width: 20%;
  flex-shrink: 0;
  height: 100vh;
  padding: 1rem 1.5rem;
  overflow: auto;
  background-color: var(--bg-secondary);
`

export const mainContentClass = css`
  width: 100%;
  padding: 1rem;
  background-color: var(--bg-secondary);
  overflow-x: hidden;
`

// Header
export const headerClass = css`
  margin-bottom: 2rem;
`

export const logoContainerClass = css`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`

export const logoTextClass = css`
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary);
`

export const darkModeToggleContainerClass = css`
  margin-top: 1.25rem;
`

export const darkModeToggleLabelClass = css`
  color: var(--text-primary);
  margin-left: 0.5rem;
`

// Icon
export const iconClass = css`
  border-radius: 50%;
  object-fit: cover;
`

// Typography
export const h1Class = css`
  font-size: 1.875rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 1rem 0;
`

export const h2Class = css`
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 0.5rem 0;
`

export const h3Class = css`
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 0.5rem 0;
`

export const h4Class = css`
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 0.5rem 0;
`

export const textClass = css`
  color: var(--text-primary);
`

export const textMutedClass = css`
  color: var(--text-muted);
`

// Table
export const tableClass = css`
  border-collapse: collapse;
  table-layout: auto;
  & th {
    padding: 0.5rem 1rem;
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    font-weight: 600;
    text-align: left;
  }
  & td {
    padding: 0.5rem 1rem;
    border: 1px solid var(--border-color);
    color: var(--text-primary);
  }
`

// TOC
export const tocSectionClass = css`
  margin-bottom: 0.5rem;
  margin-left: 0.25rem;
  list-style: none;
  padding: 0;
`

export const tocSubHeaderClass = css`
  font-weight: 600;
  color: var(--text-secondary);
`

export const tocSubSectionClass = css`
  margin-top: 0.25rem;
  margin-left: 0.5rem;
`

export const tocSubSectionTitleClass = css`
  margin-bottom: 0.25rem;
  font-weight: 500;
  color: var(--text-muted);
`

export const tocListClass = css`
  padding-left: 0.75rem;
  margin: 0;
  margin-left: 0.25rem;
  border-left: 2px solid var(--border-color);
  list-style: none;
`

export const tocLinkClass = css`
  color: var(--text-primary);
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`

export const tocHeadingClass = css`
  margin-bottom: 0.5rem;
  font-weight: 700;
  color: var(--text-primary);
`

// Code block
export const codeBlockClass = css`
  background: var(--code-bg);
  color: var(--code-color);
  padding: 1em;
  border-radius: 0.5em;
  overflow: auto;
  font-family: 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.5;
  margin: 0;
`

// Section
export const sectionClass = css`
  margin-bottom: 2rem;
`

export const modelSectionClass = css`
  padding-left: 1rem;
  margin-bottom: 1rem;
`

export const fieldsSectionClass = css`
  padding-left: 1rem;
  margin-top: 1rem;
`

export const operationsSectionClass = css`
  padding-left: 1rem;
  margin-top: 1rem;
`

export const operationItemClass = css`
  margin-top: 1rem;
`

// Dividers
export const hrClass = css`
  margin: 2rem 0;
  border: none;
  border-top: 1px solid var(--border-color);
`

export const hrSmallClass = css`
  margin: 1rem 0;
  border: none;
  border-top: 1px solid var(--border-color);
`

// List
export const listClass = css`
  margin: 0;
  padding: 0;
  list-style: none;
`

export const listItemClass = css`
  margin-bottom: 1rem;
`

// Spacing utilities
export const mb2Class = css`
  margin-bottom: 0.5rem;
`

export const mb4Class = css`
  margin-bottom: 1rem;
`

export const mt2Class = css`
  margin-top: 0.5rem;
`

export const mt4Class = css`
  margin-top: 1rem;
`

export const ml4Class = css`
  margin-left: 1rem;
`
