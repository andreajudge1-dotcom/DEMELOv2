import { useEffect } from 'react'

/**
 * Warns the user before navigating away when there is unsaved work.
 * Uses the browser's native beforeunload event for tab close / refresh.
 */
export function useUnsavedWarning(hasUnsaved: boolean) {
  useEffect(() => {
    if (!hasUnsaved) return

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [hasUnsaved])
}
