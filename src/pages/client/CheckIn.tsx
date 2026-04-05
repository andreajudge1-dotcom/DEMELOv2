import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CheckInRecord {
  id: string
  week_start: string
  sleep_score: number | null
  nutrition_score: number | null
  fatigue_score: number | null
  soreness_score: number | null
  performance_score: number | null
  body_weight: number | null
  notes: string | null
  coach_response: string | null
  photo_front_url: string | null
  photo_side_left_url: string | null
  photo_side_right_url: string | null
  photo_back_url: string | null
}

interface ClientInfo {
  id: string
  full_name: string
  trainer_id: string
  trainer_name: string
}

type PhotoAngle = 'front' | 'side_left' | 'side_right' | 'back'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function getWeekRange(monday: Date): string {
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `${monday.toLocaleDateString('en-US', opts)} – ${sunday.toLocaleDateString('en-US', opts)}`
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

// ─────────────────────────────────────────────────────────────────────────────
// Metric Card
// ─────────────────────────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string
  lowLabel: string
  highLabel: string
  value: number | null
  onChange: (v: number) => void
}

function MetricCard({ label, lowLabel, highLabel, value, onChange }: MetricCardProps) {
  return (
    <div className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl p-4" style={{ minHeight: 100 }}>
      <p className="font-bebas text-lg text-white tracking-wide mb-3">{label}</p>
      <div className="flex gap-2 mb-2">
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            onClick={() => onChange(n)}
            className="flex-1 rounded-xl font-barlow font-semibold text-base transition-all duration-150 flex items-center justify-center"
            style={{
              height: 52,
              minWidth: 44,
              background: value === n ? '#C9A84C' : '#2C2C2E',
              color: value === n ? '#000' : 'rgba(255,255,255,0.5)',
              border: value === n ? '2px solid #C9A84C' : '2px solid transparent',
            }}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between">
        <span className="font-barlow text-[11px] text-white/25">{lowLabel}</span>
        <span className="font-barlow text-[11px] text-white/25">{highLabel}</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Silhouette Icons
// ─────────────────────────────────────────────────────────────────────────────

function SilhouetteFront() {
  return (
    <svg viewBox="0 0 40 80" fill="none" className="w-8 h-16 opacity-30">
      <circle cx="20" cy="8" r="6" fill="#C9A84C" />
      <rect x="12" y="16" width="16" height="22" rx="4" fill="#C9A84C" />
      <rect x="4" y="16" width="7" height="18" rx="3" fill="#C9A84C" />
      <rect x="29" y="16" width="7" height="18" rx="3" fill="#C9A84C" />
      <rect x="13" y="39" width="6" height="24" rx="3" fill="#C9A84C" />
      <rect x="21" y="39" width="6" height="24" rx="3" fill="#C9A84C" />
    </svg>
  )
}

function SilhouetteSideLeft() {
  return (
    <svg viewBox="0 0 40 80" fill="none" className="w-8 h-16 opacity-30">
      <circle cx="22" cy="8" r="6" fill="#C9A84C" />
      <rect x="14" y="16" width="14" height="22" rx="4" fill="#C9A84C" />
      <rect x="6" y="18" width="7" height="16" rx="3" fill="#C9A84C" />
      <rect x="15" y="39" width="8" height="24" rx="3" fill="#C9A84C" />
      <rect x="24" y="42" width="7" height="21" rx="3" fill="#C9A84C" />
    </svg>
  )
}

function SilhouetteSideRight() {
  return (
    <svg viewBox="0 0 40 80" fill="none" className="w-8 h-16 opacity-30">
      <circle cx="18" cy="8" r="6" fill="#C9A84C" />
      <rect x="12" y="16" width="14" height="22" rx="4" fill="#C9A84C" />
      <rect x="27" y="18" width="7" height="16" rx="3" fill="#C9A84C" />
      <rect x="17" y="39" width="8" height="24" rx="3" fill="#C9A84C" />
      <rect x="9" y="42" width="7" height="21" rx="3" fill="#C9A84C" />
    </svg>
  )
}

function SilhouetteBack() {
  return (
    <svg viewBox="0 0 40 80" fill="none" className="w-8 h-16 opacity-30">
      <circle cx="20" cy="8" r="6" fill="#C9A84C" />
      <rect x="12" y="16" width="16" height="22" rx="4" fill="#C9A84C" />
      <rect x="4" y="16" width="7" height="18" rx="3" fill="#C9A84C" />
      <rect x="29" y="16" width="7" height="18" rx="3" fill="#C9A84C" />
      <rect x="13" y="39" width="6" height="24" rx="3" fill="#C9A84C" />
      <rect x="21" y="39" width="6" height="24" rx="3" fill="#C9A84C" />
    </svg>
  )
}

const SILHOUETTES: Record<PhotoAngle, React.ReactElement> = {
  front: <SilhouetteFront />,
  side_left: <SilhouetteSideLeft />,
  side_right: <SilhouetteSideRight />,
  back: <SilhouetteBack />,
}

const ANGLE_LABELS: Record<PhotoAngle, string> = {
  front: 'Front',
  side_left: 'Side Left',
  side_right: 'Side Right',
  back: 'Back',
}

const PHOTO_ANGLES: PhotoAngle[] = ['front', 'side_left', 'side_right', 'back']

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function CheckIn() {
  const { profile } = useAuth()
  const fileRefs = useRef<Record<PhotoAngle, HTMLInputElement | null>>({
    front: null, side_left: null, side_right: null, back: null,
  })

  const [loading, setLoading] = useState(true)
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null)
  const [checkIns, setCheckIns] = useState<CheckInRecord[]>([])
  const [thisWeekDone, setThisWeekDone] = useState(false)
  const [existingCheckInId, setExistingCheckInId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  // Form — wellness
  const [sleep, setSleep] = useState<number | null>(null)
  const [nutrition, setNutrition] = useState<number | null>(null)
  const [fatigue, setFatigue] = useState<number | null>(null)
  const [soreness, setSoreness] = useState<number | null>(null)
  const [performance, setPerformance] = useState<number | null>(null)

  // Form — body metrics
  const [bodyWeight, setBodyWeight] = useState('')
  const [showMeasurements, setShowMeasurements] = useState(false)
  const [waist, setWaist] = useState('')
  const [hips, setHips] = useState('')
  const [chest, setChest] = useState('')
  const [arms, setArms] = useState('')

  // Form — photos
  const [photos, setPhotos] = useState<Record<PhotoAngle, File | null>>({
    front: null, side_left: null, side_right: null, back: null,
  })
  const [previews, setPreviews] = useState<Record<PhotoAngle, string | null>>({
    front: null, side_left: null, side_right: null, back: null,
  })

  // Form — notes + submit
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const thisMonday = getMondayOfWeek(new Date())
  const thisMondayStr = toDateStr(thisMonday)
  const weekRange = getWeekRange(thisMonday)
  const allFilled = !!(sleep && nutrition && fatigue && soreness && performance)

  useEffect(() => {
    if (profile?.id) loadAll(profile.id)
  }, [profile])

  async function loadAll(userId: string) {
    setLoading(true)

    const { data: clientRow } = await supabase
      .from('clients')
      .select('id, full_name, trainer_id')
      .eq('profile_id', userId)
      .maybeSingle()

    if (!clientRow) { setLoading(false); return }

    const { data: trainerRow } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', clientRow.trainer_id)
      .maybeSingle()

    setClientInfo({
      id: clientRow.id,
      full_name: clientRow.full_name ?? '',
      trainer_id: clientRow.trainer_id,
      trainer_name: trainerRow?.full_name?.split(' ')[0] ?? 'Your coach',
    })

    const { data: ciRows } = await supabase
      .from('check_ins')
      .select('id, week_start, sleep_score, nutrition_score, fatigue_score, soreness_score, performance_score, body_weight, notes, coach_response, photo_front_url, photo_side_left_url, photo_side_right_url, photo_back_url')
      .eq('client_id', clientRow.id)
      .order('week_start', { ascending: false })

    setCheckIns((ciRows ?? []) as CheckInRecord[])
    const existingThisWeek = (ciRows ?? []).find(c => c.week_start === thisMondayStr)
    setThisWeekDone(!!existingThisWeek)
    setExistingCheckInId(existingThisWeek?.id ?? null)

    // Pre-fill form if already submitted
    if (existingThisWeek) {
      setSleep(existingThisWeek.sleep_score)
      setNutrition(existingThisWeek.nutrition_score)
      setFatigue(existingThisWeek.fatigue_score)
      setSoreness(existingThisWeek.soreness_score)
      setPerformance(existingThisWeek.performance_score)
      setBodyWeight(existingThisWeek.body_weight ? String(existingThisWeek.body_weight) : '')
      setNotes(existingThisWeek.notes ?? '')
    }

    setLoading(false)
  }

  function handlePhotoSelect(angle: PhotoAngle, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotos(prev => ({ ...prev, [angle]: file }))
    setPreviews(prev => ({ ...prev, [angle]: URL.createObjectURL(file) }))
  }

  function removePhoto(angle: PhotoAngle) {
    setPhotos(prev => ({ ...prev, [angle]: null }))
    setPreviews(prev => ({ ...prev, [angle]: null }))
  }

  async function uploadPhoto(angle: PhotoAngle, file: File): Promise<string | null> {
    if (!clientInfo) return null
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `checkins/${clientInfo.id}/${thisMondayStr}/${angle}.${ext}`
    const { error } = await supabase.storage
      .from('progress-photos')
      .upload(path, file, { upsert: true })
    if (error) return null
    const { data } = supabase.storage.from('progress-photos').getPublicUrl(path)
    return data.publicUrl
  }

  async function handleSubmit() {
    if (!allFilled || !clientInfo) return
    setSubmitting(true)
    setSubmitError('')

    // Upload photos in parallel
    const [frontUrl, sideLeftUrl, sideRightUrl, backUrl] = await Promise.all([
      photos.front ? uploadPhoto('front', photos.front) : Promise.resolve(null),
      photos.side_left ? uploadPhoto('side_left', photos.side_left) : Promise.resolve(null),
      photos.side_right ? uploadPhoto('side_right', photos.side_right) : Promise.resolve(null),
      photos.back ? uploadPhoto('back', photos.back) : Promise.resolve(null),
    ])

    const payload = {
      client_id: clientInfo.id,
      trainer_id: clientInfo.trainer_id,
      week_start: thisMondayStr,
      sleep_score: sleep,
      nutrition_score: nutrition,
      fatigue_score: fatigue,
      soreness_score: soreness,
      performance_score: performance,
      body_weight: bodyWeight ? parseFloat(bodyWeight) : null,
      waist_inches: waist ? parseFloat(waist) : null,
      hips_inches: hips ? parseFloat(hips) : null,
      chest_inches: chest ? parseFloat(chest) : null,
      arms_inches: arms ? parseFloat(arms) : null,
      notes: notes.trim() || null,
      photo_front_url: frontUrl,
      photo_side_left_url: sideLeftUrl,
      photo_side_right_url: sideRightUrl,
      photo_back_url: backUrl,
    }

    let error
    if (existingCheckInId) {
      // Update existing check-in
      const res = await supabase.from('check_ins').update(payload).eq('id', existingCheckInId)
      error = res.error
    } else {
      // Insert new check-in
      const res = await supabase.from('check_ins').insert(payload)
      error = res.error
    }

    if (error) {
      setSubmitError(error.message)
      setSubmitting(false)
      return
    }

    // Notify trainer
    await supabase.from('notifications').insert({
      profile_id: clientInfo.trainer_id,
      title: `${clientInfo.full_name} submitted their weekly check-in`,
      body: null,
      read_at: null,
    })

    setShowForm(false)
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
  // ALREADY SUBMITTED — show success card + option to update, unless showForm
  // ─────────────────────────────────────────────────────────────────────────

  const thisWeekRecord = checkIns.find(c => c.week_start === thisMondayStr)
  const submittedDate = thisWeekRecord
    ? new Date(thisWeekRecord.week_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-28">
      <div className="max-w-[390px] mx-auto px-4 pt-12">

        {/* ── Already submitted success card ── */}
        {thisWeekDone && !showForm && (
          <div className="mb-5">
            <div className="flex items-center gap-3 border border-green-500/30 bg-green-500/5 rounded-2xl px-4 py-4 mb-3">
              <div className="w-9 h-9 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="font-bebas text-xl text-white tracking-wide leading-none">You checked in this week</p>
                {submittedDate && (
                  <p className="font-barlow text-sm text-white/40 mt-0.5">Submitted {submittedDate}</p>
                )}
              </div>
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="w-full bg-[#1C1C1E] border border-[#C9A84C]/30 rounded-xl font-barlow text-sm text-[#C9A84C] py-3 hover:bg-[#C9A84C]/5 transition-colors"
            >
              Update my check-in
            </button>
          </div>
        )}

        {/* ── SECTION 1: HEADER + FORM ── */}
        {(!thisWeekDone || showForm) && (
        <>
        <div className="mb-6">
          <h1 className="font-bebas text-4xl text-white tracking-wide">Weekly Check-In</h1>
          <p className="font-barlow text-sm text-white/40 mt-1">{trainerName} reviews these every week.</p>
          <div className="mt-2 inline-flex items-center gap-2 bg-[#1C1C1E] border border-[#2C2C2E] rounded-full px-3 py-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[#C9A84C]" />
            <span className="font-barlow text-xs text-white/50">Week of {weekRange}</span>
          </div>
        </div>

        {/* ── SECTION 2: WELLNESS RATINGS ── */}
        <div className="mb-6">
          <h2 className="font-bebas text-2xl text-white tracking-wide mb-3">Wellness Ratings</h2>
          <div className="flex flex-col gap-3">
            <MetricCard label="Sleep Quality" lowLabel="Poor" highLabel="Excellent" value={sleep} onChange={setSleep} />
            <MetricCard label="Nutrition" lowLabel="Off track" highLabel="On point" value={nutrition} onChange={setNutrition} />
            <MetricCard label="Fatigue" lowLabel="Exhausted" highLabel="Fresh" value={fatigue} onChange={setFatigue} />
            <MetricCard label="Soreness" lowLabel="Very sore" highLabel="Feeling good" value={soreness} onChange={setSoreness} />
            <MetricCard label="Performance" lowLabel="Struggling" highLabel="Crushing it" value={performance} onChange={setPerformance} />
          </div>
        </div>

        {/* ── SECTION 3: BODY METRICS ── */}
        <div className="mb-6">
          <h2 className="font-bebas text-2xl text-white tracking-wide mb-3">Body Metrics</h2>
          <div className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl p-4">
            {/* Body weight */}
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1">
                <label className="font-barlow text-xs text-white/40 uppercase tracking-wider block mb-1.5">Body Weight</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={bodyWeight}
                    onChange={e => setBodyWeight(e.target.value)}
                    placeholder="0.0"
                    step="0.1"
                    className="w-full bg-[#2C2C2E] border border-[#3A3A3C] rounded-xl px-4 py-3 font-barlow text-2xl text-white placeholder-white/20 outline-none focus:border-[#C9A84C]/50 transition-colors"
                  />
                  <span className="font-barlow text-sm text-white/40 flex-shrink-0">lbs</span>
                </div>
              </div>
            </div>

            {/* Expandable measurements */}
            <button
              onClick={() => setShowMeasurements(v => !v)}
              className="flex items-center gap-2 font-barlow text-sm text-white/40 hover:text-white/70 transition-colors min-h-[44px]"
            >
              <span
                className="transition-transform duration-200"
                style={{ display: 'inline-block', transform: showMeasurements ? 'rotate(90deg)' : 'rotate(0deg)' }}
              >▶</span>
              {showMeasurements ? 'Hide measurements' : '+ Add measurements'}
            </button>

            {showMeasurements && (
              <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-[#2C2C2E]">
                {[
                  { label: 'Waist', val: waist, set: setWaist },
                  { label: 'Hips', val: hips, set: setHips },
                  { label: 'Chest', val: chest, set: setChest },
                  { label: 'Arms', val: arms, set: setArms },
                ].map(({ label, val, set }) => (
                  <div key={label}>
                    <label className="font-barlow text-xs text-white/40 uppercase tracking-wider block mb-1.5">
                      {label} <span className="normal-case text-white/25">in</span>
                    </label>
                    <input
                      type="number"
                      value={val}
                      onChange={e => set(e.target.value)}
                      placeholder="0.0"
                      step="0.1"
                      className="w-full bg-[#2C2C2E] border border-[#3A3A3C] rounded-xl px-3 py-2.5 font-barlow text-base text-white placeholder-white/20 outline-none focus:border-[#C9A84C]/50 transition-colors"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── SECTION 4: PROGRESS PHOTOS ── */}
        <div className="mb-6">
          <h2 className="font-bebas text-2xl text-white tracking-wide mb-1">Progress Photos</h2>
          <p className="font-barlow text-sm text-white/40 mb-3">Optional — helps {trainerName} track your visual progress.</p>

          <div className="grid grid-cols-2 gap-3">
            {PHOTO_ANGLES.map(angle => (
              <div key={angle} className="flex flex-col gap-1.5">
                <input
                  ref={el => { fileRefs.current[angle] = el }}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={e => handlePhotoSelect(angle, e)}
                />

                {previews[angle] ? (
                  <div className="relative rounded-2xl overflow-hidden" style={{ minHeight: 150 }}>
                    <img
                      src={previews[angle]!}
                      alt={ANGLE_LABELS[angle]}
                      className="w-full object-cover"
                      style={{ minHeight: 150 }}
                    />
                    <button
                      onClick={() => removePhoto(angle)}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 flex items-center justify-center text-white/70 hover:text-white text-lg leading-none"
                    >×</button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileRefs.current[angle]?.click()}
                    className="flex flex-col items-center justify-center gap-3 border border-dashed border-[#C9A84C]/30 rounded-2xl bg-[#1C1C1E] hover:border-[#C9A84C]/60 hover:bg-[#C9A84C]/5 transition-colors"
                    style={{ minHeight: 150 }}
                  >
                    {SILHOUETTES[angle]}
                    <span className="font-barlow text-xs text-white/25">Tap to add</span>
                  </button>
                )}

                <span className="font-barlow text-xs text-white/40 text-center">{ANGLE_LABELS[angle]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── SECTION 5: NOTES ── */}
        <div className="mb-6">
          <h2 className="font-bebas text-2xl text-white tracking-wide mb-3">Notes for {trainerName}</h2>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder={`How are you feeling overall this week? Anything ${trainerName} should know?`}
            rows={4}
            className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl px-4 py-4 font-barlow text-sm text-white placeholder-white/20 outline-none focus:border-[#C9A84C]/50 transition-colors resize-none"
            style={{ minHeight: 120 }}
          />
        </div>

        {/* ── SECTION 6: SUBMIT ── */}
        {submitError && (
          <p className="mb-3 font-barlow text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3">
            {submitError}
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={!allFilled || submitting}
          className="w-full bg-[#C9A84C] text-black font-bebas text-xl tracking-widest rounded-2xl py-4 hover:bg-[#E2C070] transition-colors min-h-[56px]"
          style={{ opacity: allFilled ? 1 : 0.4 }}
        >
          {submitting ? 'Submitting...' : 'Submit Check-In'}
        </button>

        {!allFilled && (
          <p className="font-barlow text-xs text-white/25 text-center mt-2 mb-4">
            Rate all 5 wellness metrics to continue
          </p>
        )}
        </>
        )}

        {/* ── CHECK-IN HISTORY ── */}
        {checkIns.length > 0 && (
          <div className="mt-8">
            <h2 className="font-bebas text-2xl text-white tracking-wide mb-4">Past Check-Ins</h2>
            <div className="flex flex-col gap-3">
              {checkIns.map(ci => {
                const monday = getMondayOfWeek(new Date(ci.week_start + 'T00:00:00'))
                const range = getWeekRange(monday)
                const scores = [
                  { label: 'Sleep', val: ci.sleep_score },
                  { label: 'Nutrition', val: ci.nutrition_score },
                  { label: 'Fatigue', val: ci.fatigue_score },
                  { label: 'Soreness', val: ci.soreness_score },
                  { label: 'Performance', val: ci.performance_score },
                ]

                return (
                  <div key={ci.id} className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl p-4">
                    {/* Week header */}
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-barlow text-sm font-semibold text-white">Week of {range}</p>
                      {ci.body_weight && (
                        <span className="font-barlow text-xs text-white/40">{ci.body_weight} lbs</span>
                      )}
                    </div>

                    {/* Score pills */}
                    <div className="flex gap-1.5 mb-3">
                      {scores.map(s => (
                        <div
                          key={s.label}
                          className={`flex-1 flex flex-col items-center gap-0.5 rounded-lg py-1.5 ${
                            s.val === null ? 'bg-[#2C2C2E]'
                            : s.val >= 4 ? 'bg-green-500/15'
                            : s.val === 3 ? 'bg-yellow-500/15'
                            : 'bg-red-500/15'
                          }`}
                        >
                          <span className={`font-bebas text-sm leading-none ${
                            s.val === null ? 'text-white/25'
                            : s.val >= 4 ? 'text-green-400'
                            : s.val === 3 ? 'text-yellow-400'
                            : 'text-red-400'
                          }`}>
                            {s.val ?? '—'}
                          </span>
                          <span className="font-barlow text-white/25" style={{ fontSize: 8 }}>{s.label}</span>
                        </div>
                      ))}
                    </div>

                    {/* Client notes */}
                    {ci.notes && (
                      <p className="font-barlow text-xs text-white/40 italic mb-3">{ci.notes}</p>
                    )}

                    {/* Coach response */}
                    {ci.coach_response && (
                      <div className="border-l-4 border-[#C9A84C] bg-[#C9A84C]/5 pl-3 pr-3 py-2 rounded-r-lg">
                        <p className="font-barlow text-[10px] text-[#C9A84C] uppercase tracking-wider mb-1">Coach response</p>
                        <p className="font-barlow text-sm text-white/70">{ci.coach_response}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
