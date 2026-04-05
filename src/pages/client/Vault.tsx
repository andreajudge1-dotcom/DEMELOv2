import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

interface VaultDoc {
  id: string
  name: string
  file_url: string
  file_type: string | null
  file_size: number | null
  created_at: string
}

function fileIcon(ext: string | null) {
  const e = (ext ?? '').toLowerCase()
  if (e === 'pdf') return { color: 'text-red-400 bg-red-500/15', label: 'PDF' }
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(e)) return { color: 'text-blue-400 bg-blue-500/15', label: 'IMG' }
  if (['doc', 'docx'].includes(e)) return { color: 'text-purple-400 bg-purple-500/15', label: 'DOC' }
  return { color: 'text-white/40 bg-white/5', label: e.toUpperCase() || 'FILE' }
}

function fmtSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

export default function Vault() {
  const { profile } = useAuth()
  const [docs, setDocs] = useState<VaultDoc[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile?.id) loadDocs(profile.id)
  }, [profile])

  async function loadDocs(userId: string) {
    const { data: clientRow } = await supabase
      .from('clients')
      .select('id')
      .eq('profile_id', userId)
      .maybeSingle()
    if (!clientRow) { setLoading(false); return }

    const { data } = await supabase
      .from('vault_documents')
      .select('id, name, file_url, file_type, file_size, created_at')
      .eq('client_id', clientRow.id)
      .eq('is_shared', true)
      .order('created_at', { ascending: false })
    setDocs(data ?? [])
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#C9A84C]/30 border-t-[#C9A84C] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-24">
      <div className="max-w-[390px] mx-auto px-4 pt-8">
        <h1 className="font-bebas text-3xl text-white tracking-wide mb-2">Vault</h1>
        <p className="font-barlow text-sm text-white/40 mb-6">Documents and resources from your coach.</p>

        {docs.length === 0 ? (
          <div className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl p-8 text-center">
            <svg className="w-10 h-10 text-white/10 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            <p className="font-barlow text-sm text-white/25">Nothing here yet. Your coach will add resources as needed.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {docs.map(doc => {
              const icon = fileIcon(doc.file_type)
              return (
                <a
                  key={doc.id}
                  href={doc.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-xl p-4 flex items-center gap-3 hover:border-[#3A3A3C] transition-colors"
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${icon.color}`}>
                    <span className="font-bebas text-xs">{icon.label}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-barlow text-sm font-semibold text-white truncate">{doc.name}</p>
                    <p className="font-barlow text-xs text-white/30 mt-0.5">
                      {new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {doc.file_size ? ` · ${fmtSize(doc.file_size)}` : ''}
                    </p>
                  </div>
                  <svg className="w-4 h-4 text-white/20 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
