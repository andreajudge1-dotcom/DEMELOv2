import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Client {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  status: string
  notes: string | null
  created_at: string
}

interface CycleInfo {
  id: string
  name: string
  num_days: number
  num_weeks: number
  cover_photo_url: string | null
}

interface Assignment {
  id: string
  cycle_id: string
  status: string
  is_active: boolean
  next_day_number: number
  started_at: string | null
  created_at: string
  training_cycles: CycleInfo
}

interface WorkoutDay {
  id: string
  day_number: number
  name: string
  focus: string | null
}

interface Session {
  id: string
  workout_id: string | null
  cycle_id: string | null
  started_at: string | null
  completed_at: string | null
  duration_min: number | null
  notes: string | null
  coach_notes: string | null
  rating: number | null
  workouts: { name: string; day_number: number } | null
  training_cycles: { name: string } | null
}

interface SessionExercise {
  id: string
  exercise_id: string
  order_index: number
  notes: string | null
  exercises: { name: string } | null
  session_sets: SessionSet[]
}

interface SessionSet {
  id: string
  set_number: number
  reps_completed: number | null
  weight_kg: number | null
  rpe_actual: number | null
  notes: string | null
}

interface CheckIn {
  id: string
  week_start: string
  sleep_quality: number | null
  energy_level: number | null
  stress_level: number | null
  soreness_level: number | null
  motivation: number | null
  notes: string | null
}

interface TrainingMax {
  id: string
  exercise_name: string
  max_kg: number | null
  updated_at: string
}

interface ProgramHistory {
  id: string
  cycle_id: string
  status: string
  started_at: string | null
  created_at: string
  training_cycles: { name: string; num_days: number; num_weeks: number }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active:   'bg-green-500/20 text-green-400',
  invited:  'bg-blue-500/20 text-blue-400',
  paused:   'bg-yellow-500/20 text-yellow-400',
  inactive: 'bg-white/10 text-white/40',
  prospect: 'bg-purple-500/20 text-purple-400',
}

