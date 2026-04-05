export default function Vault() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-24">
      <div className="max-w-[390px] mx-auto px-4 pt-8">
        <h1 className="font-bebas text-3xl text-white tracking-wide mb-2">Vault</h1>
        <p className="font-barlow text-sm text-white/40 mb-8">Documents and resources from your coach.</p>
        <div className="bg-[#1C1C1E] border border-[#2C2C2E] rounded-2xl p-8 text-center">
          <svg className="w-10 h-10 text-white/10 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
          <p className="font-barlow text-sm text-white/25">Nothing here yet. Your coach will add resources as needed.</p>
        </div>
      </div>
    </div>
  )
}
