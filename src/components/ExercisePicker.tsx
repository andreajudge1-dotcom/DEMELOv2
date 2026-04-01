import React, { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

interface Exercise {
  id: string
  name: string
  primary_muscle: string
  secondary_muscles: string[]
  equipment: string
  is_unilateral: boolean
  per_side: boolean
  movement_pattern: string
  difficulty: string
  default_cue: string
  custom_cue: string | null
}

interface ExercisePickerProps {
  onSelect: (exercise: Exercise) => void
  onClose: () => void
}

const MUSCLE_GROUPS = [
  'All', 'Quads', 'Hamstrings', 'Glutes', 'Calves',
  'Pecs', 'Lats', 'Traps', 'Erectors',
  'Delts', 'Biceps', 'Triceps', 'Forearms',
  'Core', 'Obliques', 'Compound', 'Cardio'
]

const DIFFICULTY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  beginner:     { bg: 'rgba(42,122,42,0.2)',   text: '#4ade80', border: 'rgba(42,122,42,0.3)'   },
  intermediate: { bg: 'rgba(201,168,76,0.15)', text: '#C9A84C', border: 'rgba(201,168,76,0.3)'  },
  advanced:     { bg: 'rgba(224,85,85,0.15)',  text: '#f87171', border: 'rgba(224,85,85,0.3)'   },
}

function difficultyStyle(d: string): React.CSSProperties {
  const c = DIFFICULTY_COLORS[d]
  if (!c) return {}
  return { backgroundColor: c.bg, color: c.text, borderColor: c.border, borderWidth: '1px', borderStyle: 'solid' }
}

export default function ExercisePicker({ onSelect, onClose }: ExercisePickerProps) {
  const { profile } = useAuth()
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [muscleFilter, setMuscleFilter] = useState('All')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    fetchExercises()
  }, [])

  async function fetchExercises() {
    const { data } = await supabase
      .from('exercises')
      .select('*')
      .or(`is_global.eq.true,trainer_id.eq.${profile?.id}`)
      .order('name')
    setExercises(data ?? [])
    setLoading(false)
  }

  const filtered = exercises.filter(ex => {
    const matchSearch = !search ||
      ex.name.toLowerCase().includes(search.toLowerCase()) ||
      ex.primary_muscle?.toLowerCase().includes(search.toLowerCase()) ||
      ex.equipment?.toLowerCase().includes(search.toLowerCase())
    const matchMuscle = muscleFilter === 'All' ||
      ex.primary_muscle?.toLowerCase() === muscleFilter.toLowerCase()
    return matchSearch && matchMuscle
  })

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1C1C1E] rounded-2xl border border-[#2C2C2E] w-full max-w-2xl flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="px-5 py-4 border-b border-[#2C2C2E] flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="font-bebas text-xl text-white tracking-wide">Add Exercise</h2>
            <p className="font-barlow text-xs text-white/40 mt-0.5">{filtered.length} exercises</p>
          </div>
          <button onClick={onClose} className="font-barlow text-sm text-white/40 hover:text-white">✕</button>
        </div>

        {/* Search */}
        <div className="px-4 pt-4 pb-2 flex-shrink-0">
          <input
            type="text"
            placeholder="Search exercises..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
            className="w-full bg-[#0A0A0A] border border-[#2C2C2E] rounded-lg px-4 py-2.5 text-white font-barlow text-sm placeholder:text-white/20 focus:outline-none focus:border-[#C9A84C] transition-colors"
          />
        </div>

        {/* Muscle tabs */}
        <div className="px-4 pb-3 flex gap-2 overflow-x-auto flex-shrink-0 scrollbar-hide">
          {MUSCLE_GROUPS.map(m => (
            <button
              key={m}
              onClick={() => setMuscleFilter(m)}
              className={`flex-shrink-0 px-3 py-1 rounded-full font-barlow text-xs font-semibold transition-colors ${
                muscleFilter === m
                  ? 'bg-[#C9A84C] text-black'
                  : 'bg-[#2C2C2E] text-white/50 hover:text-white'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Exercise list */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <p className="font-barlow text-sm text-white/40">Loading...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <p className="font-barlow text-sm text-white/20">No exercises found</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {filtered.map(ex => {
                const isExpanded = expandedId === ex.id
                const cue = ex.custom_cue || ex.default_cue

                return (
                  <div
                    key={ex.id}
                    className={`bg-[#141414] rounded-xl border transition-colors ${
                      isExpanded ? 'border-[#C9A84C]' : 'border-[#2C2C2E]'
                    }`}
                  >
                    {/* Main row — click to expand */}
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : ex.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-barlow text-sm font-semibold text-white">
                            {ex.name}
                          </span>
                          {ex.is_unilateral && (
                            <span className="font-barlow text-xs text-[#E2C070]/70">
                              · {ex.per_side ? 'Per side' : 'Unilateral'}
                            </span>
                          )}
                          {ex.custom_cue && (
                            <span className="font-barlow text-xs px-1.5 py-0.5 rounded-full bg-[#2A7A2A]/20 text-[#4ade80] border border-[#2A7A2A]/30">
                              Custom cue
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="font-barlow text-xs text-white/40 capitalize">{ex.primary_muscle}</span>
                          {ex.equipment && <span className="font-barlow text-xs text-white/25">· {ex.equipment}</span>}
                          {ex.movement_pattern && (
                            <span className="font-barlow text-xs text-white/25 capitalize">
                              · {ex.movement_pattern.replace('-', ' ')}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {ex.difficulty && (
                          <span
                            style={difficultyStyle(ex.difficulty)}
                            className="font-barlow text-xs px-2 py-0.5 rounded-full capitalize"
                          >
                            {ex.difficulty}
                          </span>
                        )}
                        <span className="text-white/30 text-xs">{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="border-t border-[#2C2C2E] px-4 py-4">
                        {ex.secondary_muscles?.length > 0 && (
                          <div className="mb-3">
                            <p className="font-barlow text-xs text-white/40 uppercase tracking-widest mb-1">Secondary muscles</p>
                            <div className="flex gap-2 flex-wrap">
                              {ex.secondary_muscles.map(m => (
                                <span key={m} className="font-barlow text-xs px-2 py-0.5 rounded-full bg-[#2C2C2E] text-white/50 capitalize">{m}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {ex.movement_pattern && (
                          <div className="mb-3">
                            <p className="font-barlow text-xs text-white/40 uppercase tracking-widest mb-1">Movement pattern</p>
                            <span className="font-barlow text-xs px-2 py-0.5 rounded-full bg-[#2C2C2E] text-white/50 capitalize">
                              {ex.movement_pattern.replace('-', ' ')}
                            </span>
                          </div>
                        )}

                        {/* Library cue — read only */}
                        {cue && (
                          <div className="mb-4">
                            <p className="font-barlow text-xs text-white/40 uppercase tracking-widest mb-2">
                              Library cue
                              <span className="ml-2 normal-case text-white/20">(edit in program builder after adding)</span>
                            </p>
                            <div className={`border-l-2 ${ex.custom_cue ? 'border-[#2A7A2A]' : 'border-[#C9A84C]/40'} pl-3 py-1`}>
                              <p className="font-barlow text-sm text-white/50 leading-relaxed">{cue}</p>
                            </div>
                          </div>
                        )}

                        {/* Add to day button */}
                        <button
                          onClick={e => { e.stopPropagation(); onSelect(ex) }}
                          className="w-full bg-[#C9A84C] text-black font-bebas text-sm tracking-widest py-2.5 rounded-lg hover:bg-[#E2C070] transition-colors"
                        >
                          + Add to Day
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
