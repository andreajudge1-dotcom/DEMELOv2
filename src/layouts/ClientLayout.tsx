import { Outlet, useLocation, useNavigate } from 'react-router-dom'

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

export default function ClientLayout() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <main className="pb-24">
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[#1C1C1E]/95 backdrop-blur border-t border-[#2C2C2E] z-50">
        <div className="max-w-[390px] mx-auto flex items-center justify-around px-2 py-2">
          {NAV_ITEMS.map(item => {
            const active = location.pathname === item.path
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="flex flex-col items-center gap-1 px-3 py-2 min-w-[56px] min-h-[56px] justify-center"
              >
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
      </nav>
    </div>
  )
}
