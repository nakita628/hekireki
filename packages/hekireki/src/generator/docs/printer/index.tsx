import type { FC, PropsWithChildren } from 'hono/jsx'
import { Style } from 'hono/css'
import { raw } from 'hono/html'
import { createTypes } from '../generator/apitypes.js'
import { createModels } from '../generator/model.js'
import { createTOC } from '../generator/toc.js'
import type { DMMFDocument } from '../generator/transformDMMF.js'
import {
  globalCss,
  containerClass,
  sidebarClass,
  mainContentClass,
  headerClass,
  logoContainerClass,
  logoTextClass,
  darkModeToggleContainerClass,
  darkModeToggleLabelClass,
  iconClass,
} from '../styles.js'

const HekirekiLogo: FC = () => (
  <img
    src="https://raw.githubusercontent.com/nakita628/hekireki/refs/heads/main/assets/img/hekireki.png"
    alt="Hekireki"
    width="40"
    height="40"
    class={iconClass}
  />
)

const DarkModeToggle: FC = () => (
  <div class={darkModeToggleContainerClass}>
    <input type="checkbox" id="darkModeToggle" />
    <label for="darkModeToggle" class={darkModeToggleLabelClass}>
      Dark Mode
    </label>
    <script>{raw(`
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
    `)}</script>
  </div>
)

const Layout: FC<PropsWithChildren> = ({ children }) => (
  <html lang="en" class={globalCss}>
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1.0" />
      <title>Hekireki Generated Docs</title>
      <Style />
      <script>{raw(`
        const isDarkMode = localStorage.getItem('isDarkMode') === 'true';
        if (isDarkMode) document.documentElement.classList.add('dark');
      `)}</script>
    </head>
    <body>{children}</body>
  </html>
)

const Sidebar: FC<{ toc: ReturnType<typeof createTOC> }> = ({ toc }) => (
  <div class={sidebarClass}>
    <div class={headerClass}>
      <div class={logoContainerClass}>
        <HekirekiLogo />
        <span class={logoTextClass}>Hekireki Docs</span>
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
  <div class={mainContentClass}>
    {models}
    {types}
  </div>
)

export const generateHTML = async (data: DMMFDocument): Promise<string> => {
  const element = (
    <Layout>
      <div class={containerClass}>
        <Sidebar toc={createTOC(data)} />
        <MainContent models={createModels(data)} types={createTypes(data)} />
      </div>
    </Layout>
  )

  return '<!DOCTYPE html>' + await element.toString()
}
