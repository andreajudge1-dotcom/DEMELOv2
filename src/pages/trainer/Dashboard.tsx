import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

interface Client {
  id: string
  full_name: string
  status: string
  email: string
}

interface RecentSession {
  id: string
  started_at: string
  status: string
  clients: { full_name: string } | { full_name: string }[] | null
  workouts: { name: string } | { name: string }[] | null
}

interface PendingCheckIn {
  id: string
  week_start: string
  created_at: string
  client_id: string
  client_name: string
}

export default function Dashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [clients, setClients] = useState<Client[]>([])
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([])
  const [pendingCheckIns, setPendingCheckIns] = useState<PendingCheckIn[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const didFetch = useRef(false)

  useEffect(() => {
    if (profile?.id && !didFetch.current) {
      didFetch.current = true
      fetchDashboardData()
    }
  }, [profile?.id])

  // Timeout — force render after 5s
  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) {
        setLoading(false)
        setFetchError(true)
      }
    }, 5000)
    return () => clearTimeout(timer)
  }, [loading])

  async function fetchDashboardData() {
    try {
      const trainerId = profile?.id
      if (!trainerId) { setLoading(false); return }

      const { data: clientsData } = await supabase
        .from('clients')
        .select('id, full_name, status, email')
        .eq('trainer_id', trainerId)
        .order('created_at', { ascending: false })

      setClients(clientsData ?? [])

      const clientIds = (clientsData ?? []).map(c => c.id)

      if (clientIds.length > 0) {
        const { data: sessionsData } = await supabase
          .from('sessions')
          .select('id, started_at, status, clients(full_name), workouts(name)')
          .in('client_id', clientIds)
          .order('started_at', { ascending: false })
          .limit(5)
        setRecentSessions(sessionsData ?? [])

        // Pending check-ins this week
        const monday = new Date()
        const day = monday.getDay()
        monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1))
        monday.setHours(0, 0, 0, 0)
        const mondayStr = monday.toISOString().split('T')[0]

        const clientMap = new Map((clientsData ?? []).map(c => [c.id, c.full_name]))

        const { data: ciData } = await supabase
          .from('check_ins')
          .select('id, week_start, created_at, client_id')
          .in('client_id', clientIds)
          .gte('week_start', mondayStr)
          .is('coach_response', null)
          .order('created_at', { ascending: false })

        setPendingCheckIns((ciData ?? []).map(ci => ({
          ...ci,
          client_name: clientMap.get(ci.client_id) ?? 'Client',
        })))
      }

      setLoading(false)
    } catch (err) {
      console.error('Dashboard fetch error:', err)
      setLoading(false)
      setFetchError(true)
    }
  }

  const activeClients = clients.filter(c => c.status === 'active')

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#C9A84C]/30 border-t-[#C9A84C] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-6xl relative">
      {/* Full bleed faded background */}
      <div
        className="fixed inset-0 ml-64 z-0 pointer-events-none"
        style={{
          backgroundImage: 'url(https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1600&q=80)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.04,
        }}
      />

      {/* Error note */}
      {fetchError && (
        <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">
          <p className="font-barlow text-xs text-red-400">Some data may not have loaded. Try refreshing.</p>
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="font-bebas text-4xl text-white tracking-wide">
          Welcome back, {profile?.full_name?.split(' ')[0] ?? 'Coach'}
        </h1>
        <p className="font-barlow text-sm text-white/40 mt-1">
          {new Date().toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Active Clients', value: activeClients.length },
          { label: 'Total Clients', value: clients.length },
          { label: 'Recent Sessions', value: recentSessions.length },
        ].map(stat => (
          <div key={stat.label} className="bg-[#1C1C1E] rounded-xl p-5 border border-[#2C2C2E]">
            <p className="font-bebas text-4xl text-[#C9A84C]">{stat.value}</p>
            <p className="font-barlow text-xs text-white/40 uppercase tracking-widest mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Pending check-ins */}
      <div className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-[#2C2C2E] flex items-center justify-between">
          <h2 className="font-bebas text-lg text-white tracking-wide">Weekly Check-Ins</h2>
          {pendingCheckIns.length > 0 && (
            <span className="font-barlow text-xs bg-[#C9A84C]/15 text-[#C9A84C] px-2.5 py-1 rounded-full">
              {pendingCheckIns.length} pending
            </span>
          )}
        </div>
        {pendingCheckIns.length === 0 ? (
          <div className="px-5 py-6 flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-green-500/15 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-barlow text-sm text-white/40">All caught up — no pending check-ins.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#2C2C2E]">
            {pendingCheckIns.map(ci => (
              <div key={ci.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="font-barlow text-sm text-white">{ci.client_name}</p>
                  <p className="font-barlow text-xs text-white/40">
                    {new Date(ci.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {' · '}
                    {new Date(ci.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
                <button
                  onClick={() => navigate(`/trainer/clients/${ci.client_id}?tab=Check-ins`)}
                  className="font-barlow text-xs text-[#C9A84C] hover:text-[#E2C070] transition-colors px-3 py-1.5 border border-[#C9A84C]/30 rounded-lg"
                >
                  Review
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Client list */}
        <div className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#2C2C2E] flex items-center justify-between">
            <h2 className="font-bebas text-lg text-white tracking-wide">Clients</h2>
            <span className="font-barlow text-xs text-white/40">{clients.length} total</span>
          </div>
          <div className="divide-y divide-[#2C2C2E]">
            {clients.length === 0 ? (
              <p className="font-barlow text-sm text-white/30 px-5 py-6">No clients yet.</p>
            ) : (
              clients.slice(0, 6).map(client => (
                <div key={client.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="font-barlow text-sm text-white">{client.full_name}</p>
                    <p className="font-barlow text-xs text-white/40">{client.email}</p>
                  </div>
                  <span className={`font-barlow text-xs px-2 py-0.5 rounded-full ${
                    client.status === 'active'
                      ? 'bg-[#2A7A2A]/20 text-[#2A7A2A]'
                      : 'bg-white/5 text-white/30'
                  }`}>
                    {client.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent sessions */}
        <div className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#2C2C2E]">
            <h2 className="font-bebas text-lg text-white tracking-wide">Recent Sessions</h2>
          </div>
          <div className="divide-y divide-[#2C2C2E]">
            {recentSessions.length === 0 ? (
              <p className="font-barlow text-sm text-white/30 px-5 py-6">No sessions yet.</p>
            ) : (
              recentSessions.map(session => (
                <div key={session.id} className="px-5 py-3">
                  <p className="font-barlow text-sm text-white">
                    {(Array.isArray(session.clients) ? session.clients[0]?.full_name : session.clients?.full_name) ?? 'Unknown'}
                  </p>
                  <p className="font-barlow text-xs text-white/40">
                    {(Array.isArray(session.workouts) ? session.workouts[0]?.name : session.workouts?.name) ?? 'No workout'} · {new Date(session.started_at).toLocaleDateString()}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
