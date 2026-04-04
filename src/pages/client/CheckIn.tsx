import { useState, useEffect, useRef } from 'react'
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

function scoreColor(s: number | null): string {
  if (!s) return '#3A3A3C'
  if (s >= 4) return '#22c55e'
  if (s === 3) return '#C9A84C'
  return '#ef4444'
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

const SILHOUETTES: Record<PhotoAngle, JSX.Element> = {
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
// Compare Modal
// ─────────────────────────────────────────────────────────────────────────────

function CompareModal({
  checkIns,
  onClose,
}: {
  checkIns: CheckInRecord[]
  onClose: () => void
}) {
  const withPhotos = checkIns.filter(c => c.photo_front_url)
  const [leftId, setLeftId] = useState(withPhotos[0]?.id ?? '')
  const [rightId, setRightId] = useState(withPhotos[1]?.id ?? '')

  const left = withPhotos.find(c => c.id === leftId)
  const right = withPhotos.find(c => c.id === rightId)

  const metrics: { key: keyof CheckInRecord; label: string }[] = [
    { key: 'sleep_score', label: 'Sleep' },
    { key: 'nutrition_score', label: 'Nutrition' },
    { key: 'fatigue_score', label: 'Fatigue' },
    { key: 'soreness_score', label: 'Soreness' },
    { key: 'performance_score', label: 'Performance' },
  ]

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-4 pt-10 pb-4 border-b border-[#2C2C2E]">
        <h2 className="font-bebas text-2xl text-white tracking-wide">Compare</h2>
        <button onClick={onClose} className="text-white/40 hover:text-white text-3xl leading-none">×</button>
      </div>

      <div className="flex gap-3 px-4 py-4 flex-1">
        {[{ id: leftId, setId: setLeftId, record: left }, { id: rightId, setId: setRightId, record: right }].map((side, i) => (
          <div key={i} className="flex-1 flex flex-col gap-3">
            <select
              value={side.id}
              onChange={e => side.setId(e.target.value)}
              className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-xl px-3 py-2 font-barlow text-xs text-white outline-none"
            >
              {withPhotos.map(c => (
                <option key={c.id} value={c.id}>
                  Week of {getWeekRange(getMondayOfWeek(new Date(c.week_start + 'T00:00:00')))}
                </option>
              ))}
            </select>

            {side.record?.photo_front_url && (
              <img
                src={side.record.photo_front_url}
                alt="Progress"
                className="w-full aspect-[3/4] object-cover rounded-2xl"
              />
            )}

            <div className="flex flex-col gap-1.5">
              {metrics.map(m => {
                const val = side.record?.[m.key] as number | null
                return (
                  <div key={m.key} className="flex items-center justify-between">
                    <span className="font-barlow text-xs text-white/40">{m.label}</span>
                    <span
                      className="font-bebas text-base leading-none"
                      style={{ color: scoreColor(val) }}
                    >
                      {val ?? '—'}
                    </span>
                  </div>
                )
              })}
              {side.record?.body_weight && (
                <div className="flex items-center justify-between">
                  <span className="font-barlow text-xs text-white/40">Weight</span>
                  <span className="font-barlow text-xs text-white/70">{side.record.body_weight} lbs</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

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
  const [showCompare, setShowCompare] = useState(false)

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
      .select('id, trainer_id')
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
      trainer_id: clientRow.trainer_id,
      trainer_name: trainerRow?.full_name?.split(' ')[0] ?? 'Your coach',
    })

    const { data: ciRows } = await supabase
      .from('check_ins')
      .select('id, week_start, sleep_score, nutrition_score, fatigue_score, soreness_score, performance_score, body_weight, notes, coach_response, photo_front_url, photo_side_left_url, photo_side_right_url, photo_back_url')
      .eq('client_id', clientRow.id)
      .order('week_start', { ascending: false })

    setCheckIns((ciRows ?? []) as CheckInRecord[])
    setThisWeekDone((ciRows ?? []).some(c => c.week_start === thisMondayStr))
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

    const { error } = await supabase.from('check_ins').insert({
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
    })

    if (error) {
      setSubmitError(error.message)
      setSubmitting(false)
      return
    }

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
  const checkInsWithPhotos = checkIns.filter(c => c.photo_front_url)

  // ─────────────────────────────────────────────────────────────────────────
  // HISTORY STATE
  // ─────────────────────────────────────────────────────────────────────────

  if (thisWeekDone) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] pb-28">
        {showCompare && checkInsWithPhotos.length >= 2 && (
          <CompareModal checkIns={checkIns} onClose={() => setShowCompare(false)} />
        )}

        <div className="max-w-[390px] mx-auto px-4 pt-12">

          {/* Success banner */}
          <div className="flex items-center gap-3 border border-[#C9A84C]/30 bg-[#C9A84C]/8 rounded-2xl px-4 py-4 mb-5">
            <div className="w-9 h-9 rounded-full bg-[#C9A84C]/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-[#C9A84C]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="font-bebas text-xl text-white tracking-wide leading-none">This week is checked in.</p>
              <p className="font-barlow text-sm text-white/40 mt-0.5">{trainerName} will review it soon.</p>
            </div>
          </div>

          {/* Compare button */}
          {checkInsWithPhotos.length >= 2 && (
            <button
              onClick={() => setShowCompare(true)}
              className="w-full mb-4 border border-[#C9A84C]/30 bg-[#C9A84C]/8 rounded-2xl py-3.5 font-bebas text-lg text-[#C9A84C] tracking-wide hover:bg-[#C9A84C]/15 transition-colors min-h-[50px]"
            >
              Compare Progress Photos
            </button>
          )}

          {/* History */}
          <h2 className="font-bebas text-3xl text-white tracking-wide mb-4">Past Check-Ins</h2>

          <div className="flex flex-col gap-4">
            {checkIns.map(ci => {
              const scores = [
                { label: 'Sleep', val: ci.sleep_score },
                { label: 'Nutrition', val: ci.nutrition_score },
                { label: 'Fatigue', val: ci.fatigue_score },
                { label: 'Soreness', val: ci.soreness_score },
                { label: 'Performance', val: ci.performance_score },
              ]
              const monday = getMondayOfWeek(new Date(ci.week_start + 'T00:00:00'))
              const range = getWeekRange(monday)

              return (
                <div key={ci.id} className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl p-4">
                  {/* Header row */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-bebas text-base text-white tracking-wide">Week of {range}</p>
                      {ci.body_weight && (
                        <p className="font-barlow text-xs text-white/40 mt-0.5">{ci.body_weight} lbs</p>
                      )}
                    </div>
                    {ci.photo_front_url && (
                      <img
                        src={ci.photo_front_url}
                        alt="Progress"
                        className="w-14 h-14 rounded-xl object-cover flex-shrink-0 ml-3"
                      />
                    )}
                  </div>

                  {/* Score squares */}
                  <div className="flex gap-1.5 mb-3">
                    {scores.map(s => (
                      <div
                        key={s.label}
                        className="flex-1 flex flex-col items-center gap-1 rounded-lg py-2"
                        style={{ background: `${scoreColor(s.val)}18` }}
                      >
                        <span className="font-bebas text-base leading-none" style={{ color: scoreColor(s.val) }}>
                          {s.val ?? '—'}
                        </span>
                        <span className="font-barlow text-[9px] text-white/30">{s.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Notes */}
                  {ci.notes && (
                    <p className="font-barlow text-sm text-white/50 leading-relaxed line-clamp-2 mb-3 border-t border-[#2C2C2E] pt-3">
                      {ci.notes}
                    </p>
                  )}

                  {/* Coach response */}
                  {ci.coach_response && (
                    <div className="border-l-4 border-[#C9A84C] bg-[#C9A84C]/8 rounded-r-xl pl-3 pr-3 py-3">
                      <p className="font-barlow text-[11px] text-[#C9A84C] uppercase tracking-wider mb-1">Coach note:</p>
                      <p className="font-barlow text-sm text-white/70 leading-relaxed">{ci.coach_response}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUBMISSION STATE
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-28">
      <div className="max-w-[390px] mx-auto px-4 pt-12">

        {/* ── SECTION 1: HEADER ── */}
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

      </div>
    </div>
  )
}
