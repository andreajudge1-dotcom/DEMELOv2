import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const GOALS = [
  'Compete in powerlifting',
  'Build strength',
  'Lose weight',
  'General fitness',
  'Other',
]

const EXPERIENCE_LEVELS = [
  'Just getting started',
  '1 to 3 years',
  '3 or more years',
]

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ClientInfo {
  id: string
  full_name: string
  email: string
  trainer_id: string
  trainer_name: string
  prefilled_goal: string | null
  prefilled_experience: string | null
  prefilled_limitations: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Step indicator — 5 dots
// ─────────────────────────────────────────────────────────────────────────────

function StepDots({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2.5 justify-center mb-10">
      {[1, 2, 3, 4, 5].map(s => (
        <div
          key={s}
          className="w-2.5 h-2.5 rounded-full border transition-all duration-300"
          style={{
            backgroundColor: s <= current ? '#C9A84C' : 'transparent',
            borderColor: s <= current ? '#C9A84C' : '#3A3A3C',
            transform: s === current ? 'scale(1.2)' : 'scale(1)',
          }}
        />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function Onboarding() {
  const navigate = useNavigate()
  const finishFiredRef = useRef(false)

  // ── Gate state ──
  const [checking, setChecking] = useState(true)

  // ── Step state ──
  const [step, setStep] = useState(1)
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null)

  // ── Step 2 ──
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [accountError, setAccountError] = useState('')
  const [creatingAccount, setCreatingAccount] = useState(false)

  // ── Step 3 ──
  const [goal, setGoal] = useState('')
  const [experience, setExperience] = useState('')
  const [limitations, setLimitations] = useState('')
  const [editingAbout, setEditingAbout] = useState(false)

  // ── Step 4 ──
  const [squat, setSquat] = useState('')
  const [bench, setBench] = useState('')
  const [deadlift, setDeadlift] = useState('')

  // ── Step 5 ──
  const [notifEnabled, setNotifEnabled] = useState(true)
  const [notifTime, setNotifTime] = useState('08:00')

  // ─────────────────────────────────────────────────────────────────────────
  // Mount: detect auth tokens in URL, establish session
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    initInvite()
  }, [])

  // Step 6: fire background actions once, auto-navigate after 3s
  useEffect(() => {
    if (step !== 6) return
    if (!finishFiredRef.current) {
      finishFiredRef.current = true
      runBackgroundActions()
    }
    const timer = setTimeout(() => navigate('/client/home'), 3000)
    return () => clearTimeout(timer)
  }, [step])

  async function initInvite() {
    const searchParams = new URLSearchParams(window.location.search)
    const code = searchParams.get('code')
    const tokenHash = searchParams.get('token_hash')
    const typeParam = searchParams.get('type')

    const hash = window.location.hash
    const hashParams = new URLSearchParams(hash.substring(1))
    const accessToken = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')
    const hashType = hashParams.get('type')

    let email: string | null = null

    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      if (error || !data.session) { navigate('/login'); return }
      email = data.session.user.email ?? null

    } else if (tokenHash && (typeParam === 'invite' || typeParam === 'magiclink' || typeParam === 'email')) {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: (typeParam as any) ?? 'invite',
      })
      if (error || !data.session) { navigate('/login'); return }
      email = data.session.user.email ?? null

    } else if (accessToken && (hashType === 'invite' || hashType === 'magiclink')) {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken ?? '',
      })
      if (error || !data.session) { navigate('/login'); return }
      email = data.session.user.email ?? null

    } else {
      // No token — wait briefly in case session was already set
      await new Promise(res => setTimeout(res, 500))
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user?.email) {
        email = session.user.email
      } else {
        navigate('/login')
        return
      }
    }

    if (!email) { navigate('/login'); return }
    await loadClientInfo(email)
    setChecking(false)
  }

  async function loadClientInfo(email: string) {
    const { data: clientRow } = await supabase
      .from('clients')
      .select('id, full_name, email, trainer_id, goal, experience, limitations')
      .eq('email', email)
      .maybeSingle()

    let trainerName = 'Your trainer'
    if (clientRow?.trainer_id) {
      const { data: trainerRow } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', clientRow.trainer_id)
        .single()
      trainerName = trainerRow?.full_name ?? 'Your trainer'
    }

    const info: ClientInfo = {
      id: clientRow?.id ?? '',
      full_name: clientRow?.full_name ?? email.split('@')[0],
      email,
      trainer_id: clientRow?.trainer_id ?? '',
      trainer_name: trainerName,
      prefilled_goal: clientRow?.goal ?? null,
      prefilled_experience: clientRow?.experience ?? null,
      prefilled_limitations: clientRow?.limitations ?? null,
    }

    setClientInfo(info)

    // Pre-fill step 3 state if trainer already entered these
    if (clientRow?.goal) setGoal(clientRow.goal)
    if (clientRow?.experience) setExperience(clientRow.experience)
    if (clientRow?.limitations) setLimitations(clientRow.limitations)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 2 — Create Account
  // ─────────────────────────────────────────────────────────────────────────

  async function handleCreateAccount() {
    setAccountError('')
    if (password.length < 8) { setAccountError('Password must be at least 8 characters.'); return }
    if (password !== confirmPassword) { setAccountError('Passwords do not match.'); return }

    setCreatingAccount(true)

    const { error: pwErr } = await supabase.auth.updateUser({ password })
    if (pwErr) { setAccountError(pwErr.message); setCreatingAccount(false); return }

    const { data: { user } } = await supabase.auth.getUser()
    if (user && clientInfo?.id) {
      await supabase.from('profiles').upsert({
        id: user.id,
        full_name: clientInfo.full_name,
        role: 'client',
      }, { onConflict: 'id' })

      await supabase.from('clients').update({ profile_id: user.id }).eq('id', clientInfo.id)
    }

    setCreatingAccount(false)
    setStep(3)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 3 — save About You to clients table
  // ─────────────────────────────────────────────────────────────────────────

  async function handleAboutNext() {
    if (clientInfo?.id) {
      await supabase.from('clients').update({
        goal: goal || null,
        experience: experience || null,
        limitations: limitations || null,
      }).eq('id', clientInfo.id)
    }
    setStep(4)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step 6 background actions
  // ─────────────────────────────────────────────────────────────────────────

  async function runBackgroundActions() {
    if (!clientInfo?.id) return

    // 1. Update client — active + onboarding_completed + notification prefs
    await supabase.from('clients').update({
      status: 'active',
      onboarding_completed: true,
      notification_preference: notifEnabled,
      notification_time: notifEnabled ? notifTime : null,
    }).eq('id', clientInfo.id)

    // 2. Write training maxes (lbs → kg)
    const maxEntries = [
      { exercise_name: 'Squat', lbs: squat },
      { exercise_name: 'Bench Press', lbs: bench },
      { exercise_name: 'Deadlift', lbs: deadlift },
    ].filter(e => e.lbs.trim() !== '' && !isNaN(parseFloat(e.lbs)))

    for (const entry of maxEntries) {
      const kg = Math.round((parseFloat(entry.lbs) / 2.2046) * 10) / 10
      await supabase.from('training_maxes').upsert({
        client_id: clientInfo.id,
        trainer_id: clientInfo.trainer_id || null,
        exercise_name: entry.exercise_name,
        max_kg: kg,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'client_id,exercise_name' })
    }

    // 3. Insert notification for trainer
    if (clientInfo.trainer_id) {
      await supabase.from('notifications').insert({
        profile_id: clientInfo.trainer_id,
        type: 'onboarding_complete',
        title: 'Client ready for program',
        body: `${clientInfo.full_name} has completed onboarding and is ready for program assignment.`,
        data: { client_id: clientInfo.id },
      })
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Derived
  // ─────────────────────────────────────────────────────────────────────────

  const firstName = clientInfo?.full_name.split(' ')[0] ?? 'there'
  const trainerName = clientInfo?.trainer_name ?? 'Your trainer'
  const trainerPrefilledAbout = !!(clientInfo?.prefilled_goal || clientInfo?.prefilled_experience)

  // ─────────────────────────────────────────────────────────────────────────
  // Loading gate
  // ─────────────────────────────────────────────────────────────────────────

  if (checking) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-[#C9A84C]/30 border-t-[#C9A84C] rounded-full animate-spin" />
          <p className="font-barlow text-sm text-white/30">Setting up your profile...</p>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center px-5 py-12">
      <div className="w-full max-w-[480px]">

        {/* Logo */}
        <p className="font-bebas text-2xl text-[#C9A84C] tracking-[0.3em] text-center mb-10">
          Z6
        </p>

        {/* Step dots — hide on ready screen */}
        {step < 6 && <StepDots current={step} />}

        {/* ── STEP 1 — WELCOME ── */}
        {step === 1 && (
          <div className="flex flex-col items-center text-center gap-6">
            <div className="w-20 h-20 rounded-full bg-[#C9A84C]/15 flex items-center justify-center">
              <span className="font-bebas text-3xl text-[#C9A84C]">
                {firstName.charAt(0)}
              </span>
            </div>
            <div>
              <h1 className="font-bebas text-5xl text-white tracking-wide leading-tight">
                Hey {firstName}.
              </h1>
              <p className="font-barlow text-white/50 text-base mt-3 leading-relaxed">
                {trainerName} has set up your training<br />profile on Z6.
              </p>
            </div>
            <button
              onClick={() => setStep(2)}
              className="w-full bg-[#C9A84C] text-black font-bebas text-xl tracking-widest py-4 rounded-2xl hover:bg-[#E2C070] transition-colors mt-2 min-h-[56px]"
            >
              Get Started
            </button>
          </div>
        )}

        {/* ── STEP 2 — CREATE ACCOUNT ── */}
        {step === 2 && (
          <div className="flex flex-col gap-5">
            <div>
              <h1 className="font-bebas text-4xl text-white tracking-wide">Create Your Account</h1>
              <p className="font-barlow text-white/40 text-sm mt-1">Set a password to secure your profile.</p>
            </div>

            {accountError && (
              <p className="font-barlow text-sm text-red-400 bg-red-500/10 border border-red-500/20 px-4 py-3 rounded-xl">
                {accountError}
              </p>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="font-barlow text-xs text-white/40 uppercase tracking-wider">Email</label>
              <input
                type="email"
                value={clientInfo?.email ?? ''}
                disabled
                className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-xl px-4 py-3.5 font-barlow text-sm text-white/35 cursor-not-allowed"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-barlow text-xs text-white/40 uppercase tracking-wider">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoFocus
                autoComplete="new-password"
                className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-xl px-4 py-3.5 font-barlow text-sm text-white placeholder-white/20 outline-none focus:border-[#C9A84C]/50 transition-colors"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-barlow text-xs text-white/40 uppercase tracking-wider">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                autoComplete="new-password"
                onKeyDown={e => e.key === 'Enter' && handleCreateAccount()}
                className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-xl px-4 py-3.5 font-barlow text-sm text-white placeholder-white/20 outline-none focus:border-[#C9A84C]/50 transition-colors"
              />
            </div>

            <button
              onClick={handleCreateAccount}
              disabled={creatingAccount || !password || !confirmPassword}
              className="w-full bg-[#C9A84C] text-black font-bebas text-xl tracking-widest py-4 rounded-2xl hover:bg-[#E2C070] transition-colors disabled:opacity-40 mt-2 min-h-[56px]"
            >
              {creatingAccount ? 'Creating Account...' : 'Create Account'}
            </button>
          </div>
        )}

        {/* ── STEP 3 — ABOUT YOU ── */}
        {step === 3 && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="font-bebas text-4xl text-white tracking-wide">About You</h1>
              <p className="font-barlow text-white/40 text-sm mt-1">
                Help {trainerName} understand your goals.
              </p>
            </div>

            {/* If trainer pre-filled and not editing — show confirmation */}
            {trainerPrefilledAbout && !editingAbout ? (
              <div className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="font-barlow text-xs text-white/40 uppercase tracking-wider">Pre-filled by {trainerName}</p>
                  <button
                    onClick={() => setEditingAbout(true)}
                    className="font-barlow text-xs text-[#C9A84C] hover:text-[#E2C070] transition-colors"
                  >
                    Edit
                  </button>
                </div>
                {goal && (
                  <div>
                    <p className="font-barlow text-xs text-white/30 mb-1">Goal</p>
                    <span className="bg-[#C9A84C]/15 text-[#C9A84C] font-barlow text-sm px-3 py-1.5 rounded-full">
                      {goal}
                    </span>
                  </div>
                )}
                {experience && (
                  <div>
                    <p className="font-barlow text-xs text-white/30 mb-1">Experience</p>
                    <span className="bg-[#C9A84C]/15 text-[#C9A84C] font-barlow text-sm px-3 py-1.5 rounded-full">
                      {experience}
                    </span>
                  </div>
                )}
                {limitations && (
                  <div>
                    <p className="font-barlow text-xs text-white/30 mb-1">Limitations</p>
                    <p className="font-barlow text-sm text-white/70">{limitations}</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* Main Goal */}
                <div>
                  <p className="font-barlow text-xs text-white/40 uppercase tracking-wider mb-3">Main Goal</p>
                  <div className="flex flex-wrap gap-2">
                    {GOALS.map(g => (
                      <button
                        key={g}
                        onClick={() => setGoal(g === goal ? '' : g)}
                        className="px-4 py-2.5 rounded-full font-barlow text-sm border transition-colors min-h-[44px]"
                        style={goal === g
                          ? { background: '#C9A84C', color: '#000', borderColor: '#C9A84C' }
                          : { background: 'transparent', color: 'rgba(255,255,255,0.6)', borderColor: '#3A3A3C' }
                        }
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Experience */}
                <div>
                  <p className="font-barlow text-xs text-white/40 uppercase tracking-wider mb-3">Training Experience</p>
                  <div className="flex flex-wrap gap-2">
                    {EXPERIENCE_LEVELS.map(e => (
                      <button
                        key={e}
                        onClick={() => setExperience(e === experience ? '' : e)}
                        className="px-4 py-2.5 rounded-full font-barlow text-sm border transition-colors min-h-[44px]"
                        style={experience === e
                          ? { background: '#C9A84C', color: '#000', borderColor: '#C9A84C' }
                          : { background: 'transparent', color: 'rgba(255,255,255,0.6)', borderColor: '#3A3A3C' }
                        }
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Limitations */}
                <div>
                  <p className="font-barlow text-xs text-white/40 uppercase tracking-wider mb-2">
                    Injuries or Limitations <span className="normal-case text-white/25 ml-1">— optional</span>
                  </p>
                  <textarea
                    value={limitations}
                    onChange={e => setLimitations(e.target.value)}
                    placeholder="Anything your coach should know when building your program"
                    rows={3}
                    className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-xl px-4 py-3.5 font-barlow text-sm text-white placeholder-white/20 outline-none focus:border-[#C9A84C]/50 transition-colors resize-none"
                  />
                </div>
              </>
            )}

            <button
              onClick={handleAboutNext}
              className="w-full bg-[#C9A84C] text-black font-bebas text-xl tracking-widest py-4 rounded-2xl hover:bg-[#E2C070] transition-colors min-h-[56px]"
            >
              Next
            </button>
          </div>
        )}

        {/* ── STEP 4 — TRAINING MAXES ── */}
        {step === 4 && (
          <div className="flex flex-col gap-5">
            <div>
              <h1 className="font-bebas text-4xl text-white tracking-wide">Your Best Lifts</h1>
              <p className="font-barlow text-white/40 text-sm mt-1">
                Not sure? Enter your best guess — {trainerName} can always update these.
              </p>
            </div>

            {[
              { label: 'Squat', val: squat, set: setSquat },
              { label: 'Bench Press', val: bench, set: setBench },
              { label: 'Deadlift', val: deadlift, set: setDeadlift },
            ].map(({ label, val, set }) => (
              <div key={label} className="flex flex-col gap-1.5">
                <label className="font-barlow text-xs text-white/40 uppercase tracking-wider">
                  {label} <span className="text-white/25 normal-case">(lbs)</span>
                </label>
                <input
                  type="number"
                  value={val}
                  onChange={e => set(e.target.value)}
                  placeholder="e.g. 225"
                  min="0"
                  className="w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-xl px-4 py-3.5 font-barlow text-sm text-white placeholder-white/20 outline-none focus:border-[#C9A84C]/50 transition-colors"
                />
              </div>
            ))}

            <button
              onClick={() => setStep(5)}
              className="w-full bg-[#C9A84C] text-black font-bebas text-xl tracking-widest py-4 rounded-2xl hover:bg-[#E2C070] transition-colors mt-2 min-h-[56px]"
            >
              Next
            </button>
            <button
              onClick={() => { setSquat(''); setBench(''); setDeadlift(''); setStep(5) }}
              className="w-full font-barlow text-sm text-white/30 hover:text-white/60 transition-colors py-3 min-h-[44px]"
            >
              Skip for now
            </button>
          </div>
        )}

        {/* ── STEP 5 — NOTIFICATIONS ── */}
        {step === 5 && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="font-bebas text-4xl text-white tracking-wide">Stay on Track</h1>
              <p className="font-barlow text-white/40 text-sm mt-1">Get reminders on your training days.</p>
            </div>

            <div className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-barlow font-semibold text-white text-sm">Training day reminders</p>
                  <p className="font-barlow text-xs text-white/35 mt-0.5">We'll notify you on your scheduled days</p>
                </div>
                <button
                  onClick={() => setNotifEnabled(v => !v)}
                  className="relative w-12 h-6 rounded-full flex-shrink-0 transition-colors duration-200"
                  style={{ background: notifEnabled ? '#C9A84C' : '#3A3A3C' }}
                  aria-label="Toggle reminders"
                >
                  <span
                    className="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all duration-200"
                    style={{ left: notifEnabled ? 28 : 4 }}
                  />
                </button>
              </div>

              {notifEnabled && (
                <div className="mt-4 pt-4 border-t border-[#2C2C2E]">
                  <p className="font-barlow text-xs text-white/40 uppercase tracking-wider mb-2">Reminder Time</p>
                  <input
                    type="time"
                    value={notifTime}
                    onChange={e => setNotifTime(e.target.value)}
                    className="bg-[#2C2C2E] border border-[#3A3A3C] rounded-lg px-3 py-2.5 font-barlow text-sm text-white outline-none focus:border-[#C9A84C]/50 transition-colors"
                  />
                </div>
              )}
            </div>

            <button
              onClick={() => setStep(6)}
              className="w-full bg-[#C9A84C] text-black font-bebas text-xl tracking-widest py-4 rounded-2xl hover:bg-[#E2C070] transition-colors min-h-[56px]"
            >
              Next
            </button>
          </div>
        )}

        {/* ── STEP 6 — READY ── */}
        {step === 6 && (
          <div className="flex flex-col items-center text-center gap-8 pt-4">
            {/* Animated pulse rings */}
            <div className="relative w-28 h-28 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-[#C9A84C]/10 animate-ping" style={{ animationDuration: '2s' }} />
              <div className="absolute inset-3 rounded-full bg-[#C9A84C]/10 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
              <div className="relative w-20 h-20 rounded-full bg-[#C9A84C]/20 flex items-center justify-center">
                <svg className="w-10 h-10 text-[#C9A84C]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
              </div>
            </div>

            <div>
              <h1 className="font-bebas text-5xl text-white tracking-wide leading-tight">
                You're all set,<br />{firstName}.
              </h1>
              <p className="font-barlow text-white/50 text-base mt-4 leading-relaxed max-w-sm">
                {trainerName} is reviewing your profile and will assign your program shortly.
              </p>
            </div>

            {/* Pulse dots */}
            <div className="flex items-center gap-2 mt-2">
              {[0, 300, 600].map(delay => (
                <div
                  key={delay}
                  className="w-2 h-2 rounded-full bg-[#C9A84C]/50 animate-pulse"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </div>

            <p className="font-barlow text-xs text-white/20">Taking you to your dashboard...</p>
          </div>
        )}

      </div>
    </div>
  )
}
