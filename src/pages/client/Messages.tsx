import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id: string
  sender_role: 'trainer' | 'client'
  body: string
  is_broadcast: boolean
  broadcast_id: string | null
  created_at: string
  read_at: string | null
}

interface TrainerInfo {
  id: string
  full_name: string | null
  last_sign_in_at?: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string | null) {
  if (!name) return 'C'
  const parts = name.trim().split(' ')
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? 'C'
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase()
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatLastActive(iso: string | null | undefined) {
  if (!iso) return 'Active recently'
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 5) return 'Active now'
  if (diffMins < 60) return `Active ${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `Active ${diffHours}h ago`
  return `Active ${Math.floor(diffHours / 24)}d ago`
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ClientMessages() {
  const { user } = useAuth()

  const [clientId, setClientId] = useState<string | null>(null)
  const [trainerId, setTrainerId] = useState<string | null>(null)
  const [trainer, setTrainer] = useState<TrainerInfo | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // ── Load client + trainer info ──────────────────────────────────────────────

  useEffect(() => {
    if (user) loadClientInfo()
  }, [user])

  async function loadClientInfo() {
    if (!user) return

    // Get client row (to get client.id and trainer_id)
    const { data: clientRow } = await supabase
      .from('clients')
      .select('id, trainer_id')
      .eq('profile_id', user.id)
      .single()

    if (!clientRow) { setLoading(false); return }

    setClientId(clientRow.id)
    setTrainerId(clientRow.trainer_id)

    // Get trainer profile
    const { data: trainerProfile } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('id', clientRow.trainer_id)
      .single()

    if (trainerProfile) setTrainer(trainerProfile)

    // Load messages
    await loadMessages(clientRow.id)
    setLoading(false)

    // Mark all unread messages as read
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('client_id', clientRow.id)
      .eq('sender_role', 'trainer')
      .is('read_at', null)
  }

  async function loadMessages(cid: string) {
    const { data } = await supabase
      .from('messages')
      .select('id, sender_role, body, is_broadcast, broadcast_id, created_at, read_at')
      .eq('client_id', cid)
      .order('created_at', { ascending: true })

    if (data) setMessages(data as Message[])
  }

  // ── Realtime subscription ───────────────────────────────────────────────────

  useEffect(() => {
    if (!clientId) return

    const channel = supabase
      .channel(`messages:client:${clientId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `client_id=eq.${clientId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message
          setMessages(prev => {
            // Avoid duplicates (optimistic update already added client messages)
            if (prev.some(m => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [clientId])

  // ── Scroll to bottom ────────────────────────────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: messages.length > 1 ? 'smooth' : 'auto' })
  }, [messages])

  // ── Send message ────────────────────────────────────────────────────────────

  async function handleSend() {
    const text = input.trim()
    if (!text || !clientId || !trainerId || sending) return

    setSending(true)
    setInput('')

    // Optimistic update
    const tempId = `temp-${Date.now()}`
    const optimistic: Message = {
      id: tempId,
      sender_role: 'client',
      body: text,
      is_broadcast: false,
      broadcast_id: null,
      created_at: new Date().toISOString(),
      read_at: null,
    }
    setMessages(prev => [...prev, optimistic])

    const { data, error } = await supabase
      .from('messages')
      .insert({
        trainer_id: trainerId,
        client_id: clientId,
        sender_role: 'client',
        body: text,
        is_broadcast: false,
        created_at: new Date().toISOString(),
      })
      .select('id, sender_role, body, is_broadcast, broadcast_id, created_at, read_at')
      .single()

    if (!error && data) {
      // Replace optimistic with real
      setMessages(prev => prev.map(m => m.id === tempId ? (data as Message) : m))
    }

    setSending(false)
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <p className="font-bebas text-xl text-[#C9A84C] tracking-widest">LOADING...</p>
      </div>
    )
  }

  // ── No client row found ─────────────────────────────────────────────────────

  if (!clientId) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center px-6 text-center">
        <div>
          <p className="font-bebas text-2xl text-white tracking-widest mb-2">NOT LINKED</p>
          <p className="font-barlow text-[#555] text-sm">Your account isn't linked to a trainer yet.</p>
        </div>
      </div>
    )
  }

  const trainerName = trainer?.full_name ?? 'Your Coach'
  const trainerInitials = initials(trainer?.full_name ?? null)

  return (
    <div className="flex flex-col bg-[#0A0A0A]" style={{ height: 'calc(100dvh - 128px - 64px)' }}>

      {/* ── Thread Header ── */}
      <div className="flex-shrink-0 bg-[#0A0A0A] border-b border-[#1C1C1E]">
        <div className="max-w-[390px] mx-auto px-4 py-3">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="relative">
            <div className="w-11 h-11 rounded-full bg-[#C9A84C] flex items-center justify-center">
              <span className="font-bebas text-black text-lg">{trainerInitials}</span>
            </div>
            {/* Online dot */}
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-[#0A0A0A]" />
          </div>

          <div>
            <p className="font-bebas text-lg text-white tracking-wide leading-tight">{trainerName}</p>
            <p className="font-barlow text-[#888] text-xs">
              {formatLastActive(trainer?.last_sign_in_at)}
            </p>
          </div>

          <div className="ml-auto">
            <span className="font-barlow text-[10px] text-[#C9A84C] uppercase tracking-widest bg-[#C9A84C]/10 px-2 py-1 rounded-full">
              Your coach
            </span>
          </div>
        </div>
        </div>
      </div>

      {/* ── Message Thread ── */}
      <div className="flex-1 overflow-y-auto py-4 space-y-3">
        <div className="max-w-[390px] mx-auto px-4 space-y-3">

        {/* Empty state */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full py-20 text-center">
            {/* Speech bubble SVG */}
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="mb-4 opacity-30">
              <path
                d="M8 12C8 9.79 9.79 8 12 8h40c2.21 0 4 1.79 4 4v28c0 2.21-1.79 4-4 4H20l-8 8V12z"
                fill="#C9A84C"
              />
            </svg>
            <p className="font-barlow text-white/50 text-base">Send {trainerName} a message to get started.</p>
          </div>
        )}

        {messages.map((msg) => {
          const isClient = msg.sender_role === 'client'

          // Broadcast message — full-width card
          if (msg.is_broadcast) {
            return (
              <div key={msg.id} className="w-full">
                <div className="bg-[#1C1C1E] border-l-4 border-[#C9A84C] rounded-r-2xl rounded-bl-2xl px-4 py-3">
                  <p className="font-barlow text-[10px] text-[#C9A84C] uppercase tracking-widest mb-1">
                    📣 Announcement
                  </p>
                  <p className="font-barlow text-white text-sm leading-relaxed">{msg.body}</p>
                  <p className="font-barlow text-[#555] text-[10px] mt-2">{formatTime(msg.created_at)}</p>
                </div>
              </div>
            )
          }

          // Regular message
          return (
            <div
              key={msg.id}
              className={`flex ${isClient ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[78%] px-4 py-3 ${
                  isClient
                    ? 'bg-[#C9A84C] text-black rounded-t-2xl rounded-bl-2xl rounded-br-sm'
                    : 'bg-[#1C1C1E] text-white rounded-t-2xl rounded-br-2xl rounded-bl-sm'
                }`}
              >
                <p className="font-barlow text-sm leading-relaxed">{msg.body}</p>
                <p
                  className={`font-barlow text-[10px] mt-1 ${
                    isClient ? 'text-black/50 text-right' : 'text-[#555]'
                  }`}
                >
                  {formatTime(msg.created_at)}
                </p>
              </div>
            </div>
          )
        })}

        <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Message Input ── */}
      <div className="flex-shrink-0 bg-[#0A0A0A] border-t border-[#1C1C1E]">
        <div className="max-w-[390px] mx-auto px-4 py-3">
        <div className="flex items-end gap-3">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${trainerName}...`}
            className="flex-1 bg-[#1C1C1E] border border-[#3A3A3C] rounded-2xl px-4 py-3 text-white font-barlow text-sm placeholder-[#555] focus:outline-none focus:border-[#C9A84C] resize-none leading-relaxed"
            style={{ maxHeight: '120px', overflowY: 'auto' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="flex-shrink-0 w-11 h-11 rounded-full bg-[#C9A84C] flex items-center justify-center disabled:opacity-40 transition-opacity"
          >
            {/* Send icon */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M22 2L11 13M22 2L15 22L11 13M11 13L2 9L22 2"
                stroke="black"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        </div>
      </div>

    </div>
  )
}
