import { useRef, useState, useEffect } from 'react'

interface Option {
  value: string
  label: string
}

interface Props {
  value: string
  onChange: (value: string) => void
  options: Option[]
  className?: string
  style?: React.CSSProperties
  disabled?: boolean
  placeholder?: string
}

/**
 * A fully dark-themed select replacement.
 * Native <select> dropdowns cannot be reliably styled on iOS Safari —
 * this component uses a custom overlay so the list is always dark.
 */
export default function DarkSelect({ value, onChange, options, className = '', style, disabled, placeholder }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close when clicking outside
  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const selected = options.find(o => o.value === value)
  const label = selected?.label ?? placeholder ?? '—'

  return (
    <div ref={ref} className="relative w-full" style={{ zIndex: open ? 50 : undefined }}>
      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(v => !v)}
        className={`w-full text-center appearance-none cursor-pointer focus:outline-none ${className} ${disabled ? 'opacity-40 cursor-default' : ''}`}
        style={style}
      >
        {label}
      </button>

      {/* Dropdown list */}
      {open && (
        <div className="absolute left-0 top-full mt-0.5 min-w-[110px] bg-[#1C1C1E] border border-[#3A3A3C] rounded-lg shadow-2xl overflow-hidden z-50">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`w-full text-left px-3 py-2 font-barlow text-xs transition-colors
                ${opt.value === value
                  ? 'bg-[#C9A84C]/15 text-[#C9A84C]'
                  : 'text-white/80 hover:bg-white/[0.06]'
                }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
