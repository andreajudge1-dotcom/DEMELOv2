import { useState } from 'react'
import { supabase } from '../lib/supabase'

interface PR {
  exercise_name: string
  pr_type: 'weight' | 'reps'
  value: number
}

interface SessionSummaryProps {
  role: 'trainer' | 'client'
  sessionId: string
  durationMin: number
  totalSets: number
  totalTonnage: number
  averageRpe: number | null
  prescribedRpeAvg: number | null
  prs: PR[]
  onDone: () => void
}

function formatDuration(min: number): string {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export default function SessionSummary({
  role,
  sessionId,
  durationMin,
  totalSets,
  totalTonnage,
  averageRpe,
  prescribedRpeAvg,
  prs,
  onDone,
}: SessionSummaryProps) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleDone() {
    setSaving(true)
    if (note.trim()) {
      const field = role === 'trainer' ? 'coach_notes' : 'notes'
      await supabase.from('sessions').update({ [field]: note.trim() }).eq('id', sessionId)
    }
    setSaving(false)
    onDone()
  }

  return (
    <div className="max-w-md mx-auto pt-8 px-4">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="font-bebas text-4xl text-white tracking-wide">Session Complete</h1>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] p-4 text-center">
          <p className="font-barlow text-xs text-white/40 uppercase tracking-wider mb-1">Duration</p>
          <p className="font-bebas text-2xl text-white">{formatDuration(durationMin)}</p>
        </div>
        <div className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] p-4 text-center">
          <p className="font-barlow text-xs text-white/40 uppercase tracking-wider mb-1">Sets Logged</p>
          <p className="font-bebas text-2xl text-white">{totalSets}</p>
        </div>
        <div className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] p-4 text-center">
          <p className="font-barlow text-xs text-white/40 uppercase tracking-wider mb-1">Total Tonnage</p>
          <p className="font-bebas text-2xl text-white">{totalTonnage.toLocaleString()} <span className="text-base text-white/40">lbs</span></p>
        </div>
        <div className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] p-4 text-center">
          <p className="font-barlow text-xs text-white/40 uppercase tracking-wider mb-1">Avg RPE</p>
          <p className="font-bebas text-2xl text-white">
            {averageRpe ?? '—'}
            {prescribedRpeAvg !== null && averageRpe !== null && (
              <span className="text-base text-white/30 ml-1">/ {prescribedRpeAvg}</span>
            )}
          </p>
        </div>
      </div>

      {/* PRs */}
      {prs.length > 0 && (
        <div className="bg-[#C9A84C]/10 border border-[#C9A84C]/20 rounded-xl p-4 mb-6">
          <p className="font-bebas text-lg text-[#C9A84C] tracking-wide mb-2">Personal Records</p>
          <div className="flex flex-col gap-2">
            {prs.map((pr, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="font-barlow text-sm text-white/70">{pr.exercise_name}</span>
                <span className="font-barlow text-sm font-semibold text-[#C9A84C]">
                  {pr.pr_type === 'weight' ? `${pr.value} lbs` : `${pr.value} reps`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Note input */}
      <div className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] p-4 mb-6">
        <p className="font-barlow text-xs text-white/40 uppercase tracking-wider mb-2">
          {role === 'client' ? 'Note for Josh' : 'Coach Notes'}
        </p>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder={role === 'client' ? 'How did the session feel?' : 'Notes about this session...'}
          rows={3}
          className="w-full bg-[#0A0A0A] border border-[#2C2C2E] rounded-lg px-3 py-2 font-barlow text-sm text-white placeholder-white/20 resize-none outline-none focus:border-[#C9A84C]/50"
        />
      </div>

      {/* Done button */}
      <button
        onClick={handleDone}
        disabled={saving}
        className="w-full bg-[#C9A84C] text-black font-bebas text-xl tracking-widest py-4 rounded-xl hover:bg-[#E2C070] transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Done'}
      </button>
    </div>
  )
}
