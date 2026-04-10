import { useEffect } from 'react'
import { useNavigationGuardContext } from '../contexts/NavigationGuardContext'

/**
 * Registers unsaved-work state so that layout nav interceptors can show
 * a confirmation modal before navigating away.
 * Also blocks browser close / refresh via beforeunload.
 */
export function useNavigationGuard(hasUnsaved: boolean, message = '') {
  const { setGuard } = useNavigationGuardContext()

  // Register / clear dirty state in the shared context
  useEffect(() => {
    setGuard(hasUnsaved, message)
    return () => setGuard(false, '')
  }, [hasUnsaved, message, setGuard])

  // Browser close / refresh / address-bar navigation
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
