import { useEffect, useState } from 'react'
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

export default function Dashboard() {
  const { profile } = useAuth()
  const [clients, setClients] = useState<Client[]>([])
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  async function fetchDashboardData() {
    const { data: trainerData } = await supabase
      .from('trainers')
      .select('id')
      .eq('id', profile?.id)
      .single()

    if (!trainerData) return

    const { data: clientsData } = await supabase
      .from('clients')
      .select('id, full_name, status, email')
      .eq('trainer_id', trainerData.id)
      .order('created_at', { ascending: false })

    const { data: sessionsData } = await supabase
      .from('sessions')
      .select('id, started_at, status, clients(full_name), workouts(name)')
      .in('client_id', (clientsData ?? []).map(c => c.id))
      .order('started_at', { ascending: false })
      .limit(5)

    setClients(clientsData ?? [])
    setRecentSessions(sessionsData ?? [])
    setLoading(false)
  }

  const activeClients = clients.filter(c => c.status === 'active')

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="font-barlow text-white/40">Loading...</p>
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
