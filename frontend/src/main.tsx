import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { ApiError } from './api/client'
import { queryKeys } from './api/queries'
import { registerServiceWorker } from './lib/app'
import { LiveProvider } from './LiveProvider'
import { PreferencesProvider } from './preferences'
import { createAppRouter } from './router'
import './styles.css'

// A 401 means the admin session expired or was signed out elsewhere: recheck it
// so the UI stops offering admin actions.
const onError = (error: Error) => {
  if (error instanceof ApiError && error.status === 401)
    void queryClient.invalidateQueries({ queryKey: queryKeys.session })
}

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: {
      // Don't retry client errors such as 404s; retry transient failures once.
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status < 500) && failureCount < 1,
      refetchOnWindowFocus: false,
    },
  },
})

const router = createAppRouter(queryClient)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <LiveProvider>
        <PreferencesProvider>
          <RouterProvider router={router} />
        </PreferencesProvider>
      </LiveProvider>
    </QueryClientProvider>
  </StrictMode>,
)

registerServiceWorker()
