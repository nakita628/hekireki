// Dark mode script for initialization
export const darkModeScript = `
  const isDarkMode = localStorage.getItem('isDarkMode') === 'true';
  if (isDarkMode) document.documentElement.classList.add('dark');
`

// Dark mode toggle script
export const darkModeToggleScript = `
  const darkModeToggle = document.getElementById('darkModeToggle');
  const isDarkModeStored = localStorage.getItem('isDarkMode') === 'true';
  darkModeToggle.checked = isDarkModeStored;
  darkModeToggle.addEventListener('change', function () {
    const isDark = this.checked;
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('isDarkMode', isDark);
  });
`

// All CSS styles as a single string
export const globalStyles = `
  :root {
    --bg-primary: #e5e7eb;
    --bg-secondary: #ffffff;
    --text-primary: #111827;
    --text-secondary: #374151;
    --text-muted: #6b7280;
    --border-color: #d1d5db;
    --link-color: #4f46e5;
  }

  :root.dark {
    --bg-primary: #1f2937;
    --bg-secondary: #1f2937;
    --text-primary: #f9fafb;
    --text-secondary: #e5e7eb;
    --text-muted: #9ca3af;
    --border-color: #4b5563;
    --link-color: #818cf8;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    background-color: var(--bg-primary);
    color: var(--text-primary);
    min-height: 100vh;
  }

  a {
    color: var(--link-color);
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }

  /* Layout */
  .container {
    display: flex;
    min-height: 100vh;
  }

  .sidebar {
    position: sticky;
    top: 0;
    width: 20%;
    flex-shrink: 0;
    height: 100vh;
    padding: 1rem 1.5rem;
    overflow: auto;
    background-color: var(--bg-secondary);
  }

  .main-content {
    width: 100%;
    padding: 1rem;
    background-color: var(--bg-secondary);
    overflow-x: hidden;
  }

  /* Header */
  .header {
    margin-bottom: 2rem;
  }

  .logo-container {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .logo-text {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .dark-mode-toggle-container {
    margin-top: 1.25rem;
  }

  .dark-mode-toggle-label {
    color: var(--text-primary);
    margin-left: 0.5rem;
  }

  /* Icon */
  .icon {
    color: #4f46e5;
    cursor: pointer;
  }

  .dark .icon {
    color: #818cf8;
  }

  /* Typography */
  .h1 {
    font-size: 1.875rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 1rem 0;
  }

  .h2 {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 0.5rem 0;
  }

  .h3 {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 0.5rem 0;
  }

  .h4 {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0 0 0.5rem 0;
  }

  .text {
    color: var(--text-primary);
  }

  .text-muted {
    color: var(--text-muted);
  }

  /* Table */
  .table {
    border-collapse: collapse;
    table-layout: auto;
  }

  .table th {
    padding: 0.5rem 1rem;
    border: 1px solid var(--border-color);
    color: var(--text-primary);
    font-weight: 600;
    text-align: left;
  }

  .table td {
    padding: 0.5rem 1rem;
    border: 1px solid var(--border-color);
    color: var(--text-primary);
  }

  /* TOC */
  .toc-section {
    margin-bottom: 0.5rem;
    margin-left: 0.25rem;
    list-style: none;
    padding: 0;
  }

  .toc-sub-header {
    font-weight: 600;
    color: var(--text-secondary);
  }

  .toc-sub-section {
    margin-top: 0.25rem;
    margin-left: 0.5rem;
  }

  .toc-sub-section-title {
    margin-bottom: 0.25rem;
    font-weight: 500;
    color: var(--text-muted);
  }

  .toc-list {
    padding-left: 0.75rem;
    margin: 0;
    margin-left: 0.25rem;
    border-left: 2px solid var(--border-color);
    list-style: none;
  }

  .toc-link {
    color: var(--text-primary);
    text-decoration: none;
  }

  .toc-link:hover {
    text-decoration: underline;
  }

  .toc-heading {
    margin-bottom: 0.5rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  /* Code block */
  .code-block {
    background: #f6f8fa;
    padding: 1em;
    border-radius: 0.5em;
    overflow: auto;
    font-family: 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
    font-size: 14px;
    line-height: 1.5;
    margin: 0;
  }

  .dark .code-block {
    background: #374151;
    color: #e5e7eb;
  }

  /* Section */
  .section {
    margin-bottom: 2rem;
  }

  .model-section {
    padding-left: 1rem;
    margin-bottom: 1rem;
  }

  .fields-section {
    padding-left: 1rem;
    margin-top: 1rem;
  }

  .operations-section {
    padding-left: 1rem;
    margin-top: 1rem;
  }

  .operation-item {
    margin-top: 1rem;
  }

  /* Dividers */
  .hr {
    margin: 2rem 0;
    border: none;
    border-top: 1px solid var(--border-color);
  }

  .hr-small {
    margin: 1rem 0;
    border: none;
    border-top: 1px solid var(--border-color);
  }

  /* List */
  .list {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .list-item {
    margin-bottom: 1rem;
  }

  /* Spacing utilities */
  .mb-2 {
    margin-bottom: 0.5rem;
  }

  .mb-4 {
    margin-bottom: 1rem;
  }

  .mt-2 {
    margin-top: 0.5rem;
  }

  .mt-4 {
    margin-top: 1rem;
  }

  .ml-4 {
    margin-left: 1rem;
  }
`

// CSS class names
export const styles = {
  container: 'container',
  sidebar: 'sidebar',
  mainContent: 'main-content',
  header: 'header',
  logoContainer: 'logo-container',
  logoText: 'logo-text',
  darkModeToggleContainer: 'dark-mode-toggle-container',
  darkModeToggleLabel: 'dark-mode-toggle-label',
  icon: 'icon',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  text: 'text',
  textMuted: 'text-muted',
  table: 'table',
  tocSection: 'toc-section',
  tocSubHeader: 'toc-sub-header',
  tocSubSection: 'toc-sub-section',
  tocSubSectionTitle: 'toc-sub-section-title',
  tocList: 'toc-list',
  tocLink: 'toc-link',
  tocHeading: 'toc-heading',
  codeBlock: 'code-block',
  section: 'section',
  modelSection: 'model-section',
  fieldsSection: 'fields-section',
  operationsSection: 'operations-section',
  operationItem: 'operation-item',
  hr: 'hr',
  hrSmall: 'hr-small',
  list: 'list',
  listItem: 'list-item',
  mb2: 'mb-2',
  mb4: 'mb-4',
  mt2: 'mt-2',
  mt4: 'mt-4',
  ml4: 'ml-4',
} as const
