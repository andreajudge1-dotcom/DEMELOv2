import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await signIn(email, password)
    if (error) {
      setError('Invalid email or password')
      setLoading(false)
      return
    }

    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      setError('Something went wrong')
      setLoading(false)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single()

    if (profile?.role === 'trainer') {
      navigate('/trainer/dashboard')
    } else {
      navigate('/client/home')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200&q=80')`,
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/80 to-[#0A0A0A]/40" />
      <div className="relative z-10 flex flex-col min-h-screen p-8 max-w-sm mx-auto w-full">
        <div className="mt-12">
          <h1 className="font-bebas text-4xl text-[#C9A84C] tracking-wide">Z6</h1>
          <p className="font-barlow text-xs text-white/40 uppercase tracking-widest mt-1">Training Platform</p>
        </div>
        <div className="mt-auto mb-8">
          <h2 className="font-bebas text-5xl text-white leading-none tracking-wide">
            TRAIN<br />
            <span className="text-[#C9A84C]">SMARTER.</span><br />
            PERFORM<br />
            BETTER.
          </h2>
          <p className="font-barlow text-sm text-white/50 mt-4">
            Your coach. Your program. Your results.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 mb-8">
          {error && (
            <p className="font-barlow text-sm text-[#E05555] bg-[#E05555]/10 border border-[#E05555]/20 rounded-lg px-4 py-3">
              {error}
            </p>
          )}
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
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-lg px-4 py-3 text-white font-barlow text-sm placeholder:text-white/30 focus:outline-none focus:border-[#C9A84C] transition-colors"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#C9A84C] text-black font-bebas text-lg tracking-widest rounded-lg py-3 mt-1 hover:bg-[#E2C070] transition-colors disabled:opacity-50"
          >
            {loading ? 'SIGNING IN...' : 'SIGN IN'}
          </button>
        </form>
        <p className="font-barlow text-sm text-white/40 text-center mb-8">
          Don't have an account?{' '}
          <Link to="/register" className="text-[#C9A84C]">
            Get started
          </Link>
        </p>
      </div>
    </div>
  )
}
