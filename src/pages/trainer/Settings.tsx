export default function Settings() {
  return (
    <div className="max-w-5xl">
      {/* Banner */}
      <div className="relative h-48 rounded-2xl overflow-hidden mb-8">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?w=1600&q=80)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0A]/90 via-[#0A0A0A]/50 to-transparent" />
        <div className="relative h-full flex flex-col justify-end px-8 pb-6">
          <h1 className="font-bebas text-4xl text-white tracking-wide">Settings</h1>
          <p className="font-barlow text-sm text-white/50 mt-1">Manage your account and preferences</p>
        </div>
      </div>

      {/* Coming soon placeholder */}
      <div className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] p-16 text-center">
        <p className="font-bebas text-2xl text-white/20 tracking-wide mb-2">Coming Soon</p>
        <p className="font-barlow text-sm text-white/30">Account settings are being built out.</p>
      </div>
    </div>
  )
}
