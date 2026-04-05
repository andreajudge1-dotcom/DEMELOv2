import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const NAV_ITEMS = [
  { path: '/trainer/dashboard', label: 'Dashboard' },
  { path: '/trainer/clients', label: 'Clients' },
  { path: '/trainer/programs', label: 'Programs' },
  { path: '/trainer/exercises', label: 'Exercise Library' },
  { path: '/trainer/sessions', label: 'Sessions' },
  { path: '/trainer/messages', label: 'Messages' },
  { path: '/trainer/vault', label: 'Vault' },
  { path: '/trainer/nutrition', label: 'Nutrition' },
  { path: '/trainer/analytics', label: 'Analytics' },
  { path: '/trainer/settings', label: 'Settings' },
]

export default function TrainerLayout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen bg-[#0A0A0A]">
      {/* Sidebar */}
      <aside className="w-64 bg-[#0F0F0F] border-r border-white/[0.04] min-h-screen flex flex-col fixed left-0 top-0 bottom-0">
        {/* Logo */}
        <div className="p-6 border-b border-white/[0.06]">
          <h1 className="font-bebas text-2xl text-[#C9A84C] tracking-wide">Z6</h1>
          <p className="font-barlow text-xs text-white/40 uppercase tracking-widest mt-0.5">Trainer Portal</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-4 flex flex-col gap-1">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `px-4 py-2.5 rounded-lg font-barlow text-sm transition-colors ${
                  isActive
                    ? 'bg-[#C9A84C] text-black font-semibold'
                    : 'text-white/60 hover:text-white hover:bg-white/[0.05]'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User + Sign out */}
        <div className="p-4 border-t border-white/[0.06]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-[#C9A84C]/20 border border-[#C9A84C]/40 flex items-center justify-center">
              <span className="font-bebas text-sm text-[#C9A84C]">
                {profile?.full_name?.charAt(0) ?? 'T'}
              </span>
            </div>
            <div>
              <p className="font-barlow text-sm text-white font-medium">{profile?.full_name ?? 'Trainer'}</p>
              <p className="font-barlow text-xs text-white/40">Trainer</p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full text-left px-4 py-2 rounded-lg font-barlow text-sm text-white/40 hover:text-white hover:bg-white/[0.05] transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-64 p-8 min-h-screen">
        <Outlet />
      </main>
    </div>
  )
}
