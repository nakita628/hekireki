import type { FC, PropsWithChildren } from 'hono/jsx'
import { raw } from 'hono/html'
import { TypesGenerator } from '../generator/apitypes.js'
import type { Generatable } from '../generator/helpers.js'
import { ModelGenerator } from '../generator/model.js'
import { TOCGenerator } from '../generator/toc.js'
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

const Sidebar: FC<{ toc: Element }> = ({ toc }) => (
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

const MainContent: FC<{ models: JSX.Element; types: JSX.Element }> = ({ models, types }) => (
  <div class={styles.mainContent}>
    {models}
    {types}
  </div>
)

export class HTMLPrinter implements Generatable<DMMFDocument> {
  data: DMMFDocument

  constructor(d: DMMFDocument) {
    this.data = this.getData(d)
  }

  getData(d: DMMFDocument): DMMFDocument {
    return d
  }

  async toHTML(): Promise<string> {
    const tocGen = new TOCGenerator(this.data)
    const modelGen = new ModelGenerator(this.data)
    const typeGen = new TypesGenerator(this.data)

    const element = (
      <Layout>
        <div class={styles.container}>
          <Sidebar toc={tocGen.toJSX()} />
          <MainContent models={modelGen.toJSX()} types={typeGen.toJSX()} />
        </div>
      </Layout>
    )

    return '<!DOCTYPE html>' + (element.toString())
  }
}
