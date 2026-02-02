import type { FC, PropsWithChildren } from 'hono/jsx'
import { raw } from 'hono/html'
import { createTypes } from '../generator/apitypes.js'
import { createModels } from '../generator/model.js'
import { createTOC } from '../generator/toc.js'
import type { DMMFDocument } from '../generator/transformDMMF.js'
import {
  darkModeScript,
  darkModeToggleScript,
  globalStyles,
  styles,
} from '../styles.js'

const HekirekiSvg: FC = () => (
  <svg
    width="40"
    height="40"
    viewBox="0 0 40 40"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    class={styles.icon}
  >
    <circle cx="20" cy="20" r="18" stroke="currentColor" stroke-width="2" fill="none" />
    <path d="M12 20 L20 12 L28 20 L20 28 Z" fill="currentColor" />
  </svg>
)

const DarkModeToggle: FC = () => (
  <div class={styles.darkModeToggleContainer}>
    <input type="checkbox" id="darkModeToggle" />
    <label for="darkModeToggle" class={styles.darkModeToggleLabel}>
      Dark Mode
    </label>
    <script>{raw(darkModeToggleScript)}</script>
  </div>
)

const Layout: FC<PropsWithChildren> = ({ children }) => (
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1.0" />
      <title>Hekireki Generated Docs</title>
      <style>{raw(globalStyles)}</style>
      <script>{raw(darkModeScript)}</script>
    </head>
    <body>{children}</body>
  </html>
)

const Sidebar: FC<{ toc: ReturnType<typeof createTOC> }> = ({ toc }) => (
  <div class={styles.sidebar}>
    <div class={styles.header}>
      <div class={styles.logoContainer}>
        <HekirekiSvg />
        <span class={styles.logoText}>Hekireki Docs</span>
      </div>
      <DarkModeToggle />
    </div>
    {toc}
  </div>
)

const MainContent: FC<{
  models: ReturnType<typeof createModels>
  types: ReturnType<typeof createTypes>
}> = ({ models, types }) => (
  <div class={styles.mainContent}>
    {models}
    {types}
  </div>
)

export const generateHTML = async (data: DMMFDocument): Promise<string> => {
  const element = (
    <Layout>
      <div class={styles.container}>
        <Sidebar toc={createTOC(data)} />
        <MainContent models={createModels(data)} types={createTypes(data)} />
      </div>
    </Layout>
  )

  return '<!DOCTYPE html>' + element.toString()
}
