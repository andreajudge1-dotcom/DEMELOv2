import { useState, useEffect, useRef, useCallback } from 'react'

export interface AutocompleteItem {
  id: string
  name: string
}

interface Props {
  placeholder?: string
  onSelect: (item: AutocompleteItem) => void
  fetchResults: (query: string) => Promise<AutocompleteItem[]>
  selectedValue?: string
  disabled?: boolean
  className?: string
}

// Highlight matching portion of text in gold
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <span>{text}</span>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <span>{text}</span>
  return (
    <span>
      {text.slice(0, idx)}
      <span className="text-[#C9A84C] font-semibold">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </span>
  )
}

export default function AutocompleteSearch({
  placeholder = 'Search...',
  onSelect,
  fetchResults,
  selectedValue = '',
  disabled = false,
  className = '',
}: Props) {
  const [inputValue, setInputValue] = useState(selectedValue)
  const [results, setResults] = useState<AutocompleteItem[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [highlighted, setHighlighted] = useState<number>(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync selectedValue prop → input when it changes externally
  useEffect(() => {
    setInputValue(selectedValue)
  }, [selectedValue])

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([])
      setOpen(false)
      return
    }
    setLoading(true)
    setOpen(true)
    const items = await fetchResults(q)
    setResults(items)
    setHighlighted(-1)
    setLoading(false)
  }, [fetchResults])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setInputValue(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(val), 150)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted(h => Math.min(h + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlighted >= 0 && results[highlighted]) {
        selectItem(results[highlighted])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  function selectItem(item: AutocompleteItem) {
    setInputValue(item.name)
    setOpen(false)
    setResults([])
    onSelect(item)
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (inputValue.length >= 2 && results.length > 0) setOpen(true) }}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className={`w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-lg px-4 py-2.5 font-barlow text-sm text-white placeholder-white/30 outline-none transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            open ? 'border-[#C9A84C]/60' : 'focus:border-[#C9A84C]'
          }`}
        />
        {/* Loading spinner */}
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-3.5 h-3.5 border-2 border-[#C9A84C]/30 border-t-[#C9A84C] rounded-full animate-spin" />
          </div>
        )}
        {/* Clear button — shown when something is typed */}
        {!loading && inputValue && (
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); setInputValue(''); setResults([]); setOpen(false); inputRef.current?.focus() }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50 transition-colors text-base leading-none"
          >
            ×
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1.5 w-full bg-[#1C1C1E] border border-[#2C2C2E] rounded-xl shadow-xl overflow-hidden">
          {loading && results.length === 0 ? (
            <div className="px-4 py-3 flex items-center gap-2">
              <div className="w-3 h-3 border-2 border-[#C9A84C]/30 border-t-[#C9A84C] rounded-full animate-spin flex-shrink-0" />
              <span className="font-barlow text-xs text-white/40">Searching...</span>
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-3">
              <span className="font-barlow text-xs text-white/40 italic">No results found</span>
            </div>
          ) : (
            <ul className="max-h-[216px] overflow-y-auto">
              {results.map((item, i) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onMouseDown={e => { e.preventDefault(); selectItem(item) }}
                    className={`w-full text-left px-4 py-2.5 font-barlow text-sm transition-colors ${
                      i === highlighted
                        ? 'bg-[#C9A84C] text-black'
                        : 'text-white hover:bg-[#242424]'
                    }`}
                  >
                    <HighlightMatch
                      text={item.name}
                      query={i === highlighted ? '' : inputValue}
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
