import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { CheckInProvider, useCheckIn } from '../contexts/CheckInContext'

// ── Nav items ─────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  {
    label: 'Home',
    path: '/client/home',
    icon: (active: boolean) => (
      <svg className="w-5 h-5" fill={active ? '#C9A84C' : 'none'} viewBox="0 0 24 24" stroke={active ? '#C9A84C' : 'rgba(255,255,255,0.3)'} strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    label: 'Check-in',
    path: '/client/checkin',
    icon: (active: boolean) => (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke={active ? '#C9A84C' : 'rgba(255,255,255,0.3)'} strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    label: 'Program',
    path: '/client/program',
    icon: (active: boolean) => (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke={active ? '#C9A84C' : 'rgba(255,255,255,0.3)'} strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  },
  {
    label: 'Progress',
    path: '/client/progress',
    icon: (active: boolean) => (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke={active ? '#C9A84C' : 'rgba(255,255,255,0.3)'} strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
  },
  {
    label: 'Messages',
    path: '/client/messages',
    icon: (active: boolean) => (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke={active ? '#C9A84C' : 'rgba(255,255,255,0.3)'} strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
  {
    label: 'Vault',
    path: '/client/vault',
    icon: (active: boolean) => (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke={active ? '#C9A84C' : 'rgba(255,255,255,0.3)'} strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
      </svg>
    ),
  },
]

// ── Inner layout (uses CheckIn context) ───────────────────────────────────────

function ClientLayoutInner() {
  const location = useLocation()
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const { hasCheckedInThisWeek } = useCheckIn()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const firstName = profile?.full_name?.split(' ')[0] ?? 'Client'
  const avatarInitial = profile?.full_name?.charAt(0)?.toUpperCase() ?? 'C'

  // Check-in tab status indicator
  // null = loading (show nothing), false = due (gold dot), true = done (green check)
  const checkInDue = hasCheckedInThisWeek === false
  const checkInDone = hasCheckedInThisWeek === true

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <main className="pb-[112px]">
        <Outlet />
      </main>

      {/* Bottom nav — mirrors trainer sidebar bottom section */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[#1C1C1E] border-t border-[#2C2C2E] z-50">
        <div className="max-w-[390px] mx-auto">

          {/* User strip */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#2C2C2E]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#C9A84C]/20 border border-[#C9A84C]/40 flex items-center justify-center">
                <span className="font-bebas text-sm text-[#C9A84C]">{avatarInitial}</span>
              </div>
              <div>
                <p className="font-barlow text-sm text-white font-medium leading-tight">{firstName}</p>
                <p className="font-barlow text-xs text-white/40 leading-tight">Athlete</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="font-barlow text-sm text-white/50 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-[#2C2C2E]"
            >
              Sign out
            </button>
          </div>

          {/* Tab icons */}
          <div className="flex items-center justify-around px-2 py-2">
            {NAV_ITEMS.map(item => {
              const active = location.pathname === item.path
              const isCheckIn = item.path === '/client/checkin'

              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className="relative flex flex-col items-center gap-1 px-3 py-1.5 min-w-[52px] justify-center"
                >
                  {/* Check-in status badge */}
                  {isCheckIn && checkInDue && (
                    <span className="absolute -top-0.5 right-3 w-2 h-2 rounded-full bg-[#C9A84C]" />
                  )}
                  {isCheckIn && checkInDone && (
                    <span className="absolute -top-0.5 right-3 w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center">
                      <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                        <path d="M1 3L3 5L7 1" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  )}

                  {item.icon(active)}

                  <span
                    className="font-barlow text-[10px] tracking-wide"
                    style={{ color: active ? '#C9A84C' : 'rgba(255,255,255,0.3)' }}
                  >
                    {item.label}
                  </span>
                  {active && (
                    <div className="w-1 h-1 rounded-full bg-[#C9A84C]" />
                  )}
                </button>
              )
            })}
          </div>

        </div>
      </nav>
    </div>
  )
}

// ── Exported layout — wraps inner with provider ───────────────────────────────

export default function ClientLayout() {
  return (
    <CheckInProvider>
      <ClientLayoutInner />
    </CheckInProvider>
  )
}
