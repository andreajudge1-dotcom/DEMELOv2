interface Props {
  title: string
  body: string
  stayLabel?: string
  leaveLabel?: string
  onStay: () => void
  onLeave: () => void
}

/**
 * Full-screen overlay modal shown when the user tries to navigate away
 * from a page with unsaved work.
 */
export default function NavigationGuardModal({
  title,
  body,
  stayLabel = 'Stay',
  leaveLabel = 'Leave anyway',
  onStay,
  onLeave,
}: Props) {
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center px-6 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#1C1C1E] border border-[#3A3A3C] rounded-2xl w-full max-w-sm p-6 shadow-2xl">
        {/* Warning icon */}
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-yellow-500/10 flex items-center justify-center">
          <svg className="w-6 h-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>

        <h2 className="font-bebas text-2xl text-white tracking-wide text-center mb-2">{title}</h2>
        <p className="font-barlow text-sm text-white/60 text-center leading-relaxed mb-6">{body}</p>

        <div className="flex flex-col gap-3">
          <button
            onClick={onStay}
            className="w-full bg-[#C9A84C] text-black font-bebas text-base tracking-widest py-3 rounded-xl hover:bg-[#E2C070] transition-colors"
          >
            {stayLabel}
          </button>
          <button
            onClick={onLeave}
            className="w-full font-barlow text-sm text-white/40 hover:text-white/70 transition-colors py-2"
          >
            {leaveLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
