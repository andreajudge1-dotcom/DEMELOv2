import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CheckIn {
  id: string
  week_start: string
  sleep_quality: number | null
  energy_level: number | null
  stress_level: number | null
  soreness_level: number | null
  motivation: number | null
  notes: string | null
  coach_response: string | null
}

interface ClientInfo {
  id: string
  trainer_id: string
  trainer_name: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getMondayOfWeek(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

function formatWeekDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function scoreColor(score: number | null): string {
  if (!score) return '#3A3A3C'
  if (score >= 4) return '#22c55e'
  if (score === 3) return '#C9A84C'
  return '#ef4444'
}

function scoreLabel(score: number | null): string {
  if (!score) return '—'
  return String(score)
}

// ─────────────────────────────────────────────────────────────────────────────
// Score Selector Row
// ─────────────────────────────────────────────────────────────────────────────

function ScoreRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | null
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-barlow text-sm text-white/70 w-32 flex-shrink-0">{label}</span>
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            onClick={() => onChange(n)}
            className="w-10 h-10 rounded-full border font-barlow text-sm font-semibold transition-all duration-150 flex items-center justify-center"
            style={{
              borderColor: value === n ? '#C9A84C' : '#3A3A3C',
              background: value === n ? '#C9A84C' : 'transparent',
              color: value === n ? '#000' : 'rgba(255,255,255,0.4)',
            }}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Score Pill
// ─────────────────────────────────────────────────────────────────────────────

function ScorePill({ label, score }: { label: string; score: number | null }) {
  const color = scoreColor(score)
  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
      style={{ background: `${color}18`, border: `1px solid ${color}40` }}
    >
      <span className="font-barlow text-[10px] text-white/40">{label}</span>
      <span className="font-bebas text-sm leading-none" style={{ color }}>{scoreLabel(score)}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function CheckIn() {
  const { profile } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(true)
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null)
  const [checkIns, setCheckIns] = useState<CheckIn[]>([])
  const [thisWeekDone, setThisWeekDone] = useState(false)
  const [justSubmitted, setJustSubmitted] = useState(false)

  // Form state
  const [sleep, setSleep] = useState<number | null>(null)
  const [energy, setEnergy] = useState<number | null>(null)
  const [stress, setStress] = useState<number | null>(null)
  const [soreness, setSoreness] = useState<number | null>(null)
  const [motivation, setMotivation] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const thisMonday = getMondayOfWeek(new Date())
  const allFilled = sleep && energy && stress && soreness && motivation

  useEffect(() => {
    if (profile?.id) loadAll(profile.id)
  }, [profile])

  async function loadAll(userId: string) {
    setLoading(true)

    // Get client record
    const { data: clientRow } = await supabase
      .from('clients')
      .select('id, trainer_id')
      .eq('profile_id', userId)
      .maybeSingle()

    if (!clientRow) { setLoading(false); return }

    // Get trainer name
    const { data: trainerRow } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', clientRow.trainer_id)
      .maybeSingle()

    setClientInfo({
      id: clientRow.id,
      trainer_id: clientRow.trainer_id,
      trainer_name: trainerRow?.full_name?.split(' ')[0] ?? 'Your coach',
    })

    // Get all check-ins
    const { data: ciRows } = await supabase
      .from('check_ins')
      .select('id, week_start, sleep_quality, energy_level, stress_level, soreness_level, motivation, notes, coach_response')
      .eq('client_id', clientRow.id)
      .order('week_start', { ascending: false })

    setCheckIns((ciRows ?? []) as CheckIn[])
    setThisWeekDone((ciRows ?? []).some(c => c.week_start === thisMonday))
    setLoading(false)
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  async function handleSubmit() {
    if (!allFilled || !clientInfo) return
    setSubmitting(true)
    setSubmitError('')

    let photoUrl: string | null = null

    // Upload photo if provided
    if (photoFile) {
      const ext = photoFile.name.split('.').pop()
      const path = `checkins/${clientInfo.id}/${thisMonday}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('progress-photos')
        .upload(path, photoFile, { upsert: true })
      if (!uploadErr) {
        const { data: urlData } = supabase.storage
          .from('progress-photos')
          .getPublicUrl(path)
        photoUrl = urlData.publicUrl
      }
    }

    const { error: insertErr } = await supabase.from('check_ins').insert({
      client_id: clientInfo.id,
      trainer_id: clientInfo.trainer_id,
      week_start: thisMonday,
      sleep_quality: sleep,
      energy_level: energy,
      stress_level: stress,
      soreness_level: soreness,
      motivation,
      notes: notes.trim() || null,
      ...(photoUrl ? { photo_url: photoUrl } : {}),
    })

    if (insertErr) {
      setSubmitError(insertErr.message)
      setSubmitting(false)
      return
    }

    setJustSubmitted(true)
    setSubmitting(false)
    await loadAll(profile!.id)
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#C9A84C]/30 border-t-[#C9A84C] rounded-full animate-spin" />
      </div>
    )
  }

  const trainerName = clientInfo?.trainer_name ?? 'Your coach'

  // ─────────────────────────────────────────────────────────────────────────
  // SUBMISSION STATE
  // ─────────────────────────────────────────────────────────────────────────

  if (!thisWeekDone) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] pb-28">
        <div className="max-w-[390px] mx-auto px-4 pt-12">

          {/* Header */}
          <div className="mb-8">
            <h1 className="font-bebas text-5xl text-white tracking-wide leading-tight">
              How was<br />your week?
            </h1>
            <p className="font-barlow text-sm text-white/40 mt-2">
              {trainerName} reviews these every week.
            </p>
          </div>

          {/* Metrics */}
          <div className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl p-5 flex flex-col gap-5 mb-4">
            <ScoreRow label="Sleep Quality" value={sleep} onChange={setSleep} />
            <ScoreRow label="Nutrition" value={energy} onChange={setEnergy} />
            <ScoreRow label="Fatigue" value={stress} onChange={setStress} />
            <ScoreRow label="Soreness" value={soreness} onChange={setSoreness} />
            <ScoreRow label="Performance" value={motivation} onChange={setMotivation} />
          </div>

          {/* Notes */}
          <div className="mb-4">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={`Anything on your mind this week?`}
              rows={3}
              className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl px-4 py-3.5 font-barlow text-sm text-white placeholder-white/20 outline-none focus:border-[#C9A84C]/50 transition-colors resize-none"
            />
          </div>

          {/* Photo upload */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handlePhotoChange}
          />
          {photoPreview ? (
            <div className="mb-4 relative">
              <img src={photoPreview} alt="Preview" className="w-full rounded-2xl object-cover max-h-48" />
              <button
                onClick={() => { setPhotoFile(null); setPhotoPreview(null) }}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center text-white/60 hover:text-white"
              >×</button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full mb-4 border border-dashed border-[#3A3A3C] rounded-2xl py-4 flex items-center justify-center gap-2 text-white/30 hover:text-white/50 hover:border-[#C9A84C]/30 transition-colors min-h-[56px]"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="font-barlow text-sm">Add a progress photo</span>
            </button>
          )}

          {submitError && (
            <p className="mb-3 font-barlow text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              {submitError}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={!allFilled || submitting}
            className="w-full bg-[#C9A84C] text-black font-bebas text-xl tracking-widest rounded-2xl py-4 hover:bg-[#E2C070] transition-colors disabled:opacity-40 min-h-[56px]"
          >
            {submitting ? 'Submitting...' : 'Submit Check-In'}
          </button>
          {!allFilled && (
            <p className="font-barlow text-xs text-white/25 text-center mt-2">Rate all 5 metrics to continue</p>
          )}
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HISTORY STATE
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-28">
      <div className="max-w-[390px] mx-auto px-4 pt-12">

        {/* Success banner */}
        <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-2xl px-4 py-3.5 mb-6">
          <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="font-bebas text-lg text-white tracking-wide leading-none">Week checked in.</p>
            {justSubmitted && (
              <p className="font-barlow text-xs text-white/40 mt-0.5">
                {trainerName} will review it soon.
              </p>
            )}
          </div>
        </div>

        {/* Header */}
        <h2 className="font-bebas text-3xl text-white tracking-wide mb-4">Past Check-Ins</h2>

        {/* History list */}
        <div className="flex flex-col gap-3">
          {checkIns.map(ci => (
            <div key={ci.id} className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl p-5">
              {/* Week date */}
              <p className="font-barlow text-xs text-white/30 uppercase tracking-wider mb-3">
                Week of {formatWeekDate(ci.week_start)}
                {ci.week_start === thisMonday && (
                  <span className="ml-2 text-[#C9A84C]">· This week</span>
                )}
              </p>

              {/* Score pills */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                <ScorePill label="Sleep" score={ci.sleep_quality} />
                <ScorePill label="Nutrition" score={ci.energy_level} />
                <ScorePill label="Fatigue" score={ci.stress_level} />
                <ScorePill label="Soreness" score={ci.soreness_level} />
                <ScorePill label="Performance" score={ci.motivation} />
              </div>

              {/* Client notes */}
              {ci.notes && (
                <p className="font-barlow text-sm text-white/50 leading-relaxed mb-3 border-t border-[#2C2C2E] pt-3">
                  {ci.notes}
                </p>
              )}

              {/* Coach response */}
              {ci.coach_response && (
                <div className="bg-[#C9A84C]/8 border border-[#C9A84C]/20 rounded-xl px-4 py-3 mt-2">
                  <p className="font-barlow text-xs text-[#C9A84C] uppercase tracking-wider mb-1">Coach note:</p>
                  <p className="font-barlow text-sm text-white/70 leading-relaxed">{ci.coach_response}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
