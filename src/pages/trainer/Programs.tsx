import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import Select from '../../components/Select'

interface Program {
  id: string
  name: string
  description: string | null
  cover_photo_url: string | null
  num_days: number
  num_weeks: number
  is_template: boolean
  tags: string[] | null
  created_at: string
}

const COVER_PHOTOS = [
  'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&q=80',
  'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=600&q=80',
  'https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=600&q=80',
  'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=600&q=80',
]

export default function Programs() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [programs, setPrograms] = useState<Program[]>([])
  const [loading, setLoading] = useState(true)
  const [showStartModal, setShowStartModal] = useState(false)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const templates = programs.filter(p => p.is_template)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [activeTab, setActiveTab] = useState<'all' | 'templates'>('all')
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('')

  useEffect(() => {
    fetchPrograms()
  }, [])

  async function fetchPrograms() {
    const { data } = await supabase
      .from('training_cycles')
      .select('*')
      .eq('trainer_id', profile?.id)
      .order('created_at', { ascending: false })
    setPrograms(data ?? [])
    setLoading(false)
  }

  async function deleteProgram(id: string) {
    setDeleting(true)
    await supabase.from('training_cycles').delete().eq('id', id)
    setPrograms(prev => prev.filter(p => p.id !== id))
    setConfirmDeleteId(null)
    setDeleting(false)
  }

  const filtered = programs.filter(p => {
    if (activeTab === 'templates' && !p.is_template) return false
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
    if (tagFilter && !(p.tags ?? []).includes(tagFilter)) return false
    return true
  })


  function getCoverPhoto(program: Program, index: number) {
    return program.cover_photo_url ?? COVER_PHOTOS[index % COVER_PHOTOS.length]
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <p className="font-barlow text-white/40">Loading programs...</p>
    </div>
  )

  return (
    <div className="max-w-5xl">
      {/* Banner */}
      <div className="relative h-48 rounded-2xl overflow-hidden mb-8">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1600&q=80)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0A]/90 via-[#0A0A0A]/50 to-transparent" />
        <div className="relative h-full flex flex-col justify-end px-8 pb-6">
          <h1 className="font-bebas text-4xl text-white tracking-wide">Programs</h1>
          <p className="font-barlow text-sm text-white/50 mt-1">
            {programs.length} {programs.length === 1 ? 'program' : 'programs'}
          </p>
        </div>
        <div className="absolute bottom-6 right-6">
          <button
            onClick={() => setShowStartModal(true)}
            className="bg-[#C9A84C] text-black font-bebas text-sm tracking-widest px-5 py-2.5 rounded-lg hover:bg-[#E2C070] transition-colors"
          >
            + New Program
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search programs..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-lg px-4 py-2.5 text-white font-barlow text-sm placeholder:text-white/20 focus:outline-none focus:border-[#C9A84C] transition-colors"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {(['all', 'templates'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-full font-barlow text-xs font-semibold capitalize transition-colors ${
              activeTab === tab
                ? 'bg-[#2C2C2E] text-white border border-[#3A3A3C]'
                : 'text-white/40 hover:text-white'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Filter row */}
      <div className="flex gap-3 mb-6 flex-wrap items-center">
        <Select
          value={tagFilter}
          onChange={val => setTagFilter(val)}
          placeholder="All tags"
          options={['Strength','Hypertrophy','Power','Conditioning','Beginner','Fat Loss','Sport Specific','Rehab'].map(tag => ({ value: tag, label: tag }))}
          className="w-48"
        />

        {(tagFilter || search) && (
          <button
            onClick={() => { setTagFilter(''); setSearch('') }}
            className="font-barlow text-xs text-white/40 hover:text-white transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] p-16 text-center">
          <p className="font-bebas text-2xl text-white/20 tracking-wide mb-2">No programs yet</p>
          <p className="font-barlow text-sm text-white/30 mb-6">
            Build your first training program to assign to clients
          </p>
          <button
            onClick={() => setShowStartModal(true)}
            className="bg-[#C9A84C] text-black font-bebas text-sm tracking-widest px-6 py-3 rounded-lg hover:bg-[#E2C070] transition-colors"
          >
            Build First Program
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {filtered.map((program, i) => (
            <div
              key={program.id}
              className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] overflow-hidden hover:border-[#C9A84C] transition-colors group relative"
            >
              <div
                onClick={() => navigate(`/trainer/programs/${program.id}`)}
                className="h-32 bg-cover bg-center relative cursor-pointer"
                style={{ backgroundImage: `url(${getCoverPhoto(program, i)})` }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-[#1C1C1E] via-[#1C1C1E]/40 to-transparent" />
                {program.is_template && (
                  <div className="absolute top-2 left-2 bg-[#C9A84C] text-black font-barlow text-xs font-bold px-2 py-0.5 rounded-full">
                    Template
                  </div>
                )}
                <button
                  onClick={e => { e.stopPropagation(); setConfirmDeleteId(program.id) }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 flex items-center justify-center text-white/40 hover:text-[#E05555] hover:bg-black/70 transition-colors opacity-0 group-hover:opacity-100"
                >
                  ✕
                </button>
              </div>
              <div className="p-4 cursor-pointer" onClick={() => navigate(`/trainer/programs/${program.id}`)}>
                <h3 className="font-bebas text-lg text-white tracking-wide group-hover:text-[#C9A84C] transition-colors">
                  {program.name}
                </h3>
                {program.description && (
                  <p className="font-barlow text-xs text-white/40 mt-1 line-clamp-2">
                    {program.description}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-3">
                  <span className="font-barlow text-xs text-white/40">
                    {program.num_days} days/week
                  </span>
                  <span className="font-barlow text-xs text-white/20">·</span>
                  <span className="font-barlow text-xs text-white/40">
                    {new Date(program.created_at).toLocaleDateString()}
                  </span>
                </div>
                {(program.tags ?? []).length > 0 && (
                  <div className="flex gap-1 flex-wrap mt-2">
                    {(program.tags ?? []).map((tag: string) => (
                      <span key={tag} className="font-barlow text-xs px-2 py-0.5 rounded-full bg-[#C9A84C]/10 text-[#C9A84C]/70 border border-[#C9A84C]/20">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* New program card */}
          <div
            onClick={() => setShowStartModal(true)}
            className="bg-[#141414] rounded-xl border border-dashed border-[#2C2C2E] overflow-hidden cursor-pointer hover:border-[#C9A84C] transition-colors flex flex-col items-center justify-center min-h-[180px] gap-2"
          >
            <div className="w-9 h-9 rounded-full border border-[#2C2C2E] flex items-center justify-center text-white/20 text-lg">+</div>
            <span className="font-bebas text-sm text-white/20 tracking-widest">New Program</span>
          </div>
        </div>
      )}

      {/* Start modal */}
      {showStartModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1C1C1E] rounded-2xl border border-[#2C2C2E] w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-[#2C2C2E]">
              <h2 className="font-bebas text-2xl text-white tracking-wide">Start a new program</h2>
              <p className="font-barlow text-sm text-white/40 mt-1">Choose how you want to begin</p>
            </div>
            <div className="p-4 flex flex-col gap-3">
              {[
                {
                  label: 'Build from scratch',
                  desc: 'Name your program, set days and weeks, then build each day.',
                  badge: 'Most used',
                  action: () => { setShowStartModal(false); navigate('/trainer/programs/new') }
                },
                {
                  label: 'Load a template',
                  desc: 'Start from one of your saved templates and edit as needed.',
                  badge: null,
                  action: () => { setShowStartModal(false); setShowTemplatePicker(true) }
                },
                {
                  label: 'Copy from a client',
                  desc: 'Duplicate an existing program from another client. Original is untouched.',
                  badge: null,
                  action: () => { setShowStartModal(false); navigate('/trainer/programs/new?from=client') }
                },
              ].map(opt => (
                <button
                  key={opt.label}
                  onClick={opt.action}
                  className="bg-[#141414] border border-[#2C2C2E] rounded-xl p-4 text-left flex items-start gap-3 hover:border-[#C9A84C] hover:bg-[#1a1506] transition-colors group"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bebas text-base text-white tracking-wide group-hover:text-[#C9A84C] transition-colors">
                        {opt.label}
                      </span>
                      {opt.badge && (
                        <span className="font-barlow text-xs bg-[#C9A84C] text-black font-bold px-2 py-0.5 rounded-full">
                          {opt.badge}
                        </span>
                      )}
                    </div>
                    <p className="font-barlow text-xs text-white/40 mt-1 leading-relaxed">{opt.desc}</p>
                  </div>
                  <span className="text-white/20 group-hover:text-[#C9A84C] transition-colors mt-0.5">›</span>
                </button>
              ))}
            </div>
            <div className="px-4 pb-4">
              <button
                onClick={() => setShowStartModal(false)}
                className="w-full py-2.5 font-barlow text-sm text-white/40 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1C1C1E] rounded-2xl border border-[#2C2C2E] w-full max-w-sm p-6 flex flex-col gap-5">
            <div>
              <h2 className="font-bebas text-2xl text-white tracking-wide">Delete program?</h2>
              <p className="font-barlow text-sm text-white/40 mt-1">
                This will permanently delete the program and all its days, exercises, and set prescriptions. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 py-2.5 font-barlow text-sm text-white/60 hover:text-white border border-[#2C2C2E] rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteProgram(confirmDeleteId)}
                disabled={deleting}
                className="flex-1 py-2.5 font-bebas text-sm tracking-widest bg-[#E05555] text-white rounded-lg hover:bg-[#c94444] transition-colors disabled:opacity-50"
              >
                {deleting ? 'DELETING...' : 'DELETE'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template picker modal */}
      {showTemplatePicker && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1C1C1E] rounded-2xl border border-[#2C2C2E] w-full max-w-lg overflow-hidden">
            <div className="p-5 border-b border-[#2C2C2E] flex items-center justify-between">
              <div>
                <h2 className="font-bebas text-xl text-white tracking-wide">Choose a template</h2>
                <p className="font-barlow text-xs text-white/40 mt-0.5">{templates.length} templates available</p>
              </div>
              <button onClick={() => setShowTemplatePicker(false)} className="font-barlow text-sm text-white/40 hover:text-white">✕</button>
            </div>
            {templates.length === 0 ? (
              <div className="p-10 text-center">
                <p className="font-barlow text-sm text-white/30 mb-3">No templates saved yet</p>
                <p className="font-barlow text-xs text-white/20">Turn on Save as template when building a program to add it here</p>
                <button
                  onClick={() => { setShowTemplatePicker(false); navigate('/trainer/programs/new') }}
                  className="mt-4 font-barlow text-sm text-[#C9A84C] hover:text-[#E2C070]"
                >
                  Build from scratch instead
                </button>
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto divide-y divide-[#2C2C2E]">
                {templates.map((template, i) => (
                  <button
                    key={template.id}
                    onClick={() => { setShowTemplatePicker(false); navigate(`/trainer/programs/new?from=template&templateId=${template.id}`) }}
                    className="w-full text-left flex items-center gap-4 px-5 py-4 hover:bg-[#242424] transition-colors group"
                  >
                    <div
                      className="w-14 h-14 rounded-lg bg-cover bg-center flex-shrink-0"
                      style={{ backgroundImage: `url(${template.cover_photo_url ?? COVER_PHOTOS[i % COVER_PHOTOS.length]})` }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-bebas text-base text-white tracking-wide group-hover:text-[#C9A84C] transition-colors">{template.name}</p>
                      {template.description && (
                        <p className="font-barlow text-xs text-white/40 truncate mt-0.5">{template.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1">
                        <span className="font-barlow text-xs text-white/30">{template.num_days} days/week</span>
                        {(template.tags ?? []).length > 0 && (
                          <div className="flex gap-1">
                            {(template.tags ?? []).slice(0, 2).map(tag => (
                              <span key={tag} className="font-barlow text-xs px-2 py-0.5 rounded-full bg-[#C9A84C]/10 text-[#C9A84C]/70">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="text-white/20 group-hover:text-[#C9A84C] transition-colors">›</span>
                  </button>
                ))}
              </div>
            )}
            <div className="p-4 border-t border-[#2C2C2E]">
              <button
                onClick={() => setShowTemplatePicker(false)}
                className="w-full font-barlow text-sm text-white/40 hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