const TABS = ['Overview', 'Program', 'Sessions', 'Progress', 'Check-ins', 'Metrics', 'Messages', 'Vault'] as const
type Tab = typeof TABS[number]

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function scoreBar(value: number | null) {
  if (value === null) return null
  const pct = (value / 10) * 100
  const color = value >= 7 ? '#4ade80' : value >= 4 ? '#facc15' : '#f87171'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-[#2C2C2E] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="font-barlow text-xs text-white/60 w-4 text-right">{value}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function ClientProfile() {
  const { id: clientId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [activeTab, setActiveTab] = useState<Tab>('Overview')
  const [client, setClient] = useState<Client | null>(null)
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [workoutDays, setWorkoutDays] = useState<WorkoutDay[]>([])
  const [programHistory, setProgramHistory] = useState<ProgramHistory[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [checkIns, setCheckIns] = useState<CheckIn[]>([])
  const [maxes, setMaxes] = useState<TrainingMax[]>([])
  const [loading, setLoading] = useState(true)
  const [stickyNote, setStickyNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const loadSessions = useCallback(async (cid: string) => {
    const { data } = await supabase
      .from('sessions')
      .select('id, workout_id, cycle_id, started_at, completed_at, duration_min, notes, coach_notes, rating, workouts(name, day_number), training_cycles(name)')
      .eq('client_id', cid)
      .order('started_at', { ascending: false })
      .limit(50)
    setSessions((data ?? []) as unknown as Session[])
  }, [])

  const loadMaxes = useCallback(async (cid: string) => {
    const { data } = await supabase
      .from('training_maxes')
      .select('*')
      .eq('client_id', cid)
      .order('exercise_name')
    setMaxes(data ?? [])
  }, [])

  useEffect(() => {
    if (!clientId) return

    async function loadAll() {
      setLoading(true)
      const cid = clientId!

      const [clientRes, assignRes, historyRes, sessRes, checkRes, maxRes] = await Promise.all([
        supabase.from('clients').select('*').eq('id', cid).single(),
        supabase
          .from('client_cycle_assignments')
          .select('*, training_cycles(id, name, num_days, num_weeks, cover_photo_url)')
          .eq('client_id', cid)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('client_cycle_assignments')
          .select('id, cycle_id, status, started_at, created_at, training_cycles(name, num_days, num_weeks)')
          .eq('client_id', cid)
          .order('created_at', { ascending: false }),
        supabase
          .from('sessions')
          .select('id, workout_id, cycle_id, started_at, completed_at, duration_min, notes, coach_notes, rating, workouts(name, day_number), training_cycles(name)')
          .eq('client_id', cid)
          .order('started_at', { ascending: false })
          .limit(50),
        supabase
          .from('check_ins')
          .select('*')
          .eq('client_id', cid)
          .order('week_start', { ascending: false }),
        supabase
          .from('training_maxes')
          .select('*')
          .eq('client_id', cid)
          .order('exercise_name'),
      ])

      if (clientRes.data) {
        setClient(clientRes.data)
        setStickyNote(clientRes.data.notes ?? '')
      }
      if (assignRes.data) {
        setAssignment(assignRes.data as Assignment)
        // Load workouts for active cycle
        const { data: wd } = await supabase
          .from('workouts')
          .select('id, day_number, name, focus')
          .eq('cycle_id', assignRes.data.cycle_id)
          .order('day_number')
        setWorkoutDays(wd ?? [])
      }
      setProgramHistory((historyRes.data ?? []) as unknown as ProgramHistory[])
      setSessions((sessRes.data ?? []) as unknown as Session[])
      setCheckIns(checkRes.data ?? [])
      setMaxes(maxRes.data ?? [])
      setLoading(false)
    }

    loadAll()
  }, [clientId])

  async function saveNote() {
    if (!clientId) return
    setSavingNote(true)
    await supabase.from('clients').update({ notes: stickyNote }).eq('id', clientId)
    setSavingNote(false)
  }

  // ── Computed ──
  const completedSessions = sessions.filter(s => s.completed_at)
  const lastSession = completedSessions[0] ?? null
  const daysSinceSession = lastSession ? daysSince(lastSession.completed_at) : null
  const complianceRate = sessions.length > 0
    ? Math.round((completedSessions.length / sessions.length) * 100)
    : null
  const currentWeek = assignment
    ? Math.ceil(assignment.next_day_number / assignment.training_cycles.num_days)
    : null

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="font-bebas text-xl text-[#C9A84C] tracking-widest">LOADING...</p>
      </div>
    )
  }

  if (!client) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="font-barlow text-white/40">Client not found.</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl">
      {/* ── Header ── */}
      <div className="bg-[#1C1C1E] rounded-2xl border border-[#2C2C2E] p-6 mb-6">
        <div className="flex items-start gap-5 flex-wrap">
          {/* Back + avatar */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/trainer/clients')}
              className="font-barlow text-sm text-white/30 hover:text-white transition-colors"
            >
              ←
            </button>
            <div className="w-14 h-14 rounded-full bg-[#C9A84C]/20 flex items-center justify-center">
              <span className="font-bebas text-xl text-[#C9A84C]">{initials(client.full_name)}</span>
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-bebas text-3xl text-white tracking-wide">{client.full_name}</h1>
              <span className={`font-barlow text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[client.status] ?? 'bg-white/10 text-white/40'}`}>
                {client.status}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-1.5">
              {assignment ? (
                <p className="font-barlow text-sm">
                  <span className="text-[#C9A84C]">{assignment.training_cycles.name}</span>
                  {currentWeek !== null && (
                    <span className="text-white/40 ml-1">· Week {currentWeek} of {assignment.training_cycles.num_weeks}</span>
                  )}
                </p>
              ) : (
                <p className="font-barlow text-sm text-white/30 italic">No active program</p>
              )}
              <p className="font-barlow text-sm text-white/40">
                Last session:{' '}
                <span className="text-white/70">
                  {daysSinceSession === null ? 'Never' : daysSinceSession === 0 ? 'Today' : `${daysSinceSession}d ago`}
                </span>
              </p>
              {complianceRate !== null && (
                <p className="font-barlow text-sm text-white/40">
                  Compliance:{' '}
                  <span className={`font-semibold ${complianceRate >= 80 ? 'text-green-400' : complianceRate >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {complianceRate}%
                  </span>
                </p>
              )}
            </div>
            {client.email && (
              <p className="font-barlow text-xs text-white/30 mt-1">{client.email}{client.phone ? ` · ${client.phone}` : ''}</p>
            )}
          </div>

          {/* Quick actions */}
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            <button
              onClick={() => setActiveTab('Messages')}
              className="font-barlow text-sm text-white/60 border border-[#2C2C2E] rounded-lg px-3 py-2 hover:border-[#3A3A3C] hover:text-white transition-colors"
            >
              Message
            </button>
            <button
              onClick={() => navigate(`/trainer/programs/new?clientId=${clientId}`)}
              className="font-barlow text-sm text-white/60 border border-[#2C2C2E] rounded-lg px-3 py-2 hover:border-[#3A3A3C] hover:text-white transition-colors"
            >
              Assign Program
            </button>
            <button
              onClick={() => navigate(`/trainer/programs/new?clientId=${clientId}`)}
              className="bg-[#C9A84C] text-black font-bebas text-sm tracking-widest px-4 py-2 rounded-lg hover:bg-[#E2C070] transition-colors"
            >
              Build Program
            </button>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-0 mb-6 border-b border-[#2C2C2E] overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`font-barlow text-sm px-4 py-2.5 whitespace-nowrap transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'text-[#C9A84C] border-[#C9A84C]'
                : 'text-white/40 border-transparent hover:text-white/60'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div className="flex gap-5 items-start">
        <div className="flex-1 min-w-0">
          {activeTab === 'Overview' && (
            <OverviewTab
              assignment={assignment}
              currentWeek={currentWeek}
              workoutDays={workoutDays}
              sessions={sessions}
              checkIns={checkIns}
            />
          )}
          {activeTab === 'Program' && (
            <ProgramTab
              clientId={clientId!}
              assignment={assignment}
              workoutDays={workoutDays}
              programHistory={programHistory}
              navigate={navigate}
            />
          )}
          {activeTab === 'Sessions' && (
            <SessionsTab
              sessions={sessions}
              clientId={clientId!}
              trainerId={profile?.id ?? ''}
              onRefresh={() => loadSessions(clientId!)}
            />
          )}
          {activeTab === 'Progress' && (
            <ProgressTab sessions={sessions} />
          )}
          {activeTab === 'Check-ins' && (
            <CheckInsTab checkIns={checkIns} />
          )}
          {activeTab === 'Metrics' && (
            <MetricsTab
              maxes={maxes}
              clientId={clientId!}
              trainerId={profile?.id ?? ''}
              onRefresh={() => loadMaxes(clientId!)}
            />
          )}
          {activeTab === 'Messages' && (
            <StubTab title="Messages" desc="Direct messaging between you and this client. Coming soon." />
          )}
          {activeTab === 'Vault' && (
            <StubTab title="Vault" desc="Documents, contracts, and resources shared with this client. Coming soon." />
          )}
        </div>

        {/* Sticky notes sidebar */}
        <div className="w-52 flex-shrink-0 hidden lg:block">
          <div className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] p-4 sticky top-4">
            <p className="font-barlow text-xs text-[#C9A84C] font-semibold uppercase tracking-wider mb-2">
              Coach Notes
            </p>
            <textarea
              value={stickyNote}
              onChange={e => setStickyNote(e.target.value)}
              onBlur={saveNote}
              placeholder="Quick notes about this client..."
              rows={9}
              className="w-full bg-transparent font-barlow text-xs text-white/70 placeholder-white/20 resize-none outline-none leading-relaxed"
            />
            {savingNote && (
              <p className="font-barlow text-xs text-white/25 mt-1">Saving...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Overview Tab
// ─────────────────────────────────────────────────────────────────────────────

function OverviewTab({
  assignment,
  currentWeek,
  workoutDays,
  sessions,
  checkIns,
}: {
  assignment: Assignment | null
  currentWeek: number | null
  workoutDays: WorkoutDay[]
  sessions: Session[]
  checkIns: CheckIn[]
}) {
  const recentSessions = sessions.slice(0, 5)
  const latestCheckIn = checkIns[0] ?? null
  const completedThisWeek = sessions.filter(s => {
    if (!s.completed_at) return false
    const d = new Date(s.completed_at)
    const now = new Date()
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - now.getDay())
    startOfWeek.setHours(0, 0, 0, 0)
    return d >= startOfWeek
  }).length

  return (
    <div className="flex flex-col gap-4">
      {/* Current program card */}
      {assignment ? (
        <div className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] p-5">
          <p className="font-barlow text-xs text-white/40 uppercase tracking-wider mb-1">Current Program</p>
          <p className="font-bebas text-2xl text-white tracking-wide">{assignment.training_cycles.name}</p>
          <div className="flex items-center gap-3 mt-2">
            <p className="font-barlow text-sm text-white/50">
              Week {currentWeek} of {assignment.training_cycles.num_weeks}
            </p>
            <span className="text-white/20">·</span>
            <p className="font-barlow text-sm text-white/50">
              Day {assignment.next_day_number} of {assignment.training_cycles.num_days}
            </p>
            <span className="text-white/20">·</span>
            <p className="font-barlow text-sm text-white/50">
              {completedThisWeek}/{assignment.training_cycles.num_days} this week
            </p>
          </div>
          {/* Progress bar */}
          {(() => {
            const total = assignment.training_cycles.num_weeks * assignment.training_cycles.num_days
            const pct = Math.min(100, Math.round(((assignment.next_day_number - 1) / total) * 100))
            return (
              <div className="mt-3 h-1.5 bg-[#2C2C2E] rounded-full overflow-hidden">
                <div className="h-full bg-[#C9A84C] rounded-full" style={{ width: `${pct}%` }} />
              </div>
            )
          })()}
        </div>
      ) : (
        <div className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] p-5 text-center">
          <p className="font-barlow text-sm text-white/30 italic">No active program assigned</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* This week's days */}
        {assignment && workoutDays.length > 0 && (
          <div className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] p-5">
            <p className="font-barlow text-xs text-white/40 uppercase tracking-wider mb-3">This Week</p>
            <div className="flex flex-col gap-2">
              {workoutDays.map(day => {
                const isDone = day.day_number < (assignment.next_day_number % assignment.training_cycles.num_days || assignment.training_cycles.num_days)
                  && currentWeek === Math.ceil(assignment.next_day_number / assignment.training_cycles.num_days)
                return (
                  <div key={day.id} className="flex items-center gap-2">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${isDone ? 'bg-green-500/20 text-green-400' : 'bg-[#2C2C2E] text-white/20'}`}>
                      {isDone ? '✓' : day.day_number}
                    </div>
                    <span className="font-barlow text-sm text-white/60 truncate">{day.name}</span>
                    {day.focus && day.focus !== 'rest_day' && (
                      <span className="font-barlow text-xs text-white/30 truncate">· {day.focus}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Latest check-in */}
        {latestCheckIn && (
          <div className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="font-barlow text-xs text-white/40 uppercase tracking-wider">Latest Check-in</p>
              <p className="font-barlow text-xs text-white/30">{fmtDate(latestCheckIn.week_start)}</p>
            </div>
            <div className="flex flex-col gap-2">
              {[
                { label: 'Sleep', val: latestCheckIn.sleep_quality },
                { label: 'Energy', val: latestCheckIn.energy_level },
                { label: 'Soreness', val: latestCheckIn.soreness_level },
                { label: 'Motivation', val: latestCheckIn.motivation },
              ].map(({ label, val }) => (
                <div key={label}>
                  <p className="font-barlow text-xs text-white/40 mb-1">{label}</p>
                  {scoreBar(val)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Recent sessions */}
      {recentSessions.length > 0 && (
        <div className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] p-5">
          <p className="font-barlow text-xs text-white/40 uppercase tracking-wider mb-3">Recent Sessions</p>
          <div className="flex flex-col divide-y divide-[#2C2C2E]">
            {recentSessions.map(s => (
              <div key={s.id} className="py-2.5 flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.completed_at ? 'bg-green-400' : 'bg-white/20'}`} />
                <div className="flex-1 min-w-0">
                  <p className="font-barlow text-sm text-white/80 truncate">
                    {s.workouts?.name ?? 'Session'}
                  </p>
                  {s.training_cycles && (
                    <p className="font-barlow text-xs text-white/30 truncate">{s.training_cycles.name}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-barlow text-xs text-white/40">{fmtDate(s.started_at)}</p>
                  {s.duration_min && (
                    <p className="font-barlow text-xs text-white/25">{s.duration_min}min</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Program Tab
// ─────────────────────────────────────────────────────────────────────────────

function ProgramTab({
  clientId,
  assignment,
  workoutDays,
  programHistory,
  navigate,
}: {
  clientId: string
  assignment: Assignment | null
  workoutDays: WorkoutDay[]
  programHistory: ProgramHistory[]
  navigate: ReturnType<typeof useNavigate>
}) {
  return (
    <div className="flex flex-col gap-4">
      {/* Active program */}
      <div className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="font-barlow text-xs text-white/40 uppercase tracking-wider">Active Program</p>
          <button
            onClick={() => navigate(`/trainer/programs/new?clientId=${clientId}`)}
            className="font-barlow text-xs text-[#C9A84C] hover:text-[#E2C070] transition-colors"
          >
            + Assign New
          </button>
        </div>

        {assignment ? (
          <>
            <div className="flex items-center gap-3 mb-4">
              <p className="font-bebas text-xl text-white tracking-wide">{assignment.training_cycles.name}</p>
              <span className="font-barlow text-xs text-white/40">
                {assignment.training_cycles.num_days}d/week · {assignment.training_cycles.num_weeks} weeks
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              {workoutDays.map(day => (
                <div key={day.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                  day.focus === 'rest_day' ? 'bg-transparent' : 'bg-[#2C2C2E]'
                }`}>
                  <span className={`font-bebas text-sm w-6 flex-shrink-0 ${day.focus === 'rest_day' ? 'text-white/25' : 'text-[#C9A84C]'}`}>
                    {day.day_number}
                  </span>
                  <span className={`font-barlow text-sm flex-1 ${day.focus === 'rest_day' ? 'text-white/25' : 'text-white/80'}`}>
                    {day.focus === 'rest_day' ? 'Rest Day' : day.name}
                  </span>
                  {day.focus && day.focus !== 'rest_day' && (
                    <span className="font-barlow text-xs text-white/35">{day.focus}</span>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => navigate(`/trainer/programs/${assignment.cycle_id}`)}
              className="mt-4 w-full font-barlow text-sm text-white/40 border border-[#2C2C2E] rounded-lg py-2 hover:text-white hover:border-[#3A3A3C] transition-colors"
            >
              Edit Program
            </button>
          </>
        ) : (
          <div className="text-center py-6">
            <p className="font-barlow text-sm text-white/30 italic mb-3">No active program</p>
            <button
              onClick={() => navigate(`/trainer/programs/new?clientId=${clientId}`)}
              className="bg-[#C9A84C] text-black font-bebas text-sm tracking-widest px-5 py-2.5 rounded-lg hover:bg-[#E2C070] transition-colors"
            >
              Build Program
            </button>
          </div>
        )}
      </div>

      {/* Program history */}
      {programHistory.length > 1 && (
        <div className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] p-5">
          <p className="font-barlow text-xs text-white/40 uppercase tracking-wider mb-3">Program History</p>
          <div className="flex flex-col divide-y divide-[#2C2C2E]">
            {programHistory.map(h => (
              <div key={h.id} className="py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-barlow text-sm text-white/70 truncate">{h.training_cycles.name}</p>
                  <p className="font-barlow text-xs text-white/30 mt-0.5">
                    {h.training_cycles.num_days}d/week · {h.training_cycles.num_weeks} weeks
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-barlow text-xs text-white/40">{fmtDate(h.started_at ?? h.created_at)}</p>
                  <span className={`font-barlow text-xs px-2 py-0.5 rounded-full ${
                    h.status === 'active' ? 'bg-green-500/20 text-green-400'
                    : h.status === 'completed' ? 'bg-white/10 text-white/40'
                    : 'bg-yellow-500/20 text-yellow-400'
                  }`}>
                    {h.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sessions Tab
// ─────────────────────────────────────────────────────────────────────────────

function SessionsTab({
  sessions,
  onRefresh,
}: {
  sessions: Session[]
  clientId: string
  trainerId: string
  onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [sessionDetail, setSessionDetail] = useState<Record<string, SessionExercise[]>>({})
  const [coachNote, setCoachNote] = useState<Record<string, string>>({})
  const [savingNote, setSavingNote] = useState<string | null>(null)

  useEffect(() => {
    const initial: Record<string, string> = {}
    sessions.forEach(s => { initial[s.id] = s.coach_notes ?? '' })
    setCoachNote(initial)
  }, [sessions])

  async function expandSession(sessionId: string) {
    if (expanded === sessionId) { setExpanded(null); return }
    setExpanded(sessionId)
    if (sessionDetail[sessionId]) return
    const { data } = await supabase
      .from('session_exercises')
      .select('id, exercise_id, order_index, notes, exercises(name), session_sets(id, set_number, reps_completed, weight_kg, rpe_actual, notes)')
      .eq('session_id', sessionId)
      .order('order_index')
    setSessionDetail(prev => ({ ...prev, [sessionId]: (data ?? []) as unknown as SessionExercise[] }))
  }

  async function saveCoachNote(sessionId: string) {
    setSavingNote(sessionId)
    await supabase.from('sessions').update({ coach_notes: coachNote[sessionId] || null }).eq('id', sessionId)
    setSavingNote(null)
    onRefresh()
  }

  if (sessions.length === 0) {
    return (
      <div className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] p-16 text-center">
        <p className="font-bebas text-xl text-white/20 tracking-wide">No Sessions Yet</p>
        <p className="font-barlow text-sm text-white/30 mt-1">Sessions will appear here once logged.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {sessions.map(s => {
        const isOpen = expanded === s.id
        const detail = sessionDetail[s.id] ?? []
        return (
          <div key={s.id} className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] overflow-hidden">
            {/* Row */}
            <button
              onClick={() => expandSession(s.id)}
              className="w-full px-5 py-4 flex items-center gap-3 text-left hover:bg-[#222] transition-colors"
            >
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.completed_at ? 'bg-green-400' : 'bg-white/20'}`} />
              <div className="flex-1 min-w-0">
                <p className="font-barlow font-semibold text-sm text-white truncate">
                  {s.workouts?.name ?? 'Session'}
                </p>
                {s.training_cycles && (
                  <p className="font-barlow text-xs text-white/35 truncate">{s.training_cycles.name}</p>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-barlow text-xs text-white/50">{fmtDate(s.started_at)}</p>
                {s.duration_min && (
                  <p className="font-barlow text-xs text-white/30">{s.duration_min}min</p>
                )}
              </div>
              <span className="font-barlow text-xs text-white/25 flex-shrink-0">{isOpen ? '▲' : '▼'}</span>
            </button>

            {/* Expanded detail */}
            {isOpen && (
              <div className="border-t border-[#2C2C2E] px-5 py-4 bg-[#171717]">
                {detail.length === 0 ? (
                  <p className="font-barlow text-sm text-white/30 italic">No exercises logged in this session.</p>
                ) : (
                  <div className="flex flex-col gap-4">
                    {detail.map(ex => (
                      <div key={ex.id}>
                        <p className="font-barlow font-semibold text-sm text-white/80 mb-2">
                          {(ex.exercises as { name: string } | null)?.name ?? 'Exercise'}
                        </p>
                        {ex.session_sets.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            <div className="grid grid-cols-4 gap-2 mb-1">
                              {['Set', 'Reps', 'Weight', 'RPE'].map(h => (
                                <p key={h} className="font-barlow text-xs text-white/30 uppercase tracking-wider">{h}</p>
                              ))}
                            </div>
                            {ex.session_sets.sort((a, b) => a.set_number - b.set_number).map(set => (
                              <div key={set.id} className="grid grid-cols-4 gap-2">
                                <p className="font-barlow text-sm text-white/50">{set.set_number}</p>
                                <p className="font-barlow text-sm text-white/70">{set.reps_completed ?? '—'}</p>
                                <p className="font-barlow text-sm text-white/70">{set.weight_kg != null ? `${set.weight_kg}kg` : '—'}</p>
                                <p className="font-barlow text-sm text-white/70">{set.rpe_actual ?? '—'}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="font-barlow text-xs text-white/25 italic">No sets logged</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Coach notes */}
                <div className="mt-4 pt-4 border-t border-[#2C2C2E]">
                  <p className="font-barlow text-xs text-[#C9A84C] font-semibold uppercase tracking-wider mb-2">Coach Notes</p>
                  <textarea
                    value={coachNote[s.id] ?? ''}
                    onChange={e => setCoachNote(prev => ({ ...prev, [s.id]: e.target.value }))}
                    placeholder="Add a note about this session..."
                    rows={2}
                    className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-lg px-3 py-2 font-barlow text-sm text-white/70 placeholder-white/20 resize-none outline-none focus:border-[#C9A84C]/40"
                  />
                  <button
                    onClick={() => saveCoachNote(s.id)}
                    disabled={savingNote === s.id}
                    className="mt-2 font-barlow text-xs text-[#C9A84C] hover:text-[#E2C070] transition-colors disabled:opacity-50"
                  >
                    {savingNote === s.id ? 'Saving...' : 'Save Note'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress Tab
// ─────────────────────────────────────────────────────────────────────────────

function ProgressTab({ sessions }: { sessions: Session[] }) {
  const completed = sessions.filter(s => s.completed_at).slice(0, 12).reverse()

  return (
    <div className="flex flex-col gap-4">
      {/* Sessions over time - simple bar chart */}
      <div className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] p-5">
        <p className="font-barlow text-xs text-white/40 uppercase tracking-wider mb-4">Session Activity (Last 12)</p>
        {completed.length === 0 ? (
          <p className="font-barlow text-sm text-white/30 italic text-center py-4">No completed sessions yet</p>
        ) : (
          <div className="flex items-end gap-1.5 h-24">
            {completed.map(s => (
              <div key={s.id} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-sm bg-[#C9A84C]/70"
                  style={{ height: `${Math.max(8, (s.duration_min ?? 45) / 90 * 100)}%` }}
                />
                <p className="font-barlow text-xs text-white/20 rotate-45 origin-left" style={{ fontSize: 9 }}>
                  {s.started_at ? new Date(s.started_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : ''}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] p-5 text-center">
        <p className="font-bebas text-lg text-white/20 tracking-wide">Progress Charts</p>
        <p className="font-barlow text-sm text-white/30 mt-1">1RM trends, body weight, and volume charts coming soon.</p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Check-ins Tab
// ─────────────────────────────────────────────────────────────────────────────

function CheckInsTab({ checkIns }: { checkIns: CheckIn[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (checkIns.length === 0) {
    return (
      <div className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] p-16 text-center">
        <p className="font-bebas text-xl text-white/20 tracking-wide">No Check-ins Yet</p>
        <p className="font-barlow text-sm text-white/30 mt-1">Weekly check-ins will appear here once submitted by the client.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {checkIns.map(ci => {
        const scores = [ci.sleep_quality, ci.energy_level, ci.soreness_level, ci.motivation].filter((v): v is number => v !== null)
        const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
        const isOpen = expanded === ci.id
        return (
          <div key={ci.id} className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] overflow-hidden">
            <button
              onClick={() => setExpanded(isOpen ? null : ci.id)}
              className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-[#222] transition-colors"
            >
              <div className="flex-1">
                <p className="font-barlow font-semibold text-sm text-white">Week of {fmtDate(ci.week_start)}</p>
                <p className="font-barlow text-xs text-white/40 mt-0.5">Avg score: {avg.toFixed(1)}/10</p>
              </div>
              {/* Mini score pills */}
              <div className="flex gap-1.5">
                {[
                  { label: 'Slp', val: ci.sleep_quality },
                  { label: 'Nrg', val: ci.energy_level },
                  { label: 'Srs', val: ci.soreness_level },
                  { label: 'Mot', val: ci.motivation },
                ].map(({ label, val }) => (
                  <div key={label} className="text-center">
                    <div className={`w-7 h-7 rounded-md flex items-center justify-center font-bebas text-sm ${
                      val === null ? 'bg-[#2C2C2E] text-white/25'
                      : val >= 7 ? 'bg-green-500/20 text-green-400'
                      : val >= 4 ? 'bg-yellow-500/20 text-yellow-400'
                      : 'bg-red-500/20 text-red-400'
                    }`}>
                      {val ?? '—'}
                    </div>
                    <p className="font-barlow text-white/30 mt-0.5" style={{ fontSize: 9 }}>{label}</p>
                  </div>
                ))}
              </div>
              <span className="font-barlow text-xs text-white/25">{isOpen ? '▲' : '▼'}</span>
            </button>

            {isOpen && (
              <div className="border-t border-[#2C2C2E] px-5 py-4 bg-[#171717]">
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  {[
                    { label: 'Sleep Quality', val: ci.sleep_quality },
                    { label: 'Energy Level', val: ci.energy_level },
                    { label: 'Stress Level', val: ci.stress_level },
                    { label: 'Soreness', val: ci.soreness_level },
                    { label: 'Motivation', val: ci.motivation },
                  ].map(({ label, val }) => (
                    <div key={label}>
                      <p className="font-barlow text-xs text-white/40 mb-1">{label}</p>
                      {scoreBar(val)}
                    </div>
                  ))}
                </div>
                {ci.notes && (
                  <div className="mt-4 pt-3 border-t border-[#2C2C2E]">
                    <p className="font-barlow text-xs text-white/40 mb-1">Client Notes</p>
                    <p className="font-barlow text-sm text-white/70">{ci.notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Metrics Tab
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_LIFTS = ['Squat', 'Bench Press', 'Deadlift']

function MetricsTab({
  maxes,
  clientId,
  trainerId,
  onRefresh,
}: {
  maxes: TrainingMax[]
  clientId: string
  trainerId: string
  onRefresh: () => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [editVal, setEditVal] = useState('')
  const [customName, setCustomName] = useState('')
  const [saving, setSaving] = useState(false)

  async function saveMax(exerciseName: string, kgVal: string) {
    setSaving(true)
    const kg = parseFloat(kgVal)
    if (isNaN(kg)) { setSaving(false); return }
    const existing = maxes.find(m => m.exercise_name === exerciseName)
    if (existing) {
      await supabase.from('training_maxes').update({ max_kg: kg, updated_at: new Date().toISOString() }).eq('id', existing.id)
    } else {
      await supabase.from('training_maxes').insert({ client_id: clientId, trainer_id: trainerId, exercise_name: exerciseName, max_kg: kg })
    }
    setSaving(false)
    setEditing(null)
    setEditVal('')
    onRefresh()
  }

  async function addCustomMax() {
    if (!customName.trim()) return
    await saveMax(customName.trim(), editVal)
    setCustomName('')
  }

  const allLifts = Array.from(new Set([...DEFAULT_LIFTS, ...maxes.map(m => m.exercise_name)]))

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] p-5">
        <p className="font-barlow text-xs text-white/40 uppercase tracking-wider mb-4">Training Maxes</p>
        <div className="flex flex-col divide-y divide-[#2C2C2E]">
          {allLifts.map(liftName => {
            const max = maxes.find(m => m.exercise_name === liftName)
            const isEditing = editing === liftName
            return (
              <div key={liftName} className="py-3 flex items-center gap-4">
                <p className="font-barlow text-sm text-white/70 flex-1">{liftName}</p>
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={editVal}
                      onChange={e => setEditVal(e.target.value)}
                      placeholder="kg"
                      autoFocus
                      className="w-20 bg-[#2C2C2E] border border-[#3A3A3C] rounded px-2 py-1 font-barlow text-sm text-white outline-none focus:border-[#C9A84C]/50 text-center"
                    />
                    <button
                      onClick={() => saveMax(liftName, editVal)}
                      disabled={saving}
                      className="font-barlow text-xs text-[#C9A84C] hover:text-[#E2C070] transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => { setEditing(null); setEditVal('') }}
                      className="font-barlow text-xs text-white/30 hover:text-white transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    {max ? (
                      <>
                        <p className="font-bebas text-lg text-white">{max.max_kg}
                          <span className="font-barlow text-xs text-white/40 ml-1">kg</span>
                        </p>
                        <p className="font-barlow text-xs text-white/25">{fmtDate(max.updated_at)}</p>
                      </>
                    ) : (
                      <p className="font-barlow text-sm text-white/25 italic">Not set</p>
                    )}
                    <button
                      onClick={() => { setEditing(liftName); setEditVal(max?.max_kg?.toString() ?? '') }}
                      className="font-barlow text-xs text-white/30 hover:text-[#C9A84C] transition-colors"
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Add custom lift */}
        <div className="pt-4 mt-2 border-t border-[#2C2C2E] flex gap-2">
          <input
            type="text"
            value={customName}
            onChange={e => setCustomName(e.target.value)}
            placeholder="Add lift..."
            className="flex-1 bg-[#2C2C2E] border border-[#3A3A3C] rounded-lg px-3 py-2 font-barlow text-sm text-white placeholder-white/25 outline-none focus:border-[#C9A84C]/50"
          />
          <input
            type="number"
            value={editing === '__custom__' ? editVal : ''}
            onChange={e => { setEditing('__custom__'); setEditVal(e.target.value) }}
            placeholder="kg"
            className="w-20 bg-[#2C2C2E] border border-[#3A3A3C] rounded-lg px-3 py-2 font-barlow text-sm text-white placeholder-white/25 outline-none focus:border-[#C9A84C]/50 text-center"
          />
          <button
            onClick={addCustomMax}
            disabled={saving || !customName.trim()}
            className="bg-[#C9A84C] text-black font-bebas text-sm tracking-widest px-4 py-2 rounded-lg hover:bg-[#E2C070] transition-colors disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Stub Tab
// ─────────────────────────────────────────────────────────────────────────────

function StubTab({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] p-16 text-center">
      <p className="font-bebas text-2xl text-white/20 tracking-wide mb-2">{title}</p>
      <p className="font-barlow text-sm text-white/30">{desc}</p>
    </div>
  )
}
