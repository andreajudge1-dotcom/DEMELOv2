import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

interface VaultDoc {
  id: string
  name: string
  file_url: string
  file_type: string | null
  file_size: number | null
  created_at: string
  clients?: { full_name: string } | null
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
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (profile?.id) loadDocs()
  }, [profile])

  async function loadDocs() {
    const { data } = await supabase
      .from('vault_documents')
      .select('id, name, file_url, file_type, file_size, created_at, clients(full_name)')
      .eq('trainer_id', profile!.id)
      .order('created_at', { ascending: false })
    setDocs((data ?? []) as unknown as VaultDoc[])
    setLoading(false)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile?.id) return

    setUploading(true)
    setUploadError(null)

    const ext = file.name.split('.').pop() ?? ''
    const path = `vault/${profile.id}/${Date.now()}-${file.name}`

    const { error: uploadErr } = await supabase.storage
      .from('vault')
      .upload(path, file, { upsert: true })

    if (uploadErr) {
      setUploadError(`Upload failed: ${uploadErr.message}`)
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage.from('vault').getPublicUrl(path)

    const { error: insertErr } = await supabase.from('vault_documents').insert({
      trainer_id: profile.id,
      client_id: null,
      name: file.name,
      title: file.name,
      file_url: urlData.publicUrl,
      file_type: ext,
      file_size: file.size,
      is_shared: false,
    })

    if (insertErr) {
      setUploadError(`Could not save file: ${insertErr.message}`)
      setUploading(false)
      return
    }

    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
    loadDocs()
  }

  async function confirmDelete() {
    if (!deleteId) return
    setDeleting(true)
    await supabase.from('vault_documents').delete().eq('id', deleteId)
    setDeleteId(null)
    setDeleting(false)
    loadDocs()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#C9A84C]/30 border-t-[#C9A84C] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl">
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.heic,.txt,.csv,.xlsx"
        onChange={handleUpload}
      />

      {/* Delete confirmation */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#1C1C1E] rounded-2xl border border-[#2C2C2E] w-full max-w-sm p-6">
            <p className="font-bebas text-xl text-white tracking-wide mb-2">Delete Document?</p>
            <p className="font-barlow text-sm text-white/50 mb-5">This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                disabled={deleting}
                className="flex-1 font-barlow text-sm text-white/40 border border-[#2C2C2E] rounded-xl py-2.5 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 bg-red-500/80 hover:bg-red-500 text-white font-bebas text-sm tracking-widest py-2.5 rounded-xl transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Banner */}
      <div className="relative h-48 rounded-2xl overflow-hidden mb-8">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1600&q=80)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0A]/90 via-[#0A0A0A]/50 to-transparent" />
        <div className="relative h-full flex flex-col justify-end px-8 pb-6">
          <h1 className="font-bebas text-4xl text-white tracking-wide">Vault</h1>
          <p className="font-barlow text-sm text-white/50 mt-1">Store and share training documents with your clients</p>
        </div>
        <div className="absolute bottom-6 right-6">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="bg-[#C9A84C] text-black font-bebas text-sm tracking-widest px-5 py-2.5 rounded-lg hover:bg-[#E2C070] transition-colors disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : '+ Upload File'}
          </button>
        </div>
      </div>

      {/* Upload error */}
      {uploadError && (
        <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="font-barlow text-sm text-red-400">{uploadError}</p>
          <button onClick={() => setUploadError(null)} className="text-red-400/50 hover:text-red-400 ml-3 text-lg leading-none">×</button>
        </div>
      )}

      {/* Document list */}
      {docs.length === 0 ? (
        <div className="bg-[#1C1C1E] rounded-2xl border border-[#2C2C2E] p-16 text-center">
          <svg className="w-12 h-12 text-white/10 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <p className="font-bebas text-xl text-white/20 tracking-wide mb-1">No Documents Yet</p>
          <p className="font-barlow text-sm text-white/30">Upload a file to get started.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {docs.map(doc => {
            const icon = fileIcon(doc.file_type)
            const clientName = (doc.clients as any)?.full_name

            return (
              <div key={doc.id} className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] p-4">
                <div className="flex items-center gap-4">
                  {/* File icon */}
                  <div className={`w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 ${icon.color}`}>
                    <span className="font-bebas text-sm">{icon.label}</span>
                  </div>

                  {/* Name + meta */}
                  <div className="flex-1 min-w-0">
                    <a
                      href={doc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-barlow text-sm font-semibold text-white hover:text-[#C9A84C] transition-colors truncate block"
                    >
                      {doc.name}
                    </a>
                    <p className="font-barlow text-xs text-white/30 mt-0.5">
                      {new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {doc.file_size ? ` · ${fmtSize(doc.file_size)}` : ''}
                      {clientName ? ` · ${clientName}` : ''}
                    </p>
                  </div>

                  {/* Delete */}
                  <button
                    onClick={() => setDeleteId(doc.id)}
                    className="font-barlow text-xs text-white/20 hover:text-red-400 transition-colors flex-shrink-0"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
