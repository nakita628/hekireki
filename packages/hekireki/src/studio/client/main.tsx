import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'react-hot-toast'

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

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster position="bottom-right" toastOptions={{ className: 'toast' }} />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </StrictMode>,
)
