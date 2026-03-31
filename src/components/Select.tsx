import { useState, useRef, useEffect } from 'react'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
}

export default function Select({ value, onChange, options, placeholder = 'Select...', className = '' }: SelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const selected = options.find(o => o.value === value)
  const label = selected?.label ?? placeholder

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border font-barlow text-sm transition-colors text-left ${
          open
            ? 'bg-[#1C1C1E] border-[#C9A84C] text-white'
            : 'bg-[#1C1C1E] border-[#2C2C2E] text-white hover:border-[#3A3A3C]'
        }`}
      >
        <span className={selected ? 'text-white' : 'text-white/30'}>{label}</span>
        <svg
          className={`w-3.5 h-3.5 text-white/40 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-xl overflow-hidden shadow-xl max-h-60 overflow-y-auto">
          {placeholder && (
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false) }}
              className={`w-full text-left px-4 py-2.5 font-barlow text-sm transition-colors ${
                value === '' ? 'text-white bg-[#2C2C2E]' : 'text-white/30 hover:bg-[#242424] hover:text-white'
              }`}
            >
              {placeholder}
            </button>
          )}
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`w-full text-left px-4 py-2.5 font-barlow text-sm transition-colors flex items-center justify-between ${
                value === opt.value
                  ? 'text-[#C9A84C] bg-[#C9A84C]/10'
                  : 'text-white hover:bg-[#242424]'
              }`}
            >
              {opt.label}
              {value === opt.value && (
                <svg className="w-3.5 h-3.5 text-[#C9A84C]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
