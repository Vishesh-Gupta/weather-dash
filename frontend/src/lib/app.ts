import { useEffect, useState, useSyncExternalStore } from 'react'

/** Register the service worker (production builds only; dev serves modules unbundled). */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Without it the app still works; it just can't open offline.
    })
  })
}

const subscribeOnline = (onChange: () => void) => {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/** Whether the browser thinks it is online. */
export function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  )
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * The browser's offer to install the app, when it makes one (Chromium-based
 * browsers; Safari installs from its Share menu instead). Null otherwise.
 */
export function useInstallPrompt(): (() => Promise<void>) | null {
  const [event, setEvent] = useState<InstallPromptEvent | null>(null)
  useEffect(() => {
    const offer = (e: Event) => {
      e.preventDefault()
      setEvent(e as InstallPromptEvent)
    }
    const installed = () => setEvent(null)
    window.addEventListener('beforeinstallprompt', offer)
    window.addEventListener('appinstalled', installed)
    return () => {
      window.removeEventListener('beforeinstallprompt', offer)
      window.removeEventListener('appinstalled', installed)
    }
  }, [])
  if (!event) return null
  return async () => {
    await event.prompt()
    await event.userChoice
    setEvent(null)
  }
}
