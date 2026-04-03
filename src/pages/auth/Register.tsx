import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

export default function Register() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'trainer' | 'client'>('trainer')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signUp } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signUp(email, password, fullName, role)
    if (error) {
      if (error.message.toLowerCase().includes('already registered') || error.message.toLowerCase().includes('already exists')) {
        setError('An account with this email already exists. Try signing in instead.')
      } else {
        setError(error.message)
      }
      setLoading(false)
      return
    }

    if (role === 'trainer') {
      navigate('/trainer/dashboard')
      return
    }

    // Client — get the current session (guaranteed by signUp flow)
    const { data: sessionData } = await supabase.auth.getSession()
    const user = sessionData.session?.user

    if (user) {
      const { data: clientRow } = await supabase
        .from('clients')
        .select('id')
        .eq('email', email.trim().toLowerCase())
        .maybeSingle()

      if (clientRow) {
        await supabase.from('clients').update({ profile_id: user.id }).eq('id', clientRow.id)
        navigate('/onboarding')
        return
      }
    }

    navigate('/client/home')
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col">
      {/* Hero background */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=1200&q=80')`,
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/85 to-[#0A0A0A]/50" />

      {/* Content */}
      <div className="relative z-10 flex flex-col min-h-screen p-8 max-w-sm mx-auto w-full">
        {/* Logo */}
        <div className="mt-12">
          <h1 className="font-bebas text-4xl text-[#C9A84C] tracking-wide">DeMelo</h1>
          <p className="font-barlow text-xs text-white/40 uppercase tracking-widest mt-1">Fitness Platform</p>
        </div>

        {/* Headline */}
        <div className="mt-8 mb-6">
          <h2 className="font-bebas text-4xl text-white leading-none tracking-wide">
            START YOUR<br />
            <span className="text-[#C9A84C]">JOURNEY.</span>
          </h2>
        </div>

        {/* Role toggle */}
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => setRole('trainer')}
            className={`flex-1 py-2.5 rounded-lg font-bebas text-sm tracking-widest transition-colors ${
              role === 'trainer'
                ? 'bg-[#C9A84C] text-black'
                : 'bg-[#1C1C1E] text-white/50 border border-[#2C2C2E]'
            }`}
          >
            I AM A TRAINER
          </button>
          <button
            type="button"
            onClick={() => setRole('client')}
            className={`flex-1 py-2.5 rounded-lg font-bebas text-sm tracking-widest transition-colors ${
              role === 'client'
                ? 'bg-[#C9A84C] text-black'
                : 'bg-[#1C1C1E] text-white/50 border border-[#2C2C2E]'
            }`}
          >
            I AM A CLIENT
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 mb-6">
          {error && (
            <p className="font-barlow text-sm text-[#E05555] bg-[#E05555]/10 border border-[#E05555]/20 rounded-lg px-4 py-3">
              {error}
            </p>
          )}
          <input
            type="text"
            placeholder="Full name"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            required
            className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-lg px-4 py-3 text-white font-barlow text-sm placeholder:text-white/30 focus:outline-none focus:border-[#C9A84C] transition-colors"
          />
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-lg px-4 py-3 text-white font-barlow text-sm placeholder:text-white/30 focus:outline-none focus:border-[#C9A84C] transition-colors"
          />
          <input
            type="password"
            placeholder="Password (min 6 characters)"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-lg px-4 py-3 text-white font-barlow text-sm placeholder:text-white/30 focus:outline-none focus:border-[#C9A84C] transition-colors"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#C9A84C] text-black font-bebas text-lg tracking-widest rounded-lg py-3 mt-1 hover:bg-[#E2C070] transition-colors disabled:opacity-50"
          >
            {loading ? 'CREATING ACCOUNT...' : 'CREATE ACCOUNT'}
          </button>
        </form>

        <p className="font-barlow text-sm text-white/40 text-center mb-8">
          Already have an account?{' '}
          <Link to="/login" className="text-[#C9A84C]">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
