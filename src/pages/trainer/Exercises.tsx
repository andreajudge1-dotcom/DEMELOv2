import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Select from '../../components/Select'

interface Exercise {
  id: string
  name: string
  primary_muscle: string
  secondary_muscles: string[]
  equipment: string
  is_global: boolean
  is_unilateral: boolean
  per_side: boolean
  movement_pattern: string
  difficulty: string
  default_cue: string
  custom_cue: string | null
  trainer_id: string | null
}

const MUSCLE_GROUPS = [
  'All', 'Quads', 'Hamstrings', 'Glutes', 'Calves',
  'Chest', 'Lats', 'Traps', 'Erectors',
  'Delts', 'Biceps', 'Triceps', 'Forearms',
  'Core', 'Obliques', 'Compound', 'Cardio'
]

const EQUIPMENT = ['All', 'Barbell', 'Dumbbell', 'Machine', 'Cable', 'Bodyweight', 'Kettlebell']


export default function Exercises() {
  const { profile } = useAuth()
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [muscleFilter, setMuscleFilter] = useState('All')
  const [equipFilter, setEquipFilter] = useState('All')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingCueId, setEditingCueId] = useState<string | null>(null)
  const [cueValue, setCueValue] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [newExercise, setNewExercise] = useState({
    name: '',
    primary_muscle: '',
    equipment: '',
    movement_pattern: '',
    difficulty: '',
    is_unilateral: false,
    per_side: false,
    default_cue: '',
  })
  const [savingExercise, setSavingExercise] = useState(false)

  useEffect(() => { fetchExercises() }, [])

  async function fetchExercises() {
    const { data } = await supabase
      .from('exercises')
      .select('*')
      .or(`is_global.eq.true,trainer_id.eq.${profile?.id}`)
      .order('name')
    setExercises(data ?? [])
    setLoading(false)
  }

  async function saveCue(exerciseId: string) {
    await supabase
      .from('exercises')
      .update({ custom_cue: cueValue })
      .eq('id', exerciseId)
    setExercises(prev => prev.map(e =>
      e.id === exerciseId ? { ...e, custom_cue: cueValue } : e
    ))
    setEditingCueId(null)
  }


  async function saveCustomExercise() {
    if (!newExercise.name.trim()) return
    setSavingExercise(true)
    const { data } = await supabase
      .from('exercises')
      .insert({
        trainer_id: profile?.id,
        name: newExercise.name.trim(),
        primary_muscle: newExercise.primary_muscle || null,
        equipment: newExercise.equipment || null,
        movement_pattern: newExercise.movement_pattern || null,
        difficulty: newExercise.difficulty || null,
        is_unilateral: newExercise.is_unilateral,
        per_side: newExercise.per_side,
        default_cue: newExercise.default_cue || null,
        is_global: false,
      })
      .select()
      .single()
    if (data) {
      setExercises(prev => [...prev, { ...data, custom_cue: null }].sort((a, b) => a.name.localeCompare(b.name)))
      setNewExercise({ name: '', primary_muscle: '', equipment: '', movement_pattern: '', difficulty: '', is_unilateral: false, per_side: false, default_cue: '' })
      setShowAddModal(false)
    }
    setSavingExercise(false)
  }

  const filtered = exercises.filter(ex => {
    const matchSearch = !search ||
      ex.name.toLowerCase().includes(search.toLowerCase()) ||
      ex.primary_muscle.toLowerCase().includes(search.toLowerCase()) ||
      ex.equipment?.toLowerCase().includes(search.toLowerCase())
    const matchMuscle = muscleFilter === 'All' ||
      ex.primary_muscle.toLowerCase() === muscleFilter.toLowerCase()
    const matchEquip = equipFilter === 'All' ||
      ex.equipment?.toLowerCase() === equipFilter.toLowerCase()
    return matchSearch && matchMuscle && matchEquip
  })

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <p className="font-barlow text-white/40">Loading exercises...</p>
    </div>
  )

  return (
    <div className="max-w-5xl">
      {/* Banner */}
      <div
        className="relative rounded-2xl overflow-hidden mb-8 h-48"
        style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200&q=80)', backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-transparent" />
        <div className="absolute inset-0 flex items-end justify-between p-6">
          <div>
            <h1 className="font-bebas text-5xl text-white tracking-wide leading-none">Exercise Library</h1>
            <p className="font-barlow text-sm text-white/50 mt-1">{filtered.length} exercises</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-[#C9A84C] text-black font-bebas text-sm tracking-widest px-5 py-2.5 rounded-lg hover:bg-[#E2C070] transition-colors"
          >
            + Add Custom
          </button>
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search exercises..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-lg px-4 py-3 text-white font-barlow text-sm placeholder:text-white/30 focus:outline-none focus:border-[#C9A84C] transition-colors mb-4"
      />

      {/* Muscle group tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-3 scrollbar-hide">
        {MUSCLE_GROUPS.map(m => (
          <button
            key={m}
            onClick={() => setMuscleFilter(m)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg font-barlow text-xs font-semibold transition-colors ${
              muscleFilter === m
                ? 'bg-[#C9A84C] text-black'
                : 'bg-[#1C1C1E] text-white/50 border border-[#2C2C2E] hover:text-white'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Equipment filter */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
        {EQUIPMENT.map(e => (
          <button
            key={e}
            onClick={() => setEquipFilter(e)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg font-barlow text-xs font-semibold transition-colors ${
              equipFilter === e
                ? 'bg-[#2C2C2E] text-white border border-[#3A3A3C]'
                : 'bg-transparent text-white/40 hover:text-white'
            }`}
          >
            {e}
          </button>
        ))}
      </div>

      {/* Exercise list */}
      <div className="flex flex-col gap-2">
        {filtered.map(ex => {
          const isExpanded = expandedId === ex.id
          const isEditing = editingCueId === ex.id
          const cue = ex.custom_cue || ex.default_cue

          return (
            <div
              key={ex.id}
              className={`bg-[#1C1C1E] rounded-xl border transition-colors ${
                isExpanded ? 'border-[#C9A84C]' : 'border-[#2C2C2E]'
              }`}
            >
              {/* Main row */}
              <div
                className="flex items-center gap-3 p-4 cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : ex.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-barlow text-sm font-semibold text-white">{ex.name}</span>
                    {ex.custom_cue && (
                      <span className="font-barlow text-xs px-2 py-0.5 rounded-full bg-[#2A7A2A]/20 text-[#2A7A2A] border border-[#2A7A2A]/30">
                        Custom cue
                      </span>
                    )}
                    {!ex.is_global && (
                      <span className="font-barlow text-xs px-2 py-0.5 rounded-full bg-[#C9A84C]/20 text-[#C9A84C] border border-[#C9A84C]/30">
                        My exercise
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="font-barlow text-xs text-white/40 capitalize">{ex.primary_muscle}</span>
                    {ex.equipment && <span className="font-barlow text-xs text-white/30">· {ex.equipment}</span>}
                    {ex.is_unilateral && (
                      <span className="font-barlow text-xs text-[#E2C070]/70">· Unilateral{ex.per_side ? ' — per side' : ''}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
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
                      <span className="font-barlow text-xs px-2 py-0.5 rounded-full bg-[#2C2C2E] text-white/50 capitalize">{ex.movement_pattern.replace('-', ' ')}</span>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-barlow text-xs text-white/40 uppercase tracking-widest">
                        {ex.custom_cue ? 'Your coaching cue' : 'Default coaching cue'}
                      </p>
                      {!isEditing ? (
                        <button
                          onClick={() => { setEditingCueId(ex.id); setCueValue(cue ?? '') }}
                          className="font-barlow text-xs text-[#C9A84C] hover:text-[#E2C070]"
                        >
                          {ex.custom_cue ? 'Edit cue' : 'Add your cue'}
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <button onClick={() => setEditingCueId(null)} className="font-barlow text-xs text-white/40">Cancel</button>
                          <button onClick={() => saveCue(ex.id)} className="font-barlow text-xs text-[#C9A84C]">Save</button>
                        </div>
                      )}
                    </div>
                    {isEditing ? (
                      <textarea
                        value={cueValue}
                        onChange={e => setCueValue(e.target.value)}
                        rows={3}
                        className="w-full bg-[#2C2C2E] border border-[#C9A84C] rounded-lg px-3 py-2 text-white font-barlow text-sm focus:outline-none resize-none"
                      />
                    ) : (
                      <div className={`border-l-2 ${ex.custom_cue ? 'border-[#2A7A2A]' : 'border-[#C9A84C]'} pl-3 py-1`}>
                        <p className="font-barlow text-sm text-white/60 leading-relaxed">{cue}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {filtered.length === 0 && (
          <p className="font-barlow text-sm text-white/30 text-center py-12">No exercises found.</p>
        )}
      </div>

      {/* Add custom exercise modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1C1C1E] rounded-2xl border border-[#2C2C2E] w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#2C2C2E] flex-shrink-0">
              <h2 className="font-bebas text-xl text-white tracking-wide">Add Custom Exercise</h2>
              <button onClick={() => setShowAddModal(false)} className="text-white/40 hover:text-white font-barlow text-sm">✕</button>
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-4">
              {/* Name */}
              <div>
                <label className="font-barlow text-xs text-white/40 uppercase tracking-widest block mb-1.5">Exercise name *</label>
                <input
                  type="text"
                  placeholder="e.g. Bulgarian Split Squat"
                  value={newExercise.name}
                  onChange={e => setNewExercise(f => ({ ...f, name: e.target.value }))}
                  autoFocus
                  className="w-full bg-[#0A0A0A] border border-[#2C2C2E] rounded-lg px-4 py-2.5 text-white font-barlow text-sm placeholder:text-white/20 focus:outline-none focus:border-[#C9A84C] transition-colors"
                />
              </div>

              {/* Primary muscle + Equipment */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-barlow text-xs text-white/40 uppercase tracking-widest block mb-1.5">Primary muscle</label>
                  <Select
                    value={newExercise.primary_muscle}
                    onChange={val => setNewExercise(f => ({ ...f, primary_muscle: val }))}
                    placeholder="Select..."
                    options={['Quads','Hamstrings','Glutes','Calves','Chest','Lats','Traps','Erectors','Delts','Biceps','Triceps','Forearms','Core','Obliques'].map(m => ({ value: m, label: m }))}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="font-barlow text-xs text-white/40 uppercase tracking-widest block mb-1.5">Equipment</label>
                  <Select
                    value={newExercise.equipment}
                    onChange={val => setNewExercise(f => ({ ...f, equipment: val }))}
                    placeholder="Select..."
                    options={['Barbell','Dumbbell','Machine','Cable','Bodyweight','Kettlebell','Band','TRX'].map(e => ({ value: e, label: e }))}
                    className="w-full"
                  />
                </div>
              </div>

              {/* Movement pattern + Difficulty */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-barlow text-xs text-white/40 uppercase tracking-widest block mb-1.5">Movement pattern</label>
                  <Select
                    value={newExercise.movement_pattern}
                    onChange={val => setNewExercise(f => ({ ...f, movement_pattern: val }))}
                    placeholder="Select..."
                    options={['squat','hinge','push','pull','carry','rotation','locomotion'].map(p => ({ value: p, label: p.charAt(0).toUpperCase() + p.slice(1) }))}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="font-barlow text-xs text-white/40 uppercase tracking-widest block mb-1.5">Difficulty</label>
                  <Select
                    value={newExercise.difficulty}
                    onChange={val => setNewExercise(f => ({ ...f, difficulty: val }))}
                    placeholder="Select..."
                    options={[
                      { value: 'beginner', label: 'Beginner' },
                      { value: 'intermediate', label: 'Intermediate' },
                      { value: 'advanced', label: 'Advanced' },
                    ]}
                    className="w-full"
                  />
                </div>
              </div>

              {/* Unilateral toggles */}
              <div className="flex gap-4">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setNewExercise(f => ({ ...f, is_unilateral: !f.is_unilateral, per_side: false }))}
                    className={`w-9 h-5 rounded-full transition-colors relative ${newExercise.is_unilateral ? 'bg-[#C9A84C]' : 'bg-[#2C2C2E]'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${newExercise.is_unilateral ? 'left-4' : 'left-0.5'}`} />
                  </button>
                  <span className="font-barlow text-sm text-white/70">Unilateral</span>
                </div>
                {newExercise.is_unilateral && (
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setNewExercise(f => ({ ...f, per_side: !f.per_side }))}
                      className={`w-9 h-5 rounded-full transition-colors relative ${newExercise.per_side ? 'bg-[#C9A84C]' : 'bg-[#2C2C2E]'}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${newExercise.per_side ? 'left-4' : 'left-0.5'}`} />
                    </button>
                    <span className="font-barlow text-sm text-white/70">Per side</span>
                  </div>
                )}
              </div>

              {/* Coaching cue */}
              <div>
                <label className="font-barlow text-xs text-white/40 uppercase tracking-widest block mb-1.5">Default coaching cue</label>
                <textarea
                  placeholder="Optional coaching note shown to clients during this exercise..."
                  value={newExercise.default_cue}
                  onChange={e => setNewExercise(f => ({ ...f, default_cue: e.target.value }))}
                  rows={3}
                  className="w-full bg-[#0A0A0A] border border-[#2C2C2E] rounded-lg px-4 py-2.5 text-white font-barlow text-sm placeholder:text-white/20 focus:outline-none focus:border-[#C9A84C] transition-colors resize-none"
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-[#2C2C2E] flex gap-3 flex-shrink-0">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-2.5 font-barlow text-sm text-white/40 hover:text-white border border-[#2C2C2E] rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveCustomExercise}
                disabled={!newExercise.name.trim() || savingExercise}
                className="flex-1 py-2.5 font-bebas text-sm tracking-widest bg-[#C9A84C] text-black rounded-lg hover:bg-[#E2C070] transition-colors disabled:opacity-50"
              >
                {savingExercise ? 'SAVING...' : 'ADD EXERCISE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
