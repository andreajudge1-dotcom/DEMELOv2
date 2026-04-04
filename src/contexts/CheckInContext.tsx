import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CheckInContextType {
  hasCheckedInThisWeek: boolean | null   // null = still loading
  refetch: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

// ── Context ───────────────────────────────────────────────────────────────────

const CheckInContext = createContext<CheckInContextType>({
  hasCheckedInThisWeek: null,
  refetch: () => {},
})

export function CheckInProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [hasCheckedInThisWeek, setHasCheckedInThisWeek] = useState<boolean | null>(null)

  const fetchStatus = useCallback(async () => {
    if (!user) return

    // Get this client's id
    const { data: clientRow } = await supabase
      .from('clients')
      .select('id')
      .eq('profile_id', user.id)
      .maybeSingle()

    if (!clientRow) {
      setHasCheckedInThisWeek(false)
      return
    }

    // Query check_ins created on or after Monday this week
    const monday = getMondayOfWeek(new Date())

    const { data } = await supabase
      .from('check_ins')
      .select('id')
      .eq('client_id', clientRow.id)
      .gte('created_at', monday.toISOString())
      .limit(1)

    setHasCheckedInThisWeek((data?.length ?? 0) > 0)
  }, [user])

  useEffect(() => {
    if (user) fetchStatus()
  }, [user, fetchStatus])

  return (
    <CheckInContext.Provider value={{ hasCheckedInThisWeek, refetch: fetchStatus }}>
      {children}
    </CheckInContext.Provider>
  )
}

export function useCheckIn() {
  return useContext(CheckInContext)
}
