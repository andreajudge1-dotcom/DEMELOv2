export default function Clients() {
  return (
    <div className="max-w-5xl">
      {/* Banner */}
      <div className="relative h-48 rounded-2xl overflow-hidden mb-8">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=1600&q=80)' }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0A]/90 via-[#0A0A0A]/50 to-transparent" />
        <div className="relative h-full flex flex-col justify-end px-8 pb-6">
          <h1 className="font-bebas text-4xl text-white tracking-wide">Clients</h1>
          <p className="font-barlow text-sm text-white/50 mt-1">Manage your roster</p>
        </div>
        <div className="absolute bottom-6 right-6">
          <button className="bg-[#C9A84C] text-black font-bebas text-sm tracking-widest px-5 py-2.5 rounded-lg hover:bg-[#E2C070] transition-colors">
            + Add Client
          </button>
        </div>
      </div>

      {/* Coming soon placeholder */}
      <div className="bg-[#1C1C1E] rounded-xl border border-[#2C2C2E] p-16 text-center">
        <p className="font-bebas text-2xl text-white/20 tracking-wide mb-2">Coming Soon</p>
        <p className="font-barlow text-sm text-white/30">Client management is being built out.</p>
      </div>
    </div>
  )
}
