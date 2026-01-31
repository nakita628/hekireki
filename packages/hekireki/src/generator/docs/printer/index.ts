import type { Generatable } from '../generator/helpers.js'
import type { DMMFDocument } from '../generator/transformDMMF.js'
import { TOCGenerator } from '../generator/toc.js'
import { ModelGenerator } from '../generator/model.js'
import { TypesGenerator } from '../generator/apitypes.js'

export class HTMLPrinter implements Generatable<DMMFDocument> {
  data: DMMFDocument

  constructor(d: DMMFDocument) {
    this.data = this.getData(d)
  }

  private getHekirekiSvg(): string {
    return `
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      class="text-indigo-600 dark:text-indigo-400"
      style="cursor: pointer;"
    >
      <circle cx="20" cy="20" r="18" stroke="currentColor" stroke-width="2" fill="none"/>
      <path d="M12 20 L20 12 L28 20 L20 28 Z" fill="currentColor"/>
    </svg>
    `
  }

  private getDarkModeToggle(): string {
    return `
    <div class="mt-5">
      <input type="checkbox" id="darkModeToggle">
      <label for="darkModeToggle" class="text-black dark:text-white">Dark Mode</label>
    </div>
    <script>
        const isDarkMode = localStorage.getItem('isDarkMode') === 'true';
        const darkModeToggle = document.getElementById('darkModeToggle');
        function setDarkMode(isDarkMode) {
            if (isDarkMode) {
                document.body.classList.add('dark');
                darkModeToggle.checked = true
            } else {
                document.body.classList.remove('dark');
            }
        }

        setDarkMode(isDarkMode);
        darkModeToggle.addEventListener('change', function () {
            const isDarkMode = this.checked;
            setDarkMode(isDarkMode);
            localStorage.setItem('isDarkMode', isDarkMode);
        });
    </script>
  `
  }

  private getHead(): string {
    return `
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1.0" />
    <title>Hekireki Generated Docs</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
      tailwind.config = {
        darkMode: 'class',
      }
    </script>
    <style>
      /* Code block styles */
      pre[class*="language-"] {
        background: #f6f8fa;
        padding: 1em;
        border-radius: 0.5em;
        overflow: auto;
        font-family: "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        font-size: 14px;
        line-height: 1.5;
      }
      .dark pre[class*="language-"] {
        background: #1f2937;
        color: #e5e7eb;
      }
      code {
        font-family: "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      }
    </style>
    `
  }

  getData(d: DMMFDocument): DMMFDocument {
    return d
  }

  toHTML(): string {
    const tocGen = new TOCGenerator(this.data)
    const modelGen = new ModelGenerator(this.data)
    const typeGen = new TypesGenerator(this.data)

    return `
<!DOCTYPE html>
<html lang="en">
  <head>
    ${this.getHead()}
  </head>
  <body class="bg-gray-200 dark:bg-gray-800">
    <div class="flex min-h-screen">
      <div
        class="sticky top-0 w-1/5 flex-shrink-0 h-screen p-4 px-6 overflow-auto bg-white dark:bg-gray-800 mac-h-screen"
      >
        <div class="mb-8">
          <div class="flex items-center gap-2">
            ${this.getHekirekiSvg()}
            <span class="text-xl font-bold text-gray-800 dark:text-white">Hekireki Docs</span>
          </div>
          ${this.getDarkModeToggle()}
        </div>
        ${tocGen.toHTML()}
      </div>
      <div class="w-full p-4 bg-white overflow-x-hidden dark:bg-gray-800">
        ${modelGen.toHTML()}
        ${typeGen.toHTML()}
      </div>
    </div>
  </body>
</html>
`
  }
}
