import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Client {
  id: string
  full_name: string
  profile_id: string | null
  status: string
}

interface Message {
  id: string
  client_id: string
  sender_role: 'trainer' | 'client'
  body: string
  is_broadcast: boolean
  broadcast_id: string | null
  created_at: string
  read_at: string | null
}

interface Thread {
  client: Client
  lastMessage: Message | null
  unreadCount: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  const parts = name.trim().split(' ')
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?'
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase()
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

// ── Broadcast Modal ───────────────────────────────────────────────────────────

function BroadcastModal({
  clients,
  trainerId,
  onClose,
  onSent,
}: {
  clients: Client[]
  trainerId: string
  onClose: () => void
  onSent: () => void
}) {
  const [body, setBody] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set(clients.map(c => c.id)))
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const activeClients = clients.filter(c => c.status === 'active')
  const allSelected = activeClients.every(c => selected.has(c.id))

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(activeClients.map(c => c.id)))
    }
  }

  function toggleClient(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSend() {
    const text = body.trim()
    if (!text) return setError('Please enter a message.')
    if (selected.size === 0) return setError('Select at least one client.')

    setSending(true)
    setError(null)

    const broadcastId = generateUUID()
    const now = new Date().toISOString()

    const rows = Array.from(selected).map(clientId => ({
      trainer_id: trainerId,
      client_id: clientId,
      sender_role: 'trainer',
      body: text,
      is_broadcast: true,
      broadcast_id: broadcastId,
      created_at: now,
    }))

    const { error: insertErr } = await supabase.from('messages').insert(rows)

    if (insertErr) {
      console.error('Broadcast insert error:', insertErr.message, insertErr.details, insertErr.hint)
      setError(`Failed to send: ${insertErr.message}`)
      setSending(false)
      return
    }

    setSending(false)
    onSent()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70">
      <div className="w-full max-w-lg bg-[#1C1C1E] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#2C2C2E]">
          <div>
            <h2 className="font-bebas text-2xl text-white tracking-widest">BROADCAST</h2>
            <p className="font-barlow text-[#888] text-xs mt-0.5">Send to all selected clients</p>
          </div>
          <button onClick={onClose} className="text-[#555] hover:text-white transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Message textarea */}
          <div>
            <label className="block font-barlow text-sm text-[#888] mb-2 uppercase tracking-wide">
              Message
            </label>
            <textarea
              rows={4}
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Write your announcement..."
              className="w-full bg-[#2C2C2E] border border-[#3A3A3C] rounded-xl px-4 py-3 text-white font-barlow text-sm placeholder-[#555] focus:outline-none focus:border-[#C9A84C] resize-none"
            />
          </div>

          {/* Client selector */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="font-barlow text-sm text-[#888] uppercase tracking-wide">
                Recipients ({selected.size})
              </label>
              <button
                onClick={toggleAll}
                className="font-barlow text-sm text-[#C9A84C] underline"
              >
                {allSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div className="space-y-2">
              {activeClients.length === 0 && (
                <p className="font-barlow text-[#555] text-sm text-center py-4">No active clients.</p>
              )}
              {activeClients.map(client => (
                <label
                  key={client.id}
                  className="flex items-center gap-3 bg-[#2C2C2E] rounded-xl px-4 py-3 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(client.id)}
                    onChange={() => toggleClient(client.id)}
                    className="hidden"
                  />
                  {/* Custom checkbox */}
                  <div
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      selected.has(client.id)
                        ? 'bg-[#C9A84C] border-[#C9A84C]'
                        : 'border-[#555] bg-transparent'
                    }`}
                  >
                    {selected.has(client.id) && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="black" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    )}
                  </div>

                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-[#3A3A3C] flex items-center justify-center flex-shrink-0">
                    <span className="font-bebas text-[#C9A84C] text-sm">{initials(client.full_name)}</span>
                  </div>

                  <span className="font-barlow text-white text-sm">{client.full_name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-5 border-t border-[#2C2C2E]">
          {error && (
            <p className="font-barlow text-red-400 text-sm mb-3">{error}</p>
          )}
          <button
            onClick={handleSend}
            disabled={sending || !body.trim() || selected.size === 0}
            className="w-full py-4 bg-[#C9A84C] text-black font-bebas text-xl tracking-widest rounded-xl disabled:opacity-40 transition-opacity"
          >
            {sending
              ? 'SENDING...'
              : `SEND TO ${selected.size} CLIENT${selected.size !== 1 ? 'S' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Thread View ───────────────────────────────────────────────────────────────

function ThreadView({
  client,
  trainerId,
  messages,
  onBack,
  onNewMessage,
}: {
  client: Client
  trainerId: string
  messages: Message[]
  onBack: () => void
  onNewMessage: (msg: Message) => void
}) {
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Mark unread as read
  useEffect(() => {
    supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('client_id', client.id)
      .eq('sender_role', 'client')
      .is('read_at', null)
      .then(() => {})
  }, [client.id])

  async function handleSend() {
    const text = input.trim()
    if (!text || sending) return

    setSending(true)
    setInput('')

    const tempId = `temp-${Date.now()}`
    const optimistic: Message = {
      id: tempId,
      client_id: client.id,
      sender_role: 'trainer',
      body: text,
      is_broadcast: false,
      broadcast_id: null,
      created_at: new Date().toISOString(),
      read_at: null,
    }
    onNewMessage(optimistic)

    const { data, error } = await supabase
      .from('messages')
      .insert({
        trainer_id: trainerId,
        client_id: client.id,
        sender_role: 'trainer',
        body: text,
        is_broadcast: false,
        created_at: new Date().toISOString(),
      })
      .select('id, client_id, sender_role, body, is_broadcast, broadcast_id, created_at, read_at')
      .single()

    if (!error && data) {
      // Replace temp with real (parent will handle via realtime)
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

  return (
    <div className="flex flex-col h-full">
      {/* Thread header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#2C2C2E]">
        <button onClick={onBack} className="text-[#888] hover:text-white mr-1">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className="w-9 h-9 rounded-full bg-[#2C2C2E] flex items-center justify-center">
          <span className="font-bebas text-[#C9A84C]">{initials(client.full_name)}</span>
        </div>
        <div>
          <p className="font-barlow text-white font-semibold text-sm">{client.full_name}</p>
          <p className="font-barlow text-[#555] text-xs capitalize">{client.status}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="font-barlow text-[#555] text-sm">No messages yet. Start the conversation.</p>
          </div>
        )}

        {messages.map((msg) => {
          const isTrainer = msg.sender_role === 'trainer'

          if (msg.is_broadcast) {
            return (
              <div key={msg.id} className="w-full">
                <div className="bg-[#1C1C1E] border-l-4 border-[#C9A84C] rounded-r-2xl rounded-bl-2xl px-4 py-3">
                  <p className="font-barlow text-[10px] text-[#C9A84C] uppercase tracking-widest mb-1">
                    📣 Broadcast
                  </p>
                  <p className="font-barlow text-white text-sm">{msg.body}</p>
                  <p className="font-barlow text-[#555] text-[10px] mt-2">{formatTime(msg.created_at)}</p>
                </div>
              </div>
            )
          }

          return (
            <div
              key={msg.id}
              className={`flex ${isTrainer ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[78%] px-4 py-3 ${
                  isTrainer
                    ? 'bg-[#C9A84C] text-black rounded-t-2xl rounded-bl-2xl rounded-br-sm'
                    : 'bg-[#2C2C2E] text-white rounded-t-2xl rounded-br-2xl rounded-bl-sm'
                }`}
              >
                <p className="font-barlow text-sm leading-relaxed">{msg.body}</p>
                <p className={`font-barlow text-[10px] mt-1 ${isTrainer ? 'text-black/50 text-right' : 'text-[#555]'}`}>
                  {formatTime(msg.created_at)}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[#2C2C2E] px-4 py-3">
        <div className="flex items-end gap-3">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${client.full_name}...`}
            className="flex-1 bg-[#2C2C2E] border border-[#3A3A3C] rounded-2xl px-4 py-3 text-white font-barlow text-sm placeholder-[#555] focus:outline-none focus:border-[#C9A84C] resize-none"
            style={{ maxHeight: '120px', overflowY: 'auto' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="flex-shrink-0 w-10 h-10 rounded-full bg-[#C9A84C] flex items-center justify-center disabled:opacity-40"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13M22 2L15 22L11 13M11 13L2 9L22 2" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Messages() {
  const { user } = useAuth()

  const [clients, setClients] = useState<Client[]>([])
  const [allMessages, setAllMessages] = useState<Message[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [showBroadcast, setShowBroadcast] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) loadData()
  }, [user])

  async function loadData() {
    if (!user) return

    const [{ data: clientData }, { data: msgData }] = await Promise.all([
      supabase
        .from('clients')
        .select('id, full_name, profile_id, status')
        .eq('trainer_id', user.id)
        .order('full_name', { ascending: true }),
      supabase
        .from('messages')
        .select('id, client_id, sender_role, body, is_broadcast, broadcast_id, created_at, read_at')
        .eq('trainer_id', user.id)
        .order('created_at', { ascending: true }),
    ])

    if (clientData) setClients(clientData)
    if (msgData) setAllMessages(msgData as Message[])
    setLoading(false)
  }

  // Realtime
  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel(`trainer-messages:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `trainer_id=eq.${user.id}`,
        },
        (payload) => {
          const newMsg = payload.new as Message
          setAllMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user])

  function addOptimisticMessage(msg: Message) {
    setAllMessages(prev => [...prev, msg])
  }

  // Build threads
  const threads: Thread[] = clients.map(client => {
    const clientMessages = allMessages.filter(m => m.client_id === client.id)
    const lastMessage = clientMessages.length
      ? clientMessages[clientMessages.length - 1]
      : null
    const unreadCount = clientMessages.filter(
      m => m.sender_role === 'client' && !m.read_at
    ).length
    return { client, lastMessage, unreadCount }
  }).sort((a, b) => {
    if (!a.lastMessage && !b.lastMessage) return 0
    if (!a.lastMessage) return 1
    if (!b.lastMessage) return -1
    return new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime()
  })

  const selectedMessages = selectedClient
    ? allMessages.filter(m => m.client_id === selectedClient.id)
    : []

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="font-bebas text-xl text-[#C9A84C] tracking-widest">LOADING...</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl h-[calc(100vh-80px)] flex flex-col">

      {/* Banner */}
      <div className="relative h-44 rounded-2xl overflow-hidden mb-6 flex-shrink-0">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=1600&q=80)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0A]/90 via-[#0A0A0A]/50 to-transparent" />
        <div className="relative h-full flex items-end justify-between px-8 pb-6">
          <div>
            <h1 className="font-bebas text-4xl text-white tracking-wide">Messages</h1>
            <p className="font-barlow text-sm text-white/50 mt-1">Stay connected with your clients</p>
          </div>
          <button
            onClick={() => setShowBroadcast(true)}
            className="flex items-center gap-2 bg-[#C9A84C] text-black font-bebas text-sm tracking-widest px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 8a6 6 0 01-7.743 5.743L10 14l-4 4-4-4 1.257-1.257A6 6 0 1118 8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            BROADCAST
          </button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex-1 flex gap-4 min-h-0">

        {/* Thread list */}
        <div className={`${selectedClient ? 'hidden lg:flex' : 'flex'} flex-col w-full lg:w-80 flex-shrink-0 bg-[#1C1C1E] rounded-2xl overflow-hidden`}>
          <div className="px-5 py-4 border-b border-[#2C2C2E]">
            <p className="font-bebas text-sm text-[#888] tracking-widest">CONVERSATIONS</p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {threads.length === 0 && (
              <div className="flex items-center justify-center h-40 px-6 text-center">
                <p className="font-barlow text-[#555] text-sm">No clients yet. Invite your first client to start messaging.</p>
              </div>
            )}

            {threads.map(({ client, lastMessage, unreadCount }) => (
              <button
                key={client.id}
                onClick={() => setSelectedClient(client)}
                className={`w-full flex items-center gap-3 px-5 py-4 border-b border-[#2C2C2E] hover:bg-[#2C2C2E] transition-colors text-left ${
                  selectedClient?.id === client.id ? 'bg-[#2C2C2E]' : ''
                }`}
              >
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-[#3A3A3C] flex items-center justify-center">
                    <span className="font-bebas text-[#C9A84C]">{initials(client.full_name)}</span>
                  </div>
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#C9A84C] rounded-full flex items-center justify-center">
                      <span className="font-barlow text-black text-[9px] font-bold">{unreadCount > 9 ? '9+' : unreadCount}</span>
                    </span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-barlow text-white text-sm font-semibold truncate">{client.full_name}</p>
                    {lastMessage && (
                      <p className="font-barlow text-[#555] text-[10px] flex-shrink-0 ml-2">{formatTime(lastMessage.created_at)}</p>
                    )}
                  </div>
                  <p className="font-barlow text-[#888] text-xs truncate mt-0.5">
                    {lastMessage
                      ? (lastMessage.is_broadcast ? '📣 ' : lastMessage.sender_role === 'trainer' ? 'You: ' : '') + lastMessage.body
                      : 'No messages yet'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Thread detail */}
        <div className={`${selectedClient ? 'flex' : 'hidden lg:flex'} flex-1 bg-[#1C1C1E] rounded-2xl overflow-hidden min-h-0`}>
          {selectedClient && user ? (
            <ThreadView
              client={selectedClient}
              trainerId={user.id}
              messages={selectedMessages}
              onBack={() => setSelectedClient(null)}
              onNewMessage={addOptimisticMessage}
            />
          ) : (
            <div className="flex items-center justify-center w-full flex-col gap-3">
              <svg width="48" height="48" viewBox="0 0 64 64" fill="none" className="opacity-20">
                <path d="M8 12C8 9.79 9.79 8 12 8h40c2.21 0 4 1.79 4 4v28c0 2.21-1.79 4-4 4H20l-8 8V12z" fill="#C9A84C" />
              </svg>
              <p className="font-barlow text-[#555] text-sm">Select a client to view their thread</p>
            </div>
          )}
        </div>
      </div>

      {/* Broadcast modal */}
      {showBroadcast && user && (
        <BroadcastModal
          clients={clients}
          trainerId={user.id}
          onClose={() => setShowBroadcast(false)}
          onSent={() => {
            setShowBroadcast(false)
            loadData()
          }}
        />
      )}
    </div>
  )
}
