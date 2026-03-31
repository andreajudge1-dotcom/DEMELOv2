import { Outlet } from 'react-router-dom'

export default function ClientLayout() {
  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      <main className="pb-20">
        <Outlet />
      </main>
      <nav className="fixed bottom-0 left-0 right-0 bg-[#1C1C1E] border-t border-[#2C2C2E] p-4">
        <p className="font-bebas text-center text-[#C9A84C] tracking-wide">DeMelo</p>
      </nav>
    </div>
  )
}
