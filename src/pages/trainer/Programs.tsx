import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

interface Program {
  id: string
  name: string
  description: string | null
  cover_photo_url: string | null
  num_days: number
  is_template: boolean
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
  const [activeTab, setActiveTab] = useState<'all' | 'templates' | 'active'>('all')

  useEffect(() => { fetchPrograms() }, [])

  async function fetchPrograms() {
    const { data } = await supabase
      .from('training_cycles')
      .select('*')
      .eq('trainer_id', profile?.id)
      .order('created_at', { ascending: false })
    setPrograms(data ?? [])
    setLoading(false)
  }

  const filtered = programs.filter(p => {
    if (activeTab === 'templates') return p.is_template
    if (activeTab === 'active') return !p.is_template
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
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-bebas text-4xl text-white tracking-wide">Programs</h1>
          <p className="font-barlow text-sm text-white/40 mt-1">
            {programs.length} {programs.length === 1 ? 'program' : 'programs'}
          </p>
        </div>
        <button
          onClick={() => setShowStartModal(true)}
          className="bg-[#C9A84C] text-black font-bebas text-sm tracking-widest px-5 py-2.5 rounded-lg hover:bg-[#E2C070] transition-colors"
        >
          + New Program
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(['all', 'templates', 'active'] as const).map(tab => (
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
              onClick={() => navigate(`/trainer/programs/${program.id}`)}
              className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] overflow-hidden cursor-pointer hover:border-[#C9A84C] transition-colors group"
            >
              <div
                className="h-32 bg-cover bg-center relative"
                style={{ backgroundImage: `url(${getCoverPhoto(program, i)})` }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-[#1C1C1E] via-[#1C1C1E]/40 to-transparent" />
                {program.is_template && (
                  <div className="absolute top-2 right-2 bg-[#C9A84C] text-black font-barlow text-xs font-bold px-2 py-0.5 rounded-full">
                    Template
                  </div>
                )}
              </div>
              <div className="p-4">
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
                  action: () => { setShowStartModal(false); navigate('/trainer/programs/new?from=template') }
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
    </div>
  )
}
