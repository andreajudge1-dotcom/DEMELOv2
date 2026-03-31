import { useState } from 'react'

export type SetType = 'warmup' | 'working' | 'backoff' | 'drop' | 'myorep' | 'amrap' | 'tempo' | 'pause'

export interface SetPrescription {
  id?: string
  set_number: number
  set_type: SetType
  reps: string
  rpe_target: number | null
  load_modifier: number | null
  hold_seconds: number | null
  tempo: string
  cue: string
}

interface SetPrescriptionEditorProps {
  sets: SetPrescription[]
  onChange: (sets: SetPrescription[]) => void
  isUnilateral?: boolean
  perSide?: boolean
}

const SET_TYPES: SetType[] = ['warmup', 'working', 'backoff', 'drop', 'myorep', 'amrap', 'tempo', 'pause']

const SET_TYPE_COLORS: Record<SetType, { bg: string; text: string; border: string }> = {
  warmup:  { bg: 'rgba(59,130,246,0.15)',  text: '#60a5fa', border: 'rgba(59,130,246,0.3)'  },
  working: { bg: 'rgba(42,122,42,0.2)',    text: '#4ade80', border: 'rgba(42,122,42,0.3)'   },
  backoff: { bg: 'rgba(201,168,76,0.15)',  text: '#C9A84C', border: 'rgba(201,168,76,0.3)'  },
  drop:    { bg: 'rgba(249,115,22,0.15)',  text: '#fb923c', border: 'rgba(249,115,22,0.3)'  },
  myorep:  { bg: 'rgba(168,85,247,0.15)', text: '#c084fc', border: 'rgba(168,85,247,0.3)'  },
  amrap:   { bg: 'rgba(239,68,68,0.15)',  text: '#f87171', border: 'rgba(239,68,68,0.3)'   },
  tempo:   { bg: 'rgba(20,184,166,0.15)', text: '#2dd4bf', border: 'rgba(20,184,166,0.3)'  },
  pause:   { bg: 'rgba(236,72,153,0.15)', text: '#f472b6', border: 'rgba(236,72,153,0.3)'  },
}

function setPillStyle(type: SetType) {
  const c = SET_TYPE_COLORS[type]
  return {
    backgroundColor: c.bg,
    color: c.text,
    borderColor: c.border,
    borderWidth: '1px',
    borderStyle: 'solid',
  }
}

const SET_TYPE_DESCRIPTIONS: Record<SetType, string> = {
  warmup: 'Light load to prepare joints and muscles',
  working: 'Primary working sets at target intensity',
  backoff: 'Reduced load after top set — typically −10%',
  drop: 'Immediate load reduction, no rest',
  myorep: 'Rest-pause set — activate, rest 3 breaths, repeat',
  amrap: 'As many reps as possible at given load',
  tempo: 'Controlled eccentric and concentric timing',
  pause: 'Pause at bottom or mid-range of movement',
}

function defaultSet(setNumber: number): SetPrescription {
  return {
    set_number: setNumber,
    set_type: 'warmup',
    reps: '',
    rpe_target: null,
    load_modifier: null,
    hold_seconds: null,
    tempo: '',
    cue: '',
  }
}

