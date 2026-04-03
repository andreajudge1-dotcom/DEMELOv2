import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

interface ClientState {
  full_name: string
  trainer_name: string
  has_program: boolean
}

export default function ClientHome() {
  const { profile } = useAuth()
  const [state, setState] = useState<ClientState | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile?.id) loadState(profile.id)
  }, [profile])

  async function loadState(userId: string) {
    setLoading(true)

    // Get client record linked to this user
    const { data: clientRow } = await supabase
      .from('clients')
      .select('id, full_name, trainer_id')
      .eq('profile_id', userId)
      .maybeSingle()

    if (!clientRow) {
      setLoading(false)
      return
    }

    // Get trainer name
    const { data: trainerRow } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', clientRow.trainer_id)
      .single()

    // Check for active program assignment
    const { data: assignment } = await supabase
      .from('client_cycle_assignments')
      .select('id')
      .eq('client_id', clientRow.id)
      .eq('is_active', true)
      .maybeSingle()

    setState({
      full_name: clientRow.full_name,
      trainer_name: trainerRow?.full_name ?? 'Your trainer',
      has_program: !!assignment,
    })
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <p className="font-bebas text-xl text-[#C9A84C] tracking-widest">LOADING...</p>
      </div>
    )
  }

  // ── No program assigned — holding state ──
  if (!state?.has_program) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center px-6 text-center">
        {/* Waiting indicator */}
        <div className="relative w-20 h-20 mb-8">
          <div className="absolute inset-0 rounded-full border-2 border-[#C9A84C]/20" />
          <div className="absolute inset-0 rounded-full border-t-2 border-[#C9A84C] animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <svg className="w-8 h-8 text-[#C9A84C]/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
            </svg>
          </div>
        </div>

        <p className="font-bebas text-3xl text-white tracking-wide mb-3">
          Your program is on its way.
        </p>
        <p className="font-barlow text-white/50 text-base leading-relaxed max-w-xs">
          {state?.trainer_name ?? 'Your trainer'} is building your training program. You'll be notified as soon as it's ready.
        </p>

        <div className="mt-10 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#C9A84C]/60 animate-pulse" style={{ animationDelay: '0ms' }} />
          <div className="w-1.5 h-1.5 rounded-full bg-[#C9A84C]/40 animate-pulse" style={{ animationDelay: '300ms' }} />
          <div className="w-1.5 h-1.5 rounded-full bg-[#C9A84C]/20 animate-pulse" style={{ animationDelay: '600ms' }} />
        </div>
      </div>
    )
  }

  // ── Program assigned — placeholder for future build ──
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-6 text-center">
      <div>
        <p className="font-bebas text-3xl text-white tracking-wide mb-2">Welcome back, {state.full_name.split(' ')[0]}.</p>
        <p className="font-barlow text-white/40 text-sm">Today's training will be built in the next prompt.</p>
      </div>
    </div>
  )
}
