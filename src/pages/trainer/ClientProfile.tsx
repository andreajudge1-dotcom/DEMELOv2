import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { parseTrainingDocument } from '../../utils/programParser'

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
  created_at: string
  sleep_score: number | null
  nutrition_score: number | null
  fatigue_score: number | null
  soreness_score: number | null
  performance_score: number | null
  body_weight: number | null
  waist_inches: number | null
  hips_inches: number | null
  chest_inches: number | null
  arms_inches: number | null
  notes: string | null
  coach_response: string | null
  photo_front_url: string | null
  photo_side_left_url: string | null
  photo_side_right_url: string | null
  photo_back_url: string | null
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
  is_active: boolean
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

function scoreBar(value: number | null, max = 10) {
  if (value === null) return null
  const pct = (value / max) * 100
  const color = max === 5
    ? (value >= 4 ? '#4ade80' : value === 3 ? '#facc15' : '#f87171')
    : (value >= 7 ? '#4ade80' : value >= 4 ? '#facc15' : '#f87171')
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-[#2C2C2E] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="font-barlow text-xs text-white/60 w-6 text-right">{value}/{max}</span>
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
  const [searchParams] = useSearchParams()
  const tabParam = searchParams.get('tab') as Tab | null

  const [activeTab, setActiveTab] = useState<Tab>(tabParam && TABS.includes(tabParam) ? tabParam : 'Overview')
  const [client, setClient] = useState<Client | null>(null)
  const [inviteSent, setInviteSent] = useState(false)
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [workoutDays, setWorkoutDays] = useState<WorkoutDay[]>([])
  const [programHistory, setProgramHistory] = useState<ProgramHistory[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [checkIns, setCheckIns] = useState<CheckIn[]>([])
  const [maxes, setMaxes] = useState<TrainingMax[]>([])
  const [loading, setLoading] = useState(true)
  const [stickyNote, setStickyNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showStartSession, setShowStartSession] = useState(false)
  const [sessionPackage, setSessionPackage] = useState<{ id: string; sessions_remaining: number } | null>(null)
  const [startingSession, setStartingSession] = useState(false)
  const [sessionModalStep, setSessionModalStep] = useState<1 | 2>(1)
  const [selectedDay, setSelectedDay] = useState<WorkoutDay | null>(null)
  const [dayExerciseCounts, setDayExerciseCounts] = useState<Record<string, number>>({})
  const [dayExerciseNames, setDayExerciseNames] = useState<Record<string, string[]>>({})

  const loadSessions = useCallback(async (cid: string) => {
    const { data } = await supabase
      .from('sessions')
      .select('id, workout_id, started_at, completed_at, coach_notes, workouts(name, day_number)')
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

  const loadAll = useCallback(async () => {
    if (!clientId) return
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
        .select('id, cycle_id, is_active, started_at, created_at, training_cycles(name, num_days, num_weeks)')
        .eq('client_id', cid)
        .order('created_at', { ascending: false }),
      supabase
        .from('sessions')
        .select('id, workout_id, started_at, completed_at, coach_notes, workouts(name, day_number)')
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
      const { data: wd } = await supabase
        .from('workouts')
        .select('id, day_number, name, focus')
        .eq('cycle_id', assignRes.data.cycle_id)
        .order('day_number')
      setWorkoutDays(wd ?? [])
    } else {
      setAssignment(null)
      setWorkoutDays([])
    }
    setProgramHistory((historyRes.data ?? []) as unknown as ProgramHistory[])
    setSessions((sessRes.data ?? []) as unknown as Session[])
    setCheckIns(checkRes.data ?? [])
    setMaxes(maxRes.data ?? [])
    setLoading(false)
  }, [clientId])

  useEffect(() => { loadAll() }, [loadAll])

  async function saveNote() {
    if (!clientId) return
    setSavingNote(true)
    await supabase.from('clients').update({ notes: stickyNote }).eq('id', clientId)
    setSavingNote(false)
  }

  async function handleDeleteClient() {
    if (!clientId) return
    setDeleting(true)
    await supabase.from('clients').delete().eq('id', clientId)
    navigate('/trainer/clients')
  }

  function handleSendInvite() {
    navigator.clipboard.writeText(`${window.location.origin}/register`)
    setInviteSent(true)
  }

  async function openStartSessionModal() {
    setSessionModalStep(1)
    setShowStartSession(true)

    // Default to suggested day
    const suggestedDay = assignment
      ? workoutDays.find(w => w.day_number === assignment.next_day_number) ?? workoutDays[0] ?? null
      : workoutDays[0] ?? null
    setSelectedDay(suggestedDay)

    // Load package info
    const { data } = await supabase
      .from('session_packages')
      .select('id, sessions_remaining')
      .eq('client_id', clientId!)
      .gt('sessions_remaining', 0)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setSessionPackage(data ?? null)

    // Load exercise counts + names per workout day
    if (workoutDays.length > 0) {
      const ids = workoutDays.map(d => d.id)
      const { data: weData } = await supabase
        .from('workout_exercises')
        .select('workout_id, exercises(name)')
        .in('workout_id', ids)
        .order('position')
      if (weData) {
        const counts: Record<string, number> = {}
        const names: Record<string, string[]> = {}
        weData.forEach((row: any) => {
          counts[row.workout_id] = (counts[row.workout_id] ?? 0) + 1
          if (!names[row.workout_id]) names[row.workout_id] = []
          if (row.exercises?.name) names[row.workout_id].push(row.exercises.name)
        })
        setDayExerciseCounts(counts)
        setDayExerciseNames(names)
      }
    }
  }

  async function confirmStartSession() {
    if (!clientId || !profile?.id || !selectedDay) return
    setStartingSession(true)

    const { data: newSession, error } = await supabase
      .from('sessions')
      .insert({
        client_id: clientId,
        trainer_id: profile.id,
        workout_id: selectedDay.id,
        cycle_id: assignment?.cycle_id ?? null,
        started_at: new Date().toISOString(),
        session_context: 'in_person',
        initiated_by: 'trainer',
        counts_against_package: !!sessionPackage,
        status: 'in_progress',
      })
      .select('id')
      .single()

    if (error) {
      console.error('Start session error:', error.message, error.details, error.hint, JSON.stringify(error))
      setStartingSession(false)
      return
    }

    if (sessionPackage) {
      await supabase
        .from('session_packages')
        .update({ sessions_remaining: sessionPackage.sessions_remaining - 1 })
        .eq('id', sessionPackage.id)
    }

    setShowStartSession(false)
    setStartingSession(false)
    navigate(`/trainer/session/${newSession.id}`)
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
      <div className="bg-white/[0.03] backdrop-blur-sm rounded-2xl border border-white/[0.06] p-6 mb-6">
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
            {/* Copy invite link — only shown if client isn't active yet */}
            {client?.email && client.status !== 'active' && (
              <button
                onClick={handleSendInvite}
                className={`font-barlow text-sm border rounded-lg px-3 py-2 transition-colors ${
                  inviteSent
                    ? 'border-green-500/30 text-green-400 bg-green-500/10'
                    : 'border-[#2C2C2E] text-white/60 hover:border-[#3A3A3C] hover:text-white'
                }`}
              >
                {inviteSent ? '✓ Link Copied' : '↗ Copy Invite Link'}
              </button>
            )}
            <button
              onClick={() => setActiveTab('Messages')}
              className="font-barlow text-sm text-white/60 border border-[#2C2C2E] rounded-lg px-3 py-2 hover:border-[#3A3A3C] hover:text-white transition-colors"
            >
              Message
            </button>
            <button
              onClick={openStartSessionModal}
              className="bg-[#C9A84C] text-black font-bebas text-sm tracking-widest px-4 py-2 rounded-lg hover:bg-[#E2C070] transition-colors"
            >
              Start Session
            </button>
            <button
              onClick={() => navigate(`/trainer/programs/new?clientId=${clientId}`)}
              className="font-barlow text-sm text-white/60 border border-[#2C2C2E] rounded-lg px-3 py-2 hover:border-[#3A3A3C] hover:text-white transition-colors"
            >
              Build Program
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="font-barlow text-sm text-red-400/60 hover:text-red-400 border border-red-500/20 hover:border-red-500/40 rounded-lg px-3 py-2 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* ── Delete Confirmation Modal ── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white/[0.03] backdrop-blur-sm rounded-2xl border border-white/[0.06] w-full max-w-sm p-6">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h2 className="font-bebas text-2xl text-white tracking-wide">Delete {client.full_name}?</h2>
            <p className="font-barlow text-sm text-white/50 mt-2">
              This will permanently delete this client and all their data — sessions, programs, check-ins, and messages. This cannot be undone.
            </p>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 font-barlow text-sm text-white/40 border border-[#2C2C2E] rounded-xl py-2.5 hover:text-white hover:border-[#3A3A3C] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteClient}
                disabled={deleting}
                className="flex-1 bg-red-500/80 hover:bg-red-500 text-white font-bebas text-sm tracking-widest py-2.5 rounded-xl transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Start Session 2-Step Modal ── */}
      {showStartSession && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white/[0.03] backdrop-blur-sm rounded-2xl border border-white/[0.06] w-full max-w-md flex flex-col max-h-[85vh]">

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/[0.06]">
              <div>
                <h2 className="font-bebas text-xl text-white tracking-wide">
                  {sessionModalStep === 1 ? 'Which day are you doing today?' : 'Confirm Session'}
                </h2>
                <p className="font-barlow text-xs text-white/40 mt-0.5">{client.full_name}</p>
              </div>
              <button
                onClick={() => setShowStartSession(false)}
                className="text-white/40 hover:text-white transition-colors text-xl"
              >×</button>
            </div>

            {sessionModalStep === 1 ? (
              <>
                {/* Step 1 — Day Selection */}
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
                  {workoutDays.length === 0 ? (
                    <p className="font-barlow text-sm text-white/30 text-center py-8 italic">No workout days in this program.</p>
                  ) : (
                    workoutDays.map(day => {
                      const isSuggested = assignment ? day.day_number === assignment.next_day_number : false
                      const isDone = sessions.some(s => s.workout_id === day.id && s.completed_at)
                      const isSelected = selectedDay?.id === day.id
                      const count = dayExerciseCounts[day.id] ?? 0
                      const statusLabel = isDone ? 'Done' : isSuggested ? 'Suggested' : 'Available'
                      const statusColor = isDone ? 'text-green-400 bg-green-500/15' : isSuggested ? 'text-[#C9A84C] bg-[#C9A84C]/15' : 'text-white/40 bg-white/5'

                      return (
                        <button
                          key={day.id}
                          onClick={() => setSelectedDay(day)}
                          className={`flex items-center gap-3 p-3.5 rounded-xl text-left transition-all border ${
                            isSelected
                              ? 'border-[#C9A84C] bg-[#C9A84C]/5'
                              : isSuggested
                                ? 'border-[#C9A84C]/30 bg-[#1C1C1E] hover:bg-[#2C2C2E]'
                                : 'border-[#2C2C2E] bg-[#1C1C1E] hover:bg-[#2C2C2E]'
                          }`}
                        >
                          {/* Day number */}
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                            isSelected ? 'bg-[#C9A84C] text-black' : 'bg-[#2C2C2E] text-white/50'
                          }`}>
                            <span className="font-bebas text-lg">{day.day_number}</span>
                          </div>

                          {/* Day info */}
                          <div className="flex-1 min-w-0">
                            <p className="font-barlow text-sm font-semibold text-white truncate">{day.name}</p>
                            <p className="font-barlow text-xs text-white/30 mt-0.5">
                              {count} exercise{count !== 1 ? 's' : ''}
                              {day.focus && day.focus !== 'rest_day' ? ` · ${day.focus}` : ''}
                            </p>
                          </div>

                          {/* Status badge */}
                          <span className={`font-barlow text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full flex-shrink-0 ${statusColor}`}>
                            {statusLabel}
                          </span>

                          {/* Selection indicator */}
                          {isSelected && (
                            <svg className="w-5 h-5 text-[#C9A84C] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      )
                    })
                  )}
                </div>

                {/* Step 1 footer */}
                <div className="p-4 border-t border-white/[0.06]">
                  <button
                    onClick={() => { if (selectedDay) setSessionModalStep(2) }}
                    disabled={!selectedDay}
                    className="w-full bg-[#C9A84C] text-black font-bebas text-sm tracking-widest py-3 rounded-xl hover:bg-[#E2C070] transition-colors disabled:opacity-30"
                  >
                    Next
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Step 2 — Confirmation */}
                <div className="flex-1 overflow-y-auto p-5">
                  {/* Selected day */}
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-[#C9A84C] text-black flex items-center justify-center flex-shrink-0">
                      <span className="font-bebas text-lg">{selectedDay?.day_number}</span>
                    </div>
                    <div>
                      <p className="font-bebas text-xl text-white tracking-wide">{selectedDay?.name}</p>
                      <p className="font-barlow text-xs text-white/40">{dayExerciseCounts[selectedDay?.id ?? ''] ?? 0} exercises</p>
                    </div>
                  </div>

                  {/* Exercise preview */}
                  {selectedDay && (dayExerciseNames[selectedDay.id] ?? []).length > 0 && (
                    <div className="bg-[#0A0A0A] rounded-lg border border-[#2C2C2E] p-3 mb-4">
                      {(dayExerciseNames[selectedDay.id] ?? []).slice(0, 3).map((name, i) => (
                        <div key={i} className="flex items-center gap-2 py-1.5">
                          <span className="font-barlow text-xs text-[#C9A84C] w-5 text-center">{i + 1}</span>
                          <span className="font-barlow text-sm text-white/70">{name}</span>
                        </div>
                      ))}
                      {(dayExerciseNames[selectedDay.id] ?? []).length > 3 && (
                        <p className="font-barlow text-xs text-white/25 pl-7 pt-1">
                          + {(dayExerciseNames[selectedDay.id] ?? []).length - 3} more
                        </p>
                      )}
                    </div>
                  )}

                  {/* Package info — only show if package exists */}
                  {sessionPackage && (
                    <div className="bg-[#C9A84C]/10 border border-[#C9A84C]/20 rounded-lg px-4 py-3">
                      <p className="font-barlow text-sm text-[#C9A84C]">
                        This will use <span className="font-semibold">1</span> of their <span className="font-semibold">{sessionPackage.sessions_remaining}</span> remaining sessions.
                      </p>
                    </div>
                  )}
                </div>

                {/* Step 2 footer */}
                <div className="p-4 border-t border-white/[0.06] flex gap-3">
                  <button
                    onClick={() => setSessionModalStep(1)}
                    disabled={startingSession}
                    className="flex-1 font-barlow text-sm text-white/40 border border-[#2C2C2E] rounded-xl py-2.5 hover:text-white hover:border-[#3A3A3C] transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={confirmStartSession}
                    disabled={startingSession}
                    className="flex-1 bg-[#C9A84C] text-black font-bebas text-sm tracking-widest py-2.5 rounded-xl hover:bg-[#E2C070] transition-colors disabled:opacity-50"
                  >
                    {startingSession ? 'Starting...' : 'Start Session'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-0 mb-6 border-b border-white/[0.06] overflow-x-auto">
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
              trainerId={profile?.id ?? ''}
              assignment={assignment}
              workoutDays={workoutDays}
              programHistory={programHistory}
              navigate={navigate}
              onAssigned={loadAll}
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
            <CheckInsTab checkIns={checkIns} clientId={clientId!} onRefresh={loadAll} />
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
            <VaultTab clientId={clientId!} trainerId={profile?.id ?? ''} />
          )}
        </div>

        {/* Sticky notes sidebar */}
        <div className="w-52 flex-shrink-0 hidden lg:block">
          <div className="bg-white/[0.03] backdrop-blur-sm rounded-xl border border-white/[0.06] p-4 sticky top-4">
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
        <div className="bg-white/[0.03] backdrop-blur-sm rounded-xl border border-white/[0.06] p-5">
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
        <div className="bg-white/[0.03] backdrop-blur-sm rounded-xl border border-white/[0.06] p-5 text-center">
          <p className="font-barlow text-sm text-white/30 italic">No active program assigned</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* This week's days */}
        {assignment && workoutDays.length > 0 && (
          <div className="bg-white/[0.03] backdrop-blur-sm rounded-xl border border-white/[0.06] p-5">
            <p className="font-barlow text-xs text-white/40 uppercase tracking-wider mb-3">This Week</p>
            <div className="flex flex-col gap-2">
              {workoutDays.map(day => {
                const isDone = sessions.some(s => s.workout_id === day.id && s.completed_at)
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
          <div className="bg-white/[0.03] backdrop-blur-sm rounded-xl border border-white/[0.06] p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="font-barlow text-xs text-white/40 uppercase tracking-wider">Latest Check-in</p>
              <p className="font-barlow text-xs text-white/30">{fmtDate(latestCheckIn.week_start)}</p>
            </div>
            <div className="flex flex-col gap-2">
              {[
                { label: 'Sleep', val: latestCheckIn.sleep_score },
                { label: 'Nutrition', val: latestCheckIn.nutrition_score },
                { label: 'Fatigue', val: latestCheckIn.fatigue_score },
                { label: 'Soreness', val: latestCheckIn.soreness_score },
                { label: 'Performance', val: latestCheckIn.performance_score },
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
        <div className="bg-white/[0.03] backdrop-blur-sm rounded-xl border border-white/[0.06] p-5">
          <p className="font-barlow text-xs text-white/40 uppercase tracking-wider mb-3">Recent Sessions</p>
          <div className="flex flex-col divide-y divide-white/[0.06]">
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
// Library Program type (for assign modal)
// ─────────────────────────────────────────────────────────────────────────────

interface LibraryProgram {
  id: string
  name: string
  num_days: number
  num_weeks: number
  cover_photo_url: string | null
  tags: string[] | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Program Tab
// ─────────────────────────────────────────────────────────────────────────────

function ProgramTab({
  clientId,
  trainerId,
  assignment,
  workoutDays,
  programHistory,
  navigate,
  onAssigned,
}: {
  clientId: string
  trainerId: string
  assignment: Assignment | null
  workoutDays: WorkoutDay[]
  programHistory: ProgramHistory[]
  navigate: ReturnType<typeof useNavigate>
  onAssigned: () => void
}) {
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [libraryPrograms, setLibraryPrograms] = useState<LibraryProgram[]>([])
  const [loadingLibrary, setLoadingLibrary] = useState(false)
  const [assigning, setAssigning] = useState<string | null>(null)
  const [assignError, setAssignError] = useState('')
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [exerciseCounts, setExerciseCounts] = useState<Record<string, number>>({})

  // Load exercise counts per workout day when assignment exists
  useEffect(() => {
    if (!workoutDays.length) return
    (async () => {
      const ids = workoutDays.map(d => d.id)
      const { data } = await supabase
        .from('workout_exercises')
        .select('workout_id')
        .in('workout_id', ids)
      if (!data) return
      const counts: Record<string, number> = {}
      data.forEach(row => { counts[row.workout_id] = (counts[row.workout_id] ?? 0) + 1 })
      setExerciseCounts(counts)
    })()
  }, [workoutDays])

  // All unique tags across the library
  const allTags = Array.from(new Set(libraryPrograms.flatMap(p => p.tags ?? []))).sort()

  // Filtered list based on search text + active tag
  const filteredPrograms = libraryPrograms.filter(p => {
    const q = search.toLowerCase()
    const matchesSearch = !q ||
      p.name.toLowerCase().includes(q) ||
      (p.tags ?? []).some(t => t.toLowerCase().includes(q))
    const matchesTag = !activeTag || (p.tags ?? []).includes(activeTag)
    return matchesSearch && matchesTag
  })

  async function openAssignModal() {
    setShowAssignModal(true)
    setSearch('')
    setActiveTag(null)
    setLoadingLibrary(true)
    const { data } = await supabase
      .from('training_cycles')
      .select('id, name, num_days, num_weeks, cover_photo_url, tags')
      .eq('trainer_id', trainerId)
      .order('name')
    setLibraryPrograms(data ?? [])
    setLoadingLibrary(false)
  }

  async function assignProgram(program: LibraryProgram) {
    if (assigning) return // Prevent double-click
    setAssigning(program.id)
    setAssignError('')
    try {
      // 1. Deep copy the library program into a new cycle
      const { data: newCycle, error: cycleErr } = await supabase
        .from('training_cycles')
        .insert({
          trainer_id: trainerId,
          name: program.name,
          description: null,
          cover_photo_url: program.cover_photo_url ?? null,
          num_days: program.num_days,
          num_weeks: program.num_weeks,
          is_template: false,
          tags: program.tags ?? [],
        })
        .select()
        .single()
      if (!newCycle) throw new Error(cycleErr?.message ?? 'Failed to create cycle copy')

      // 2. Copy workouts
      const { data: workouts } = await supabase
        .from('workouts')
        .select('id, day_number, name, focus')
        .eq('cycle_id', program.id)
        .order('day_number')

      for (const w of workouts ?? []) {
        const { data: newWorkout } = await supabase
          .from('workouts')
          .insert({ cycle_id: newCycle.id, day_number: w.day_number, name: w.name, focus: w.focus ?? null })
          .select()
          .single()
        if (!newWorkout) continue

        const { data: wes } = await supabase
          .from('workout_exercises')
          .select('id, exercise_id, position, superset_group, cue_override, notes')
          .eq('workout_id', w.id)
          .order('position')

        for (const we of wes ?? []) {
          const { data: newWE } = await supabase
            .from('workout_exercises')
            .insert({
              workout_id: newWorkout.id,
              exercise_id: we.exercise_id,
              position: we.position,
              superset_group: (we as any).superset_group ?? null,
              cue_override: (we as any).cue_override ?? null,
              notes: we.notes ?? null,
            })
            .select()
            .single()
          if (!newWE) continue

          const { data: sets } = await supabase
            .from('workout_set_prescriptions')
            .select('*')
            .eq('workout_exercise_id', we.id)
            .order('set_number')

          if (sets?.length) {
            await supabase.from('workout_set_prescriptions').insert(
              sets.map(s => ({
                workout_exercise_id: newWE.id,
                set_number: s.set_number,
                set_type: s.set_type,
                reps: s.reps ?? null,
                rpe_target: s.rpe_target ?? null,
                load_modifier: s.load_modifier ?? null,
                hold_seconds: s.hold_seconds ?? null,
                tempo: s.tempo ?? null,
                cue: s.cue ?? null,
              }))
            )
          }
        }
      }

      // 3. Deactivate existing assignment
      await supabase
        .from('client_cycle_assignments')
        .update({ is_active: false })
        .eq('client_id', clientId)
        .eq('is_active', true)

      // 4. Create new assignment
      const { error: assignErr } = await supabase.from('client_cycle_assignments').insert({
        client_id: clientId,
        cycle_id: newCycle.id,
        is_active: true,
        next_day_number: 1,
      })
      if (assignErr) throw new Error(assignErr.message)

      setShowAssignModal(false)
      onAssigned()
    } catch (err: any) {
      console.error('assignProgram error:', err)
      setAssignError(err?.message ?? 'Assignment failed')
    } finally {
      setAssigning(null)
    }
  }

  // Derived values for active program display
  const currentWeek = assignment
    ? Math.ceil(assignment.next_day_number / assignment.training_cycles.num_days)
    : null

  // ── Assign-from-Library modal (shared by empty + active states) ──
  const assignModal = showAssignModal && (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white/[0.03] backdrop-blur-sm rounded-2xl border border-white/[0.06] w-full max-w-lg max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/[0.06]">
          <h2 className="font-bebas text-xl text-white tracking-wide">Assign Program from Library</h2>
          <button
            onClick={() => setShowAssignModal(false)}
            className="text-white/40 hover:text-white transition-colors text-xl"
          >×</button>
        </div>

        {/* Error */}
        {assignError && (
          <p className="mx-4 mt-3 font-barlow text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {assignError}
          </p>
        )}

        {/* Search + tag filters */}
        {!loadingLibrary && libraryPrograms.length > 0 && (
          <div className="px-4 pt-3 pb-2 flex flex-col gap-2 border-b border-white/[0.06]">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or tag..."
              autoFocus
              className="w-full bg-[#2C2C2E] border border-[#3A3A3C] rounded-lg px-3 py-2 font-barlow text-sm text-white placeholder-white/30 outline-none focus:border-[#C9A84C]/50"
            />
            {allTags.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {allTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                    className={`font-barlow text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      activeTag === tag
                        ? 'bg-[#C9A84C] text-black border-[#C9A84C]'
                        : 'bg-transparent text-white/50 border-[#3A3A3C] hover:border-[#C9A84C]/50 hover:text-white/80'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Program list */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
          {loadingLibrary ? (
            <p className="font-barlow text-sm text-white/40 text-center py-8">Loading library...</p>
          ) : libraryPrograms.length === 0 ? (
            <p className="font-barlow text-sm text-white/40 text-center py-8 italic">No programs in library yet.</p>
          ) : filteredPrograms.length === 0 ? (
            <p className="font-barlow text-sm text-white/40 text-center py-8 italic">No programs match your search.</p>
          ) : (
            filteredPrograms.map(p => (
              <button
                key={p.id}
                onClick={() => assignProgram(p)}
                disabled={!!assigning}
                className="flex items-center gap-4 p-4 bg-[#2C2C2E] hover:bg-[#3A3A3C] rounded-xl border border-transparent hover:border-[#C9A84C]/30 transition-all text-left disabled:opacity-50"
              >
                {/* Thumbnail */}
                {p.cover_photo_url ? (
                  <img src={p.cover_photo_url} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-[#3A3A3C] flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h7" /></svg>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bebas text-base text-white tracking-wide truncate">{p.name}</p>
                  <p className="font-barlow text-xs text-white/40 mt-0.5">
                    {p.num_days}d/week · {p.num_weeks} weeks
                  </p>
                  {p.tags && p.tags.length > 0 && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {p.tags.map(tag => (
                        <span key={tag} className={`font-barlow text-[10px] px-2 py-0.5 rounded-full ${
                          tag === activeTag
                            ? 'bg-[#C9A84C]/25 text-[#C9A84C]'
                            : 'bg-[#C9A84C]/10 text-[#C9A84C]'
                        }`}>{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                {assigning === p.id ? (
                  <span className="font-barlow text-xs text-white/40 flex-shrink-0">Assigning...</span>
                ) : (
                  <span className="font-barlow text-xs text-[#C9A84C] flex-shrink-0">Assign →</span>
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/[0.06]">
          <button
            onClick={() => {
              setShowAssignModal(false)
              navigate(`/trainer/programs/new?clientId=${clientId}`)
            }}
            className="w-full bg-[#C9A84C] text-black font-bebas text-sm tracking-widest py-3 rounded-xl hover:bg-[#E2C070] transition-colors"
          >
            + Build New Program Instead
          </button>
        </div>
      </div>
    </div>
  )

  // ── No active program → two action cards ──
  if (!assignment) {
    return (
      <div className="flex flex-col gap-4">
        {assignModal}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card 1 — Assign from Library */}
          <div className="bg-white/[0.03] backdrop-blur-sm rounded-2xl border border-white/[0.06] p-6 flex flex-col items-center text-center">
            {/* Icon */}
            <div className="w-14 h-14 rounded-xl bg-[#C9A84C]/10 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-[#C9A84C]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="font-bebas text-xl text-white tracking-wide mb-1">Assign from Library</h3>
            <p className="font-barlow text-sm text-white/40 mb-5 leading-relaxed">
              Pick a program you've already built and assign it to this client.
            </p>
            <button
              onClick={openAssignModal}
              className="bg-[#C9A84C] text-black font-bebas text-sm tracking-widest px-6 py-2.5 rounded-lg hover:bg-[#E2C070] transition-colors"
            >
              Assign Program
            </button>
          </div>

          {/* Card 2 — Build New Program */}
          <div className="bg-white/[0.03] backdrop-blur-sm rounded-2xl border border-white/[0.06] p-6 flex flex-col items-center text-center">
            {/* Icon */}
            <div className="w-14 h-14 rounded-xl bg-[#C9A84C]/10 flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-[#C9A84C]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.42 15.17l-5.1-5.1m0 0L11.42 4.97m-5.1 5.1h13.32M4.93 19.07h14.14" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v1m6 11h-1.25M12 20v-1m-6-11h1.25M17.657 6.343l-.707.707M6.343 17.657l.707-.707M17.657 17.657l-.707-.707M6.343 6.343l.707.707" />
              </svg>
            </div>
            <h3 className="font-bebas text-xl text-white tracking-wide mb-1">Build New Program</h3>
            <p className="font-barlow text-sm text-white/40 mb-5 leading-relaxed">
              Create a program specifically for this client from scratch.
            </p>
            <button
              onClick={() => navigate(`/trainer/programs/new?clientId=${clientId}`)}
              className="bg-[#C9A84C] text-black font-bebas text-sm tracking-widest px-6 py-2.5 rounded-lg hover:bg-[#E2C070] transition-colors"
            >
              Build Program
            </button>
          </div>
        </div>

        {/* Program history */}
        {programHistory.length > 0 && (
          <div className="bg-white/[0.03] backdrop-blur-sm rounded-xl border border-white/[0.06] p-5">
            <p className="font-barlow text-xs text-white/40 uppercase tracking-wider mb-3">Program History</p>
            <div className="flex flex-col divide-y divide-white/[0.06]">
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
                      h.is_active ? 'bg-green-500/20 text-green-400'
                      : 'bg-white/10 text-white/40'
                    }`}>
                      {h.is_active ? 'active' : 'completed'}
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

  // ── Active program view ──
  return (
    <div className="flex flex-col gap-4">
      {assignModal}

      {/* Program details card */}
      <div className="bg-white/[0.03] backdrop-blur-sm rounded-xl border border-white/[0.06] p-5">
        <div className="flex items-center justify-between mb-1">
          <p className="font-barlow text-xs text-white/40 uppercase tracking-wider">Active Program</p>
          <span className="font-barlow text-xs px-2.5 py-1 rounded-full bg-green-500/20 text-green-400">Active</span>
        </div>
        <p className="font-bebas text-2xl text-white tracking-wide">{assignment.training_cycles.name}</p>

        {/* Stats row */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-2 mb-4">
          {currentWeek !== null && (
            <p className="font-barlow text-sm text-white/50">
              Week <span className="text-white/80 font-medium">{currentWeek}</span> of {assignment.training_cycles.num_weeks}
            </p>
          )}
          <p className="font-barlow text-sm text-white/50">
            <span className="text-white/80 font-medium">{assignment.training_cycles.num_days}</span> days/week
          </p>
          <p className="font-barlow text-sm text-white/50">
            Started {fmtDate(assignment.started_at ?? assignment.created_at)}
          </p>
        </div>

        {/* Progress bar */}
        {(() => {
          const total = assignment.training_cycles.num_weeks * assignment.training_cycles.num_days
          const pct = Math.min(100, Math.round(((assignment.next_day_number - 1) / total) * 100))
          return (
            <div className="h-1.5 bg-[#2C2C2E] rounded-full overflow-hidden mb-5">
              <div className="h-full bg-[#C9A84C] rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          )
        })()}

        {/* Workout days list */}
        <p className="font-barlow text-xs text-white/40 uppercase tracking-wider mb-2">Workout Days</p>
        <div className="flex flex-col gap-1.5">
          {workoutDays.map(day => {
            const count = exerciseCounts[day.id] ?? 0
            return (
              <div key={day.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${
                day.focus === 'rest_day' ? 'bg-transparent' : 'bg-[#2C2C2E]'
              }`}>
                <span className={`font-bebas text-sm w-6 flex-shrink-0 ${day.focus === 'rest_day' ? 'text-white/25' : 'text-[#C9A84C]'}`}>
                  {day.day_number}
                </span>
                <span className={`font-barlow text-sm flex-1 ${day.focus === 'rest_day' ? 'text-white/25' : 'text-white/80'}`}>
                  {day.focus === 'rest_day' ? 'Rest Day' : day.name}
                </span>
                {day.focus !== 'rest_day' && count > 0 && (
                  <span className="font-barlow text-xs text-white/30">{count} exercise{count !== 1 ? 's' : ''}</span>
                )}
                {day.focus && day.focus !== 'rest_day' && (
                  <span className="font-barlow text-xs text-white/35">{day.focus}</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 mt-5">
          <button
            onClick={openAssignModal}
            className="flex-1 font-barlow text-sm text-white/50 border border-[#2C2C2E] rounded-lg py-2.5 hover:text-white hover:border-[#3A3A3C] transition-colors"
          >
            Assign Different Program
          </button>
          <button
            onClick={() => navigate(`/trainer/programs/${assignment.cycle_id}`)}
            className="flex-1 bg-[#C9A84C] text-black font-bebas text-sm tracking-widest py-2.5 rounded-lg hover:bg-[#E2C070] transition-colors"
          >
            View Full Program
          </button>
        </div>
      </div>

      {/* Program history */}
      {programHistory.length > 1 && (
        <div className="bg-white/[0.03] backdrop-blur-sm rounded-xl border border-white/[0.06] p-5">
          <p className="font-barlow text-xs text-white/40 uppercase tracking-wider mb-3">Program History</p>
          <div className="flex flex-col divide-y divide-white/[0.06]">
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
                    h.is_active ? 'bg-green-500/20 text-green-400'
                    : 'bg-white/10 text-white/40'
                  }`}>
                    {h.is_active ? 'active' : 'completed'}
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
      <div className="bg-white/[0.03] backdrop-blur-sm rounded-xl border border-white/[0.06] p-16 text-center">
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
          <div key={s.id} className="bg-white/[0.03] backdrop-blur-sm rounded-xl border border-white/[0.06] overflow-hidden">
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
              <div className="border-t border-white/[0.06] px-5 py-4 bg-[#171717]">
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
                <div className="mt-4 pt-4 border-t border-white/[0.06]">
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
      <div className="bg-white/[0.03] backdrop-blur-sm rounded-xl border border-white/[0.06] p-5">
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

      <div className="bg-white/[0.03] backdrop-blur-sm rounded-xl border border-white/[0.06] p-5 text-center">
        <p className="font-bebas text-lg text-white/20 tracking-wide">Progress Charts</p>
        <p className="font-barlow text-sm text-white/30 mt-1">1RM trends, body weight, and volume charts coming soon.</p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Check-ins Tab
// ─────────────────────────────────────────────────────────────────────────────

function CheckInsTab({ checkIns, clientId, onRefresh }: { checkIns: CheckIn[]; clientId: string; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [replyText, setReplyText] = useState<Record<string, string>>({})
  const [savingReply, setSavingReply] = useState<string | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  async function saveReply(ciId: string) {
    const text = replyText[ciId]?.trim()
    if (!text) return
    setSavingReply(ciId)
    await supabase.from('check_ins').update({ coach_response: text }).eq('id', ciId)

    // Notify client
    const { data: clientRow } = await supabase.from('clients').select('profile_id').eq('id', clientId).single()
    if (clientRow) {
      await supabase.from('notifications').insert({
        profile_id: clientRow.profile_id,
        type: 'checkin_response',
        title: 'Josh responded to your check-in',
        read_at: null,
      })
    }

    setSavingReply(null)
    setReplyText(prev => { const next = { ...prev }; delete next[ciId]; return next })
    onRefresh()
  }

  if (checkIns.length === 0) {
    return (
      <div className="bg-white/[0.03] backdrop-blur-sm rounded-xl border border-white/[0.06] p-16 text-center">
        <p className="font-bebas text-xl text-white/20 tracking-wide">No Check-ins Yet</p>
        <p className="font-barlow text-sm text-white/30 mt-1">Weekly check-ins will appear here once submitted by the client.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setLightboxUrl(null)}>
          <button onClick={() => setLightboxUrl(null)} className="absolute top-6 right-6 text-white/50 hover:text-white text-3xl">×</button>
          <img src={lightboxUrl} alt="Progress" className="max-w-full max-h-[85vh] object-contain rounded-xl" />
        </div>
      )}

      {checkIns.map((ci, idx) => {
        const isOpen = expanded === ci.id

        const scoreItems = [
          { label: 'Sleep', abbr: 'Slp', val: ci.sleep_score },
          { label: 'Nutrition', abbr: 'Nut', val: ci.nutrition_score },
          { label: 'Fatigue', abbr: 'Fat', val: ci.fatigue_score },
          { label: 'Soreness', abbr: 'Sor', val: ci.soreness_score },
          { label: 'Performance', abbr: 'Per', val: ci.performance_score },
        ]

        const scores = scoreItems.map(s => s.val).filter((v): v is number => v !== null)
        const avg = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null
        const avgColor = avg === null ? 'bg-[#2C2C2E] text-white/25' : avg >= 4 ? 'bg-green-500/25 text-green-400' : avg >= 2.5 ? 'bg-yellow-500/25 text-yellow-400' : 'bg-red-500/25 text-red-400'

        // Trend: compare to previous check-in
        const prevCI = checkIns[idx + 1]
        let trendArrow: 'up' | 'down' | 'flat' = 'flat'
        if (prevCI && avg !== null) {
          const prevScores = [prevCI.sleep_score, prevCI.nutrition_score, prevCI.fatigue_score, prevCI.soreness_score, prevCI.performance_score].filter((v): v is number => v !== null)
          const prevAvg = prevScores.length > 0 ? prevScores.reduce((a, b) => a + b, 0) / prevScores.length : null
          if (prevAvg !== null) {
            if (avg > prevAvg + 0.05) trendArrow = 'up'
            else if (avg < prevAvg - 0.05) trendArrow = 'down'
          }
        }

        const allPhotos = [
          { label: 'Front', url: ci.photo_front_url },
          { label: 'Side L', url: ci.photo_side_left_url },
          { label: 'Side R', url: ci.photo_side_right_url },
          { label: 'Back', url: ci.photo_back_url },
        ]
        const photoCount = allPhotos.filter(p => p.url).length

        return (
          <div key={ci.id} className="bg-white/[0.03] backdrop-blur-sm rounded-xl border border-white/[0.06] overflow-hidden">
            {/* ── COLLAPSED HEADER ── */}
            <button
              onClick={() => setExpanded(isOpen ? null : ci.id)}
              className="w-full px-4 py-3.5 flex items-center gap-3 text-left hover:bg-[#222] transition-colors"
            >
              {/* Left: date info */}
              <div className="flex-1 min-w-0">
                <p className="font-barlow font-semibold text-sm text-white">Week of {fmtDate(ci.week_start)}</p>
                <p className="font-barlow text-xs text-white/30 mt-0.5">
                  Submitted {ci.created_at ? new Date(ci.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : fmtDate(ci.week_start)}
                </p>
                {/* Stats line */}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {ci.body_weight && <span className="font-barlow text-xs text-white/40">{ci.body_weight} lbs</span>}
                  {photoCount > 0 && <span className="font-barlow text-xs text-white/30">{photoCount} photo{photoCount > 1 ? 's' : ''}</span>}
                  {!ci.coach_response && <span className="font-barlow text-[10px] text-[#C9A84C]/70 bg-[#C9A84C]/10 px-1.5 py-0.5 rounded">Needs response</span>}
                </div>
              </div>

              {/* Right: overall score + trend */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Trend arrow */}
                <div className="w-4 flex items-center justify-center">
                  {trendArrow === 'up' && <span className="text-green-400 text-sm">↑</span>}
                  {trendArrow === 'down' && <span className="text-red-400 text-sm">↓</span>}
                  {trendArrow === 'flat' && <span className="text-white/20 text-sm">—</span>}
                </div>

                {/* Overall score circle */}
                <div className="text-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${avgColor}`}>
                    <span className="font-bebas" style={{ fontSize: 22 }}>{avg ?? '—'}</span>
                  </div>
                  <p className="font-barlow text-white/20 mt-0.5" style={{ fontSize: 8 }}>Overall</p>
                </div>

                {/* Expand arrow */}
                <span className="font-barlow text-xs text-white/20 ml-1">{isOpen ? '▲' : '▼'}</span>
              </div>
            </button>

            {/* ── EXPANDED DETAIL ── */}
            {isOpen && (
              <div className="border-t border-white/[0.06] px-5 py-4 bg-[#171717] flex flex-col gap-4">

                {/* Five metric rows with score dots */}
                <div className="flex flex-col gap-3">
                  {scoreItems.map(({ label, val }) => (
                    <div key={label} className="flex items-center justify-between">
                      <p className="font-barlow text-sm text-white/60">{label}</p>
                      <div className="flex gap-1.5">
                        {[1, 2, 3, 4, 5].map(n => {
                          const isSelected = val === n
                          const dotColor = isSelected
                            ? (n >= 4 ? 'bg-green-500 border-green-500' : n === 3 ? 'bg-yellow-500 border-yellow-500' : 'bg-red-500 border-red-500')
                            : 'bg-transparent border-[#3A3A3C]'
                          return (
                            <div key={n} className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${dotColor}`}>
                              {isSelected && <span className="font-barlow text-[10px] font-bold text-black">{n}</span>}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Body metrics */}
                {(ci.body_weight || ci.waist_inches || ci.hips_inches || ci.chest_inches || ci.arms_inches) && (
                  <div className="pt-3 border-t border-white/[0.06]">
                    <p className="font-barlow text-xs text-white/40 uppercase tracking-wider mb-2">Body Metrics</p>
                    <div className="flex flex-wrap gap-3">
                      {ci.body_weight && <span className="font-barlow text-sm text-white/70">Weight: <strong className="text-white">{ci.body_weight} lbs</strong></span>}
                      {ci.waist_inches && <span className="font-barlow text-sm text-white/70">Waist: <strong className="text-white">{ci.waist_inches}"</strong></span>}
                      {ci.hips_inches && <span className="font-barlow text-sm text-white/70">Hips: <strong className="text-white">{ci.hips_inches}"</strong></span>}
                      {ci.chest_inches && <span className="font-barlow text-sm text-white/70">Chest: <strong className="text-white">{ci.chest_inches}"</strong></span>}
                      {ci.arms_inches && <span className="font-barlow text-sm text-white/70">Arms: <strong className="text-white">{ci.arms_inches}"</strong></span>}
                    </div>
                  </div>
                )}

                {/* Photos — 2x2 grid, 80px, with placeholders */}
                <div className="pt-3 border-t border-white/[0.06]">
                  <p className="font-barlow text-xs text-white/40 uppercase tracking-wider mb-2">Progress Photos</p>
                  <div className="grid grid-cols-4 gap-2">
                    {allPhotos.map(p => (
                      <div key={p.label} className="flex flex-col items-center gap-1">
                        {p.url ? (
                          <button onClick={() => setLightboxUrl(p.url!)} className="group">
                            <img src={p.url} alt={p.label} className="w-20 h-20 object-cover rounded-lg group-hover:ring-2 ring-[#C9A84C]/50 transition-all" />
                          </button>
                        ) : (
                          <div className="w-20 h-20 bg-[#2C2C2E] rounded-lg flex items-center justify-center">
                            <span className="font-barlow text-[9px] text-white/15">No photo</span>
                          </div>
                        )}
                        <span className="font-barlow text-[10px] text-white/25">{p.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Client notes */}
                {ci.notes && (
                  <div className="pt-3 border-t border-white/[0.06]">
                    <p className="font-barlow text-xs text-white/40 uppercase tracking-wider mb-2">Client Notes</p>
                    <div className="border-l-4 border-white/10 pl-3 py-1">
                      <p className="font-barlow text-sm text-white/60 italic">{ci.notes}</p>
                    </div>
                  </div>
                )}

                {/* Coach response */}
                <div className="pt-3 border-t border-white/[0.06]">
                  {ci.coach_response && !(ci.id in replyText) ? (
                    <>
                      <p className="font-barlow text-xs text-[#C9A84C] uppercase tracking-wider mb-2">Your Response</p>
                      <div className="border-l-4 border-[#C9A84C] bg-[#C9A84C]/5 pl-3 pr-3 py-2 rounded-r-lg mb-2">
                        <p className="font-barlow text-sm text-white/70">{ci.coach_response}</p>
                      </div>
                      <button
                        onClick={() => setReplyText(prev => ({ ...prev, [ci.id]: ci.coach_response ?? '' }))}
                        className="font-barlow text-xs text-white/30 hover:text-[#C9A84C] transition-colors"
                      >
                        Edit response
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="font-barlow text-xs text-[#C9A84C] uppercase tracking-wider mb-2">
                        {ci.coach_response ? 'Edit Response' : 'Write your response'}
                      </p>
                      <textarea
                        value={replyText[ci.id] ?? ''}
                        onChange={e => setReplyText(prev => ({ ...prev, [ci.id]: e.target.value }))}
                        placeholder="Leave a note for your client..."
                        rows={3}
                        className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-xl px-3 py-2.5 font-barlow text-sm text-white placeholder-white/20 outline-none focus:border-[#C9A84C]/50 transition-colors resize-none"
                      />
                      <button
                        onClick={() => saveReply(ci.id)}
                        disabled={savingReply === ci.id || !replyText[ci.id]?.trim()}
                        className="mt-2 bg-[#C9A84C] text-black font-bebas text-sm tracking-widest px-5 py-2 rounded-lg hover:bg-[#E2C070] transition-colors disabled:opacity-40"
                      >
                        {savingReply === ci.id ? 'Saving...' : 'Send Response'}
                      </button>
                    </>
                  )}
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
  const [syncing, setSyncing] = useState(false)
  const [lastSynced, setLastSynced] = useState<string | null>(null)

  // On mount, auto-sync maxes from completed session data
  useEffect(() => {
    syncFromSessions()
  }, [clientId])

  async function syncFromSessions() {
    setSyncing(true)
    try {
      // Fetch all session_sets with weight > 0, joined through session_exercises → exercises → sessions
      const { data: sets } = await supabase
        .from('session_sets')
        .select(`
          weight_kg,
          session_exercises!inner(
            exercises!inner( name ),
            sessions!inner( client_id, completed_at )
          )
        `)
        .not('weight_kg', 'is', null)
        .gt('weight_kg', 0)
        .eq('session_exercises.sessions.client_id', clientId)
        .not('session_exercises.sessions.completed_at', 'is', null)

      if (!sets?.length) { setSyncing(false); return }

      // Build map of exercise_name → highest weight_kg
      const bestMap: Record<string, number> = {}
      for (const s of sets) {
        const se = s.session_exercises as any
        const exerciseName: string = se?.exercises?.name
        const weight = s.weight_kg as number
        if (!exerciseName) continue
        if (!bestMap[exerciseName] || weight > bestMap[exerciseName]) {
          bestMap[exerciseName] = weight
        }
      }

      // Upsert only if the recorded best is higher than what's stored
      for (const [exerciseName, bestKg] of Object.entries(bestMap)) {
        const existing = maxes.find(m => m.exercise_name === exerciseName)
        if (!existing || bestKg > (existing.max_kg ?? 0)) {
          await supabase.from('training_maxes').upsert(
            {
              client_id: clientId,
              trainer_id: trainerId,
              exercise_name: exerciseName,
              max_kg: bestKg,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'client_id,exercise_name' }
          )
        }
      }

      setLastSynced(new Date().toLocaleTimeString())
      onRefresh()
    } catch (err) {
      console.error('Sync error:', err)
    }
    setSyncing(false)
  }

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
      <div className="bg-white/[0.03] backdrop-blur-sm rounded-xl border border-white/[0.06] p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="font-barlow text-xs text-white/40 uppercase tracking-wider">Training Maxes</p>
          <div className="flex items-center gap-2">
            {syncing ? (
              <span className="font-barlow text-xs text-white/30 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 border border-[#C9A84C]/40 border-t-[#C9A84C] rounded-full animate-spin inline-block" />
                Syncing...
              </span>
            ) : (
              <>
                {lastSynced && <span className="font-barlow text-xs text-white/20">Synced {lastSynced}</span>}
                <button
                  onClick={syncFromSessions}
                  className="font-barlow text-xs text-white/30 hover:text-[#C9A84C] transition-colors"
                >
                  ↻ Sync from sessions
                </button>
              </>
            )}
          </div>
        </div>
        <div className="flex flex-col divide-y divide-white/[0.06]">
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
        <div className="pt-4 mt-2 border-t border-white/[0.06] flex gap-2">
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
// Vault Tab
// ─────────────────────────────────────────────────────────────────────────────

interface VaultDoc {
  id: string
  name: string
  file_url: string
  file_type: string | null
  file_size: number | null
  is_shared: boolean
  created_at: string
}

function fileIcon(ext: string | null) {
  const e = (ext ?? '').toLowerCase()
  if (e === 'pdf') return { color: 'text-red-400 bg-red-500/15', label: 'PDF' }
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(e)) return { color: 'text-blue-400 bg-blue-500/15', label: 'IMG' }
  if (['doc', 'docx'].includes(e)) return { color: 'text-purple-400 bg-purple-500/15', label: 'DOC' }
  return { color: 'text-white/40 bg-white/5', label: e.toUpperCase() || 'FILE' }
}

function fmtSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function VaultTab({ clientId, trainerId }: { clientId: string; trainerId: string }) {
  const navigate = useNavigate()
  const [docs, setDocs] = useState<VaultDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [parsingDocId, setParsingDocId] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadDocs() }, [])

  async function loadDocs() {
    const { data } = await supabase
      .from('vault_documents')
      .select('id, name, file_url, file_type, file_size, is_shared, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
    setDocs(data ?? [])
    setLoading(false)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)

    const ext = file.name.split('.').pop() ?? ''
    const ts = Date.now()
    const path = `vault/${clientId}/${ts}-${file.name}`

    const { error: uploadErr } = await supabase.storage
      .from('vault')
      .upload(path, file, { upsert: true })

    if (uploadErr) {
      console.error('Upload error:', uploadErr)
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage.from('vault').getPublicUrl(path)

    await supabase.from('vault_documents').insert({
      client_id: clientId,
      trainer_id: trainerId,
      name: file.name,
      title: file.name,
      file_url: urlData.publicUrl,
      file_type: ext,
      file_size: file.size,
      is_shared: false,
    })

    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
    await loadDocs()
  }

  async function toggleShare(doc: VaultDoc) {
    await supabase.from('vault_documents').update({ is_shared: !doc.is_shared }).eq('id', doc.id)
    setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, is_shared: !d.is_shared } : d))
  }

  async function confirmDelete() {
    if (!deleteId) return
    setDeleting(true)
    await supabase.from('vault_documents').delete().eq('id', deleteId)
    setDeleteId(null)
    setDeleting(false)
    await loadDocs()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-[#C9A84C]/30 border-t-[#C9A84C] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div>
      <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.heic,.txt,.csv,.xlsx" onChange={handleUpload} />

      {/* Delete confirmation */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white/[0.03] backdrop-blur-sm rounded-2xl border border-white/[0.06] w-full max-w-sm p-6">
            <p className="font-bebas text-xl text-white tracking-wide mb-2">Delete Document?</p>
            <p className="font-barlow text-sm text-white/50 mb-5">This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} disabled={deleting} className="flex-1 font-barlow text-sm text-white/40 border border-[#2C2C2E] rounded-xl py-2.5 hover:text-white transition-colors">Cancel</button>
              <button onClick={confirmDelete} disabled={deleting} className="flex-1 bg-red-500/80 hover:bg-red-500 text-white font-bebas text-sm tracking-widest py-2.5 rounded-xl transition-colors disabled:opacity-50">
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="font-barlow text-xs text-white/40 uppercase tracking-wider">Documents</p>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="bg-[#C9A84C] text-black font-bebas text-sm tracking-widest px-4 py-2 rounded-lg hover:bg-[#E2C070] transition-colors disabled:opacity-50"
        >
          {uploading ? 'Uploading...' : 'Upload Document'}
        </button>
      </div>

      {/* Document list */}
      {docs.length === 0 ? (
        <div className="bg-white/[0.03] backdrop-blur-sm rounded-xl border border-white/[0.06] p-12 text-center">
          <p className="font-barlow text-sm text-white/25">No documents yet. Upload files to share with this client.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {docs.map(doc => {
            const icon = fileIcon(doc.file_type)
            const isProgramFile = ['pdf', 'doc', 'docx'].includes((doc.file_type ?? '').toLowerCase())
            return (
              <div key={doc.id} className="bg-white/[0.03] backdrop-blur-sm rounded-xl border border-white/[0.06] p-4">
                <div className="flex items-center gap-3">
                  {/* File icon */}
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${icon.color}`}>
                    <span className="font-bebas text-xs">{icon.label}</span>
                  </div>

                  {/* Name + meta */}
                  <div className="flex-1 min-w-0">
                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="font-barlow text-sm font-semibold text-white hover:text-[#C9A84C] transition-colors truncate block">
                      {doc.name}
                    </a>
                    <p className="font-barlow text-xs text-white/30 mt-0.5">
                      {new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {doc.file_size ? ` · ${fmtSize(doc.file_size)}` : ''}
                    </p>
                  </div>

                  {/* Share toggle */}
                  <button
                    onClick={() => toggleShare(doc)}
                    className={`font-barlow text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      doc.is_shared
                        ? 'bg-green-500/15 text-green-400 border-green-500/30'
                        : 'bg-transparent text-white/30 border-[#3A3A3C] hover:text-white/60'
                    }`}
                  >
                    {doc.is_shared ? 'Shared' : 'Share'}
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => setDeleteId(doc.id)}
                    className="font-barlow text-xs text-red-400/40 hover:text-red-400 transition-colors"
                  >
                    Delete
                  </button>
                </div>

                {/* Convert banner for PDF/DOCX */}
                {isProgramFile && (
                  <div className="mt-3 bg-[#C9A84C]/5 border border-[#C9A84C]/20 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between">
                      <p className="font-barlow text-xs text-[#C9A84C]/70">This looks like a training program.</p>
                      <button
                        onClick={async () => {
                          setParsingDocId(doc.id)
                          setParseError(null)
                          const result = await parseTrainingDocument(doc.file_url, doc.name)
                          setParsingDocId(null)
                          if (result.success) {
                            navigate('/trainer/programs/new', { state: { parsedProgram: result.data, clientId } })
                          } else {
                            setParseError(result.error)
                          }
                        }}
                        disabled={parsingDocId === doc.id}
                        className="font-barlow text-xs text-[#C9A84C] font-semibold hover:text-[#E2C070] transition-colors disabled:opacity-50"
                      >
                        {parsingDocId === doc.id ? 'Parsing document...' : 'Convert to Program'}
                      </button>
                    </div>
                    {parseError && parsingDocId === null && (
                      <p className="font-barlow text-xs text-red-400 mt-1">{parseError}</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Stub Tab
// ─────────────────────────────────────────────────────────────────────────────

function StubTab({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="bg-white/[0.03] backdrop-blur-sm rounded-xl border border-white/[0.06] p-16 text-center">
      <p className="font-bebas text-2xl text-white/20 tracking-wide mb-2">{title}</p>
      <p className="font-barlow text-sm text-white/30">{desc}</p>
    </div>
  )
}