export default function SetPrescriptionEditor({
  sets,
  onChange,
  isUnilateral = false,
  perSide = false,
}: SetPrescriptionEditorProps) {
  const [showTypePickerFor, setShowTypePickerFor] = useState<number | null>(null)
  const [showSecondaryFor, setShowSecondaryFor] = useState<number | null>(null)

  function addSet() {
    const newSet = defaultSet(sets.length + 1)
    // After first warmup, default to working
    if (sets.length > 0) newSet.set_type = 'working'
    onChange([...sets, newSet])
  }

  function removeSet(index: number) {
    const updated = sets
      .filter((_, i) => i !== index)
      .map((s, i) => ({ ...s, set_number: i + 1 }))
    onChange(updated)
  }

  function updateSet(index: number, field: keyof SetPrescription, value: unknown) {
    onChange(sets.map((s, i) => i === index ? { ...s, [field]: value } : s))
  }

  return (
    <div className="mt-2">
      {/* Set rows */}
      {sets.length > 0 && (
        <div className="mb-2">
          {/* Header */}
          <div className="grid grid-cols-[32px_110px_80px_80px_100px_32px] gap-2 px-1 mb-1">
            <div />
            <div className="font-barlow text-xs text-white/30 uppercase tracking-widest">Type</div>
            <div className="font-barlow text-xs text-white/30 uppercase tracking-widest">Reps</div>
            <div className="font-barlow text-xs text-white/30 uppercase tracking-widest">RPE</div>
            <div className="font-barlow text-xs text-white/30 uppercase tracking-widest">Load mod %</div>
            <div />
          </div>

          {sets.map((set, i) => (
            <div key={i} className="mb-1">
              <div className="grid grid-cols-[32px_110px_80px_80px_100px_32px] gap-2 items-center">
                {/* Set number */}
                <div className="font-barlow text-xs text-white/30 text-center">{set.set_number}</div>

                {/* Set type pill */}
                <div className="relative">
                  <button
                    onClick={() => setShowTypePickerFor(showTypePickerFor === i ? null : i)}
                    style={setPillStyle(set.set_type)}
                    className="w-full px-2 py-1.5 rounded-lg text-xs font-semibold font-barlow capitalize transition-colors"
                  >
                    {set.set_type}
                  </button>
                  {showTypePickerFor === i && (
                    <div className="absolute left-0 top-full mt-1 z-20 bg-[#1C1C1E] border border-[#3A3A3C] rounded-xl overflow-hidden w-52 shadow-xl max-h-64 overflow-y-auto">
                      {SET_TYPES.map(type => (
                        <button
                          key={type}
                          onClick={() => { updateSet(i, 'set_type', type); setShowTypePickerFor(null) }}
                          className={`w-full text-left px-3 py-2 hover:bg-[#2C2C2E] transition-colors ${set.set_type === type ? 'bg-[#2C2C2E]' : ''}`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              style={setPillStyle(type)}
                              className="text-xs font-semibold font-barlow capitalize px-2 py-0.5 rounded-full"
                            >
                              {type}
                            </span>
                          </div>
                          <div className="font-barlow text-xs text-white/30 mt-0.5 pl-0.5">
                            {SET_TYPE_DESCRIPTIONS[type]}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Reps */}
                <input
                  type="text"
                  placeholder="e.g. 8"
                  value={set.reps}
                  onChange={e => updateSet(i, 'reps', e.target.value)}
                  className="bg-[#0A0A0A] border border-[#2C2C2E] rounded-lg px-2 py-1.5 text-white font-barlow text-xs text-center focus:outline-none focus:border-[#C9A84C] transition-colors w-full"
                />

                {/* RPE */}
                <input
                  type="number"
                  placeholder="RPE"
                  step="0.5"
                  min="1"
                  max="10"
                  value={set.rpe_target ?? ''}
                  onChange={e => updateSet(i, 'rpe_target', e.target.value ? parseFloat(e.target.value) : null)}
                  className="bg-[#0A0A0A] border border-[#2C2C2E] rounded-lg px-2 py-1.5 text-white font-barlow text-xs text-center focus:outline-none focus:border-[#C9A84C] transition-colors w-full"
                />

                {/* Load modifier */}
                <input
                  type="number"
                  placeholder="e.g. −10"
                  step="2.5"
                  value={set.load_modifier ?? ''}
                  onChange={e => updateSet(i, 'load_modifier', e.target.value ? parseFloat(e.target.value) : null)}
                  className="bg-[#0A0A0A] border border-[#2C2C2E] rounded-lg px-2 py-1.5 text-white font-barlow text-xs text-center focus:outline-none focus:border-[#C9A84C] transition-colors w-full"
                />

                {/* Remove */}
                <button
                  onClick={() => removeSet(i)}
                  className="text-white/20 hover:text-[#E05555] transition-colors text-xs"
                >
                  ✕
                </button>
              </div>

              {/* Secondary options toggle */}
              <div className="pl-9 mt-1">
                <button
                  onClick={() => setShowSecondaryFor(showSecondaryFor === i ? null : i)}
                  className="font-barlow text-xs text-[#C9A84C]/50 hover:text-[#C9A84C] transition-colors"
                >
                  {showSecondaryFor === i ? '▲ Hide' : '▼ Hold / Tempo / Cue'}
                </button>

                {showSecondaryFor === i && (
                  <div className="mt-2 bg-[#0A0A0A] border border-[#2C2C2E] rounded-xl p-3 flex flex-col gap-3">
                    {/* Hold seconds */}
                    <div>
                      <label className="font-barlow text-xs text-white/30 uppercase tracking-widest block mb-1">Hold (seconds)</label>
                      <input
                        type="number"
                        placeholder="e.g. 2"
                        value={set.hold_seconds ?? ''}
                        onChange={e => updateSet(i, 'hold_seconds', e.target.value ? parseInt(e.target.value) : null)}
                        className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-lg px-3 py-2 text-white font-barlow text-sm focus:outline-none focus:border-[#C9A84C] transition-colors w-full"
                      />
                    </div>

                    {/* Tempo */}
                    <div>
                      <label className="font-barlow text-xs text-white/30 uppercase tracking-widest block mb-1">Tempo (eccentric.pause.concentric)</label>
                      <input
                        type="text"
                        placeholder="e.g. 3.1.1 or 4.2.1"
                        value={set.tempo}
                        onChange={e => updateSet(i, 'tempo', e.target.value)}
                        className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-lg px-3 py-2 text-white font-barlow text-sm focus:outline-none focus:border-[#C9A84C] transition-colors w-full"
                      />
                      <p className="font-barlow text-xs text-white/20 mt-1">3.1.1 = 3 second lower, 1 second pause, 1 second up</p>
                    </div>

                    {/* Coaching cue */}
                    <div>
                      <label className="font-barlow text-xs text-white/30 uppercase tracking-widest block mb-1">Set-specific coaching cue</label>
                      <textarea
                        placeholder="Optional cue specific to this set..."
                        value={set.cue}
                        onChange={e => updateSet(i, 'cue', e.target.value)}
                        rows={2}
                        className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-lg px-3 py-2 text-white font-barlow text-sm focus:outline-none focus:border-[#C9A84C] transition-colors w-full resize-none"
                      />
                    </div>

                    {/* Unilateral per side note */}
                    {isUnilateral && (
                      <div className="bg-[#E2C070]/10 border border-[#E2C070]/20 rounded-lg px-3 py-2">
                        <p className="font-barlow text-xs text-[#E2C070]/80">
                          {perSide ? 'Reps are per side — client will be prompted to log left and right separately.' : 'Unilateral exercise — client completes all reps on one side then switches.'}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add set button */}
      <button
        onClick={addSet}
        className="font-barlow text-xs text-[#C9A84C] hover:text-[#E2C070] transition-colors flex items-center gap-1"
      >
        + Add set
      </button>
    </div>
  )
}
