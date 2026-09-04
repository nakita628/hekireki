import { Toast } from '@heroui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { IconContext } from 'react-icons'

import { routeTree } from './routeTree.gen.js'

export const queryClient = new QueryClient()

const router = createRouter({ routeTree, context: { queryClient } })

// `Register` is declared in router-core and re-exported by react-router, so it is augmented there.
declare module '@tanstack/router-core' {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- a module augmentation has to be an interface
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

// What every icon is unless a call site says otherwise: 16px, in the colour of the text around it,
// and hidden from the accessibility tree — labels and `aria-label`s are what a reader hears.
const ICONS = { size: '16', attr: { 'aria-hidden': true } }

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <IconContext value={ICONS}>
        <RouterProvider router={router} />
        <Toast.Provider placement="bottom end" />
      </IconContext>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </StrictMode>,
)
