import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useUnsavedWarning } from '../../hooks/useUnsavedWarning'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CheckInRecord {
  id: string
  week_start: string
  created_at: string
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
}

type PhotoAngle = 'front' | 'side_left' | 'side_right' | 'back'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtDate(d: string): string {
  return new Date(d + (d.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtDateFull(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getWeekRange(weekStart: string): string {
  const monday = new Date(weekStart + 'T00:00:00')
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `${monday.toLocaleDateString('en-US', opts)} – ${sunday.toLocaleDateString('en-US', opts)}`
}

function getMondayOfWeek(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return d.toISOString().split('T')[0]
}

const PHOTO_ANGLES: PhotoAngle[] = ['front', 'side_left', 'side_right', 'back']
const ANGLE_LABELS: Record<PhotoAngle, string> = { front: 'Front', side_left: 'Side Left', side_right: 'Side Right', back: 'Back' }

// ─────────────────────────────────────────────────────────────────────────────
// Metric Card
// ─────────────────────────────────────────────────────────────────────────────

function MetricCard({ label, lowLabel, highLabel, value, onChange }: {
  label: string; lowLabel: string; highLabel: string; value: number | null; onChange: (v: number) => void
}) {
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
              height: 52, minWidth: 44,
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
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function CheckIn() {
  const { profile } = useAuth()
  const fileRefs = useRef<Record<PhotoAngle, HTMLInputElement | null>>({ front: null, side_left: null, side_right: null, back: null })

  const [view, setView] = useState<'history' | 'form'>('history')
  const [loading, setLoading] = useState(true)
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null)
  const [checkIns, setCheckIns] = useState<CheckInRecord[]>([])
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [showCompare, setShowCompare] = useState(false)
  const [compareLeft, setCompareLeft] = useState<string>('')
  const [compareRight, setCompareRight] = useState<string>('')
  const [compareAngle, setCompareAngle] = useState<PhotoAngle>('front')

  // Form state — always starts blank
  const [sleep, setSleep] = useState<number | null>(null)
  const [nutrition, setNutrition] = useState<number | null>(null)
  const [fatigue, setFatigue] = useState<number | null>(null)
  const [soreness, setSoreness] = useState<number | null>(null)
  const [performance, setPerformance] = useState<number | null>(null)
  const [bodyWeight, setBodyWeight] = useState('')
  const [showMeasurements, setShowMeasurements] = useState(false)
  const [waist, setWaist] = useState('')
  const [hips, setHips] = useState('')
  const [chest, setChest] = useState('')
  const [arms, setArms] = useState('')
  const [photos, setPhotos] = useState<Record<PhotoAngle, File | null>>({ front: null, side_left: null, side_right: null, back: null })
  const [previews, setPreviews] = useState<Record<PhotoAngle, string | null>>({ front: null, side_left: null, side_right: null, back: null })
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const allFilled = !!(sleep && nutrition && fatigue && soreness && performance)
  const hasUnsavedWork = !!(sleep || nutrition || fatigue || soreness || performance || bodyWeight || notes)
  useUnsavedWarning(view === 'form' && hasUnsavedWork)

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
    setClientInfo({ id: clientRow.id, full_name: clientRow.full_name ?? '', trainer_id: clientRow.trainer_id })

    const { data: ciRows } = await supabase
      .from('check_ins')
      .select('id, week_start, created_at, sleep_score, nutrition_score, fatigue_score, soreness_score, performance_score, body_weight, notes, coach_response, photo_front_url, photo_side_left_url, photo_side_right_url, photo_back_url')
      .eq('client_id', clientRow.id)
      .order('created_at', { ascending: false })
    setCheckIns((ciRows ?? []) as CheckInRecord[])
    setLoading(false)
  }

  function resetForm() {
    setSleep(null); setNutrition(null); setFatigue(null); setSoreness(null); setPerformance(null)
    setBodyWeight(''); setWaist(''); setHips(''); setChest(''); setArms('')
    setPhotos({ front: null, side_left: null, side_right: null, back: null })
    setPreviews({ front: null, side_left: null, side_right: null, back: null })
    setNotes(''); setSubmitError(''); setShowMeasurements(false)
  }

  function startNewCheckIn() {
    resetForm()
    setView('form')
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
    const ts = Date.now()
    const path = `checkins/${clientInfo.id}/${ts}/${angle}.${ext}`
    const { error } = await supabase.storage.from('progress-photos').upload(path, file, { upsert: true })
    if (error) return null
    const { data } = supabase.storage.from('progress-photos').getPublicUrl(path)
    return data.publicUrl
  }

  async function handleSubmit() {
    if (!allFilled || !clientInfo) return
    setSubmitting(true)
    setSubmitError('')

    const [frontUrl, sideLeftUrl, sideRightUrl, backUrl] = await Promise.all([
      photos.front ? uploadPhoto('front', photos.front) : Promise.resolve(null),
      photos.side_left ? uploadPhoto('side_left', photos.side_left) : Promise.resolve(null),
      photos.side_right ? uploadPhoto('side_right', photos.side_right) : Promise.resolve(null),
      photos.back ? uploadPhoto('back', photos.back) : Promise.resolve(null),
    ])

    const { error } = await supabase.from('check_ins').insert({
      client_id: clientInfo.id,
      trainer_id: clientInfo.trainer_id,
      week_start: getMondayOfWeek(new Date()),
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

    // Notify trainer
    await supabase.from('notifications').insert({
      profile_id: clientInfo.trainer_id,
      type: 'checkin_submitted',
      title: `${clientInfo.full_name} submitted a check-in`,
      read_at: null,
    })

    setSubmitting(false)
    resetForm()
    setView('history')
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

  // ─────────────────────────────────────────────────────────────────────────
  // STATE 2 — SUBMISSION FORM
  // ─────────────────────────────────────────────────────────────────────────

  if (view === 'form') {
    return (
      <div className="min-h-screen bg-[#0A0A0A] pb-28">
        <div className="max-w-[390px] mx-auto px-4 pt-8">

          {/* Back arrow */}
          <button onClick={() => setView('history')} className="font-barlow text-sm text-white/30 hover:text-white mb-4 transition-colors">
            ← Back
          </button>

          {/* Header */}
          <h1 className="font-bebas text-4xl text-white tracking-wide">New Check-In</h1>
          <p className="font-barlow text-sm text-white/40 mt-1 mb-6">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>

          {/* Wellness ratings */}
          <div className="flex flex-col gap-3 mb-6">
            <MetricCard label="Sleep Quality" lowLabel="Poor" highLabel="Excellent" value={sleep} onChange={setSleep} />
            <MetricCard label="Nutrition" lowLabel="Off track" highLabel="On point" value={nutrition} onChange={setNutrition} />
            <MetricCard label="Fatigue" lowLabel="Exhausted" highLabel="Energized" value={fatigue} onChange={setFatigue} />
            <MetricCard label="Soreness" lowLabel="Very sore" highLabel="None" value={soreness} onChange={setSoreness} />
            <MetricCard label="Performance" lowLabel="Struggled" highLabel="Crushed it" value={performance} onChange={setPerformance} />
          </div>

          {/* Body metrics */}
          <div className="mb-6">
            <h2 className="font-bebas text-2xl text-white tracking-wide mb-3">Body Metrics</h2>
            <div className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl p-4">
              <label className="font-barlow text-xs text-white/40 uppercase tracking-wider block mb-1.5">Body Weight</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={bodyWeight}
                  onChange={e => setBodyWeight(e.target.value)}
                  placeholder="0.0"
                  step="0.1"
                  className="flex-1 bg-[#2C2C2E] border border-[#3A3A3C] rounded-xl px-3 py-2.5 font-barlow text-base text-white placeholder-white/20 outline-none focus:border-[#C9A84C]/50"
                />
                <span className="font-barlow text-sm text-white/40">lbs</span>
              </div>

              <button
                onClick={() => setShowMeasurements(v => !v)}
                className="flex items-center gap-2 font-barlow text-sm text-white/40 hover:text-white/70 transition-colors mt-3 min-h-[44px]"
              >
                <span className="transition-transform duration-200" style={{ display: 'inline-block', transform: showMeasurements ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
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
                      <label className="font-barlow text-xs text-white/40 uppercase tracking-wider block mb-1.5">{label} <span className="normal-case text-white/25">in</span></label>
                      <input type="number" value={val} onChange={e => set(e.target.value)} placeholder="0.0" step="0.1"
                        className="w-full bg-[#2C2C2E] border border-[#3A3A3C] rounded-xl px-3 py-2.5 font-barlow text-base text-white placeholder-white/20 outline-none focus:border-[#C9A84C]/50" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Progress photos — 2x2 grid */}
          <div className="mb-6">
            <h2 className="font-bebas text-2xl text-white tracking-wide mb-3">Progress Photos</h2>
            <div className="grid grid-cols-2 gap-3">
              {PHOTO_ANGLES.map(angle => (
                <div key={angle}>
                  <input
                    ref={el => { fileRefs.current[angle] = el }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => handlePhotoSelect(angle, e)}
                  />
                  {previews[angle] ? (
                    <div className="relative">
                      <img src={previews[angle]!} alt={ANGLE_LABELS[angle]} className="w-full aspect-square object-cover rounded-xl" />
                      <button
                        onClick={() => removePhoto(angle)}
                        className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 flex items-center justify-center text-white/70 hover:text-white text-xs"
                      >×</button>
                      <p className="font-barlow text-[10px] text-white/30 text-center mt-1">{ANGLE_LABELS[angle]}</p>
                    </div>
                  ) : (
                    <button
                      onClick={() => fileRefs.current[angle]?.click()}
                      className="w-full aspect-square bg-[#1C1C1E] border border-[#2C2C2E] border-dashed rounded-xl flex flex-col items-center justify-center gap-2 hover:border-[#C9A84C]/30 transition-colors"
                    >
                      <svg className="w-6 h-6 text-white/15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                      </svg>
                      <span className="font-barlow text-[11px] text-white/25">{ANGLE_LABELS[angle]}</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="mb-6">
            <h2 className="font-bebas text-2xl text-white tracking-wide mb-3">Notes for Josh</h2>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="How are you feeling? Anything to mention?"
              rows={4}
              className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl px-4 py-4 font-barlow text-sm text-white placeholder-white/20 outline-none focus:border-[#C9A84C]/50 resize-none"
            />
          </div>

          {/* Submit */}
          {submitError && (
            <p className="mb-3 font-barlow text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3">{submitError}</p>
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
            <p className="font-barlow text-xs text-white/25 text-center mt-2">Rate all 5 wellness metrics to continue</p>
          )}
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STATE 1 — HISTORY VIEW (default)
  // ─────────────────────────────────────────────────────────────────────────

  const checkInsWithPhotos = checkIns.filter(ci => ci.photo_front_url || ci.photo_side_left_url || ci.photo_side_right_url || ci.photo_back_url)
  const canCompare = checkInsWithPhotos.length >= 2

  function getPhotoUrl(ci: CheckInRecord, angle: PhotoAngle): string | null {
    if (angle === 'front') return ci.photo_front_url
    if (angle === 'side_left') return ci.photo_side_left_url
    if (angle === 'side_right') return ci.photo_side_right_url
    return ci.photo_back_url
  }

  function openCompare() {
    setCompareLeft(checkInsWithPhotos[0]?.id ?? '')
    setCompareRight(checkInsWithPhotos[1]?.id ?? '')
    setCompareAngle('front')
    setShowCompare(true)
  }

  const leftCI = checkIns.find(c => c.id === compareLeft)
  const rightCI = checkIns.find(c => c.id === compareRight)

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-28">
      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setLightboxUrl(null)}>
          <button onClick={() => setLightboxUrl(null)} className="absolute top-6 right-6 text-white/50 hover:text-white text-3xl z-10">×</button>
          <img src={lightboxUrl} alt="Progress" className="max-w-full max-h-[85vh] object-contain rounded-xl" />
        </div>
      )}

      {/* Compare modal */}
      {showCompare && (
        <div className="fixed inset-0 bg-[#0A0A0A] z-50 flex flex-col overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-8 pb-4 border-b border-[#2C2C2E] flex-shrink-0">
            <h2 className="font-bebas text-2xl text-white tracking-wide">Compare Photos</h2>
            <button onClick={() => setShowCompare(false)} className="text-white/40 hover:text-white text-2xl">×</button>
          </div>

          <div className="flex-1 px-4 py-4">
            {/* Selectors */}
            <div className="flex gap-3 mb-4">
              <div className="flex-1">
                <p className="font-barlow text-[10px] text-white/30 uppercase tracking-wider mb-1">Left</p>
                <select
                  value={compareLeft}
                  onChange={e => setCompareLeft(e.target.value)}
                  className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-lg px-3 py-2 font-barlow text-xs text-white outline-none"
                >
                  {checkInsWithPhotos.map(ci => (
                    <option key={ci.id} value={ci.id}>
                      {getWeekRange(ci.week_start)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <p className="font-barlow text-[10px] text-white/30 uppercase tracking-wider mb-1">Right</p>
                <select
                  value={compareRight}
                  onChange={e => setCompareRight(e.target.value)}
                  className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-lg px-3 py-2 font-barlow text-xs text-white outline-none"
                >
                  {checkInsWithPhotos.map(ci => (
                    <option key={ci.id} value={ci.id}>
                      {getWeekRange(ci.week_start)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Angle selector */}
            <div className="flex gap-2 mb-5">
              {PHOTO_ANGLES.map(angle => (
                <button
                  key={angle}
                  onClick={() => setCompareAngle(angle)}
                  className={`flex-1 py-2 rounded-lg font-barlow text-xs font-semibold transition-colors ${
                    compareAngle === angle
                      ? 'bg-[#C9A84C] text-black'
                      : 'bg-[#2C2C2E] text-white/50 hover:text-white'
                  }`}
                >
                  {ANGLE_LABELS[angle]}
                </button>
              ))}
            </div>

            {/* Photos side by side */}
            <div className="flex gap-3">
              {[leftCI, rightCI].map((ci, idx) => {
                const url = ci ? getPhotoUrl(ci, compareAngle) : null
                return (
                  <div key={idx} className="flex-1">
                    {url ? (
                      <img src={url} alt={ANGLE_LABELS[compareAngle]} className="w-full aspect-[3/4] object-cover rounded-xl" />
                    ) : (
                      <div className="w-full aspect-[3/4] bg-[#1C1C1E] border border-[#2C2C2E] rounded-xl flex items-center justify-center">
                        <p className="font-barlow text-xs text-white/20 text-center px-2">No photo for this angle</p>
                      </div>
                    )}
                    {ci && (
                      <p className="font-barlow text-xs text-white/30 text-center mt-2">
                        {ci.created_at ? fmtDateFull(ci.created_at) : fmtDate(ci.week_start)}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-[390px] mx-auto px-4 pt-8">
        <h1 className="font-bebas text-3xl text-white tracking-wide mb-4">Check-Ins</h1>

        {/* Action buttons */}
        <div className={`flex gap-3 mb-6 ${canCompare ? '' : ''}`}>
          <button
            onClick={startNewCheckIn}
            className={`bg-[#C9A84C] text-black font-bebas text-lg tracking-widest rounded-2xl py-3.5 hover:bg-[#E2C070] transition-colors min-h-[50px] ${canCompare ? 'flex-1' : 'w-full'}`}
          >
            New Check-In
          </button>
          {canCompare && (
            <button
              onClick={openCompare}
              className="flex-1 bg-[#1C1C1E] border border-[#C9A84C]/40 text-[#C9A84C] font-bebas text-lg tracking-widest rounded-2xl py-3.5 hover:bg-[#C9A84C]/5 transition-colors min-h-[50px]"
            >
              Compare
            </button>
          )}
        </div>

        {/* Check-in history */}
        {checkIns.length === 0 ? (
          <div className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl p-8 text-center">
            <p className="font-barlow text-sm text-white/30">No check-ins yet. Tap New Check-In to get started.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {checkIns.map(ci => {
              const scores = [
                { label: 'Sleep', val: ci.sleep_score },
                { label: 'Nutr', val: ci.nutrition_score },
                { label: 'Fatigue', val: ci.fatigue_score },
                { label: 'Sore', val: ci.soreness_score },
                { label: 'Perf', val: ci.performance_score },
              ]
              const photoList = [
                { label: 'Front', url: ci.photo_front_url },
                { label: 'Side L', url: ci.photo_side_left_url },
                { label: 'Side R', url: ci.photo_side_right_url },
                { label: 'Back', url: ci.photo_back_url },
              ].filter(p => p.url)

              return (
                <div key={ci.id} className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl p-4">
                  {/* Week heading */}
                  <p className="font-barlow text-sm font-semibold text-white mb-0.5">
                    Week of {getWeekRange(ci.week_start)}
                  </p>
                  <p className="font-barlow text-xs text-white/30 mb-3">
                    Submitted {ci.created_at ? fmtDateFull(ci.created_at) : fmtDate(ci.week_start)}
                  </p>

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
                        }`}>{s.val ?? '—'}</span>
                        <span className="font-barlow text-white/25" style={{ fontSize: 8 }}>{s.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Body weight */}
                  {ci.body_weight && (
                    <p className="font-barlow text-xs text-white/40 mb-3">{ci.body_weight} lbs</p>
                  )}

                  {/* Photo thumbnails */}
                  {photoList.length > 0 && (
                    <div className="flex gap-2 mb-3">
                      {photoList.map(p => (
                        <button key={p.label} onClick={() => setLightboxUrl(p.url!)} className="group">
                          <img src={p.url!} alt={p.label} className="w-[72px] h-[72px] object-cover rounded-lg group-hover:ring-2 ring-[#C9A84C]/50 transition-all" />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Client notes */}
                  {ci.notes && (
                    <p className="font-barlow text-xs text-white/35 italic mb-3">{ci.notes}</p>
                  )}

                  {/* Coach response */}
                  {ci.coach_response ? (
                    <div className="border-l-4 border-[#C9A84C] bg-[#C9A84C]/5 pl-3 pr-3 py-2 rounded-r-lg">
                      <p className="font-barlow text-[10px] text-[#C9A84C] uppercase tracking-wider mb-1">Coach note</p>
                      <p className="font-barlow text-sm text-white/70">{ci.coach_response}</p>
                    </div>
                  ) : (
                    <p className="font-barlow text-xs text-white/20 italic">Awaiting coach response</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
