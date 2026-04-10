import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface NavigationGuardContextValue {
  isDirty: boolean
  message: string
  setGuard: (dirty: boolean, message?: string) => void
}

const NavigationGuardContext = createContext<NavigationGuardContextValue>({
  isDirty: false,
  message: '',
  setGuard: () => {},
})

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const [isDirty, setIsDirty] = useState(false)
  const [message, setMessage] = useState('')

  const setGuard = useCallback((dirty: boolean, msg = '') => {
    setIsDirty(dirty)
    setMessage(msg)
  }, [])

  return (
    <NavigationGuardContext.Provider value={{ isDirty, message, setGuard }}>
      {children}
    </NavigationGuardContext.Provider>
  )
}

export function useNavigationGuardContext() {
  return useContext(NavigationGuardContext)
}
