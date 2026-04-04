import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// ── Types ────────────────────────────────────────────────────────────────────

interface PR {
  id: string
  exercise_name: string
  pr_type: string
  value: number
  logged_at: string
}

interface BodyWeightLog {
  id: string
  weight_lbs: number
  logged_at: string
}

// ── SVG Line Chart ────────────────────────────────────────────────────────────

function LineChart({ data, width = 300, height = 100 }: {
  data: { x: string; y: number }[]
  width?: number
  height?: number
}) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center h-[100px] text-[#555]">
        <span className="font-barlow text-sm">Not enough data yet</span>
      </div>
    )
  }

  const pad = { top: 10, right: 10, bottom: 24, left: 36 }
  const W = width - pad.left - pad.right
  const H = height - pad.top - pad.bottom

  const ys = data.map(d => d.y)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const rangeY = maxY - minY || 1

  const pts = data.map((d, i) => ({
    x: pad.left + (i / (data.length - 1)) * W,
    y: pad.top + H - ((d.y - minY) / rangeY) * H,
  }))

  const polyline = pts.map(p => `${p.x},${p.y}`).join(' ')
  const area = [
    `M${pts[0].x},${pad.top + H}`,
    ...pts.map(p => `L${p.x},${p.y}`),
    `L${pts[pts.length - 1].x},${pad.top + H}`,
    'Z',
  ].join(' ')

  // Y-axis labels
  const yLabels = [minY, Math.round((minY + maxY) / 2), maxY]

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
      <defs>
        <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#C9A84C" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#C9A84C" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {yLabels.map((_, i) => {
        const y = pad.top + (i === 0 ? H : i === 1 ? H / 2 : 0)
        return (
          <line
            key={i}
            x1={pad.left}
            y1={y}
            x2={pad.left + W}
            y2={y}
            stroke="#2C2C2E"
            strokeWidth="1"
          />
        )
      })}

      {/* Area fill */}
      <path d={area} fill="url(#goldGrad)" />

      {/* Line */}
      <polyline
        points={polyline}
        fill="none"
        stroke="#C9A84C"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Dots */}
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill="#C9A84C" />
      ))}

      {/* Y-axis labels */}
      {yLabels.map((val, i) => {
        const y = pad.top + (i === 0 ? H : i === 1 ? H / 2 : 0)
        return (
          <text
            key={i}
            x={pad.left - 4}
            y={y + 4}
            textAnchor="end"
            fill="#888"
            fontSize="9"
            fontFamily="Barlow, sans-serif"
          >
            {val}
          </text>
        )
      })}

      {/* X-axis labels — first and last only */}
      <text
        x={pad.left}
        y={height - 2}
        textAnchor="middle"
        fill="#888"
        fontSize="9"
        fontFamily="Barlow, sans-serif"
      >
        {data[0].x}
      </text>
      <text
        x={pad.left + W}
        y={height - 2}
        textAnchor="middle"
        fill="#888"
        fontSize="9"
        fontFamily="Barlow, sans-serif"
      >
        {data[data.length - 1].x}
      </text>
    </svg>
  )
}

// ── SVG Bar Chart ─────────────────────────────────────────────────────────────

function BarChart({ data, width = 300, height = 100 }: {
  data: { label: string; value: number }[]
  width?: number
  height?: number
}) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-[100px] text-[#555]">
        <span className="font-barlow text-sm">No sessions logged yet</span>
      </div>
    )
  }

  const pad = { top: 10, right: 10, bottom: 24, left: 42 }
  const W = width - pad.left - pad.right
  const H = height - pad.top - pad.bottom

  const maxVal = Math.max(...data.map(d => d.value), 1)
  const barW = Math.max(4, W / data.length - 4)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
      {data.map((d, i) => {
        const barH = (d.value / maxVal) * H
        const x = pad.left + i * (W / data.length) + (W / data.length - barW) / 2
        const y = pad.top + H - barH
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={barH}
              rx="2"
              fill="#C9A84C"
              opacity="0.85"
            />
            <text
              x={x + barW / 2}
              y={height - 2}
              textAnchor="middle"
              fill="#888"
              fontSize="8"
              fontFamily="Barlow, sans-serif"
            >
              {d.label}
            </text>
          </g>
        )
      })}
      {/* Baseline */}
      <line
        x1={pad.left}
        y1={pad.top + H}
        x2={pad.left + W}
        y2={pad.top + H}
        stroke="#2C2C2E"
        strokeWidth="1"
      />
      {/* Y max label */}
      <text
        x={pad.left - 4}
        y={pad.top + 6}
        textAnchor="end"
        fill="#888"
        fontSize="9"
        fontFamily="Barlow, sans-serif"
      >
        {maxVal >= 1000 ? `${Math.round(maxVal / 1000)}k` : maxVal}
      </text>
    </svg>
  )
}

// ── Log Weight Modal ──────────────────────────────────────────────────────────

function LogWeightModal({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (weight: number) => Promise<void>
}) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const w = parseFloat(value)
    if (!w || w <= 0) return
    setSaving(true)
    await onSave(w)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div
        className="w-full bg-[#1C1C1E] rounded-t-2xl p-6 pb-10"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-[#3A3A3C] rounded-full mx-auto mb-6" />
        <h3 className="font-bebas text-2xl text-white tracking-widest mb-6">LOG WEIGHT</h3>

        <label className="block font-barlow text-sm text-[#888] mb-2">Weight (lbs)</label>
        <input
          type="number"
          inputMode="decimal"
          placeholder="185.5"
          value={value}
          onChange={e => setValue(e.target.value)}
          className="w-full bg-[#2C2C2E] border border-[#3A3A3C] rounded-xl px-4 py-3 text-white font-barlow text-xl text-center focus:outline-none focus:border-[#C9A84C]"
          autoFocus
        />

        <button
          onClick={handleSave}
          disabled={saving || !value}
          className="mt-6 w-full py-4 rounded-xl font-bebas text-xl tracking-widest bg-[#C9A84C] text-black disabled:opacity-40"
        >
          {saving ? 'SAVING...' : 'SAVE'}
        </button>
        <button
          onClick={onClose}
          className="mt-3 w-full py-3 font-barlow text-[#888] text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const MAIN_LIFTS = ['Squat', 'Bench Press', 'Deadlift']

// ── Main Component ────────────────────────────────────────────────────────────

export default function Progress() {
  const { user } = useAuth()

  const [prs, setPRs] = useState<PR[]>([])
  const [bodyLogs, setBodyLogs] = useState<BodyWeightLog[]>([])
  const [weeklyVolume, setWeeklyVolume] = useState<{ label: string; value: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [showLogWeight, setShowLogWeight] = useState(false)
  const [activeChart, setActiveChart] = useState<string>(MAIN_LIFTS[0])

  useEffect(() => {
    if (user) loadData()
  }, [user])

  async function loadData() {
    setLoading(true)
    await Promise.all([loadPRs(), loadBodyWeight(), loadVolume()])
    setLoading(false)
  }

  async function loadPRs() {
    if (!user) return
    const { data } = await supabase
      .from('personal_records')
      .select('*')
      .eq('client_id', user.id)
      .order('logged_at', { ascending: false })
    if (data) setPRs(data)
  }

  async function loadBodyWeight() {
    if (!user) return
    const { data } = await supabase
      .from('body_weight_logs')
      .select('*')
      .eq('client_id', user.id)
      .order('logged_at', { ascending: true })
    if (data) setBodyLogs(data)
  }

  async function loadVolume() {
    if (!user) return
    // Get last 8 weeks of check-ins (use body_weight or check-in dates as proxy)
    // For now we use check_ins logged_at to approximate weekly volume
    const since = new Date()
    since.setDate(since.getDate() - 56) // 8 weeks

    const { data } = await supabase
      .from('check_ins')
      .select('logged_at')
      .eq('client_id', user.id)
      .gte('logged_at', since.toISOString())
      .order('logged_at', { ascending: true })

    if (!data) return

    // Bucket by week (Mon–Sun)
    const buckets: Record<string, number> = {}
    data.forEach(row => {
      const d = new Date(row.logged_at)
      const day = d.getDay()
      const monday = new Date(d)
      monday.setDate(d.getDate() - ((day + 6) % 7))
      const key = monday.toISOString().slice(0, 10)
      buckets[key] = (buckets[key] || 0) + 1
    })

    // Build last 8 week labels
    const weeks: { label: string; value: number }[] = []
    for (let i = 7; i >= 0; i--) {
      const monday = new Date()
      const day = monday.getDay()
      monday.setDate(monday.getDate() - ((day + 6) % 7) - i * 7)
      const key = monday.toISOString().slice(0, 10)
      const label = `W${monday.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}`
      weeks.push({ label, value: buckets[key] || 0 })
    }
    setWeeklyVolume(weeks)
  }

  async function handleLogWeight(weight: number) {
    if (!user) return
    await supabase.from('body_weight_logs').insert({
      client_id: user.id,
      weight_lbs: weight,
      logged_at: new Date().toISOString(),
    })
    setShowLogWeight(false)
    loadBodyWeight()
  }

  // Best PR per exercise
  function getBestPR(exerciseName: string, prType = '1RM') {
    const matches = prs.filter(
      p => p.exercise_name.toLowerCase() === exerciseName.toLowerCase() && p.pr_type === prType
    )
    if (!matches.length) return null
    return matches.reduce((best, cur) => (cur.value > best.value ? cur : best))
  }

  // All PRs for a lift sorted chronologically (for chart)
  function getChartData(exerciseName: string) {
    return prs
      .filter(p => p.exercise_name.toLowerCase() === exerciseName.toLowerCase() && p.pr_type === '1RM')
      .sort((a, b) => new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime())
      .map(p => ({ x: formatDate(p.logged_at), y: p.value }))
  }

  // Other PRs (non-main lifts)
  const otherPRs = prs.filter(
    p => !MAIN_LIFTS.some(l => l.toLowerCase() === p.exercise_name.toLowerCase()) && p.pr_type === '1RM'
  )
  // Dedupe to best per exercise
  const bestOtherPRs = Object.values(
    otherPRs.reduce<Record<string, PR>>((acc, pr) => {
      const key = pr.exercise_name.toLowerCase()
      if (!acc[key] || pr.value > acc[key].value) acc[key] = pr
      return acc
    }, {})
  )

  const bodyChartData = bodyLogs.map(b => ({
    x: formatDate(b.logged_at),
    y: b.weight_lbs,
  }))

  const latestWeight = bodyLogs.length ? bodyLogs[bodyLogs.length - 1] : null
  const firstWeight = bodyLogs.length > 1 ? bodyLogs[0] : null
  const weightDelta =
    latestWeight && firstWeight
      ? latestWeight.weight_lbs - firstWeight.weight_lbs
      : null

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <p className="font-bebas text-xl text-[#C9A84C] tracking-widest">LOADING...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-28">
      {/* Header */}
      <div className="px-5 pt-14 pb-6">
        <h1 className="font-bebas text-4xl text-white tracking-widest">PROGRESS</h1>
        <p className="font-barlow text-[#888] text-sm mt-1">Your strength journey</p>
      </div>

      {/* ── Section 1: Personal Records ── */}
      <section className="px-5 mb-8">
        <h2 className="font-bebas text-xl text-[#C9A84C] tracking-widest mb-4">PERSONAL RECORDS</h2>

        {/* Main lifts */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {MAIN_LIFTS.map(lift => {
            const pr = getBestPR(lift)
            return (
              <div key={lift} className="bg-[#1C1C1E] rounded-2xl p-4 flex flex-col items-center">
                <p className="font-barlow text-[#888] text-[10px] text-center mb-1 uppercase tracking-wide">
                  {lift}
                </p>
                <p className="font-bebas text-2xl text-white">
                  {pr ? `${pr.value}` : '—'}
                </p>
                {pr && (
                  <p className="font-barlow text-[#C9A84C] text-[10px]">lbs</p>
                )}
                {pr && (
                  <p className="font-barlow text-[#555] text-[9px] mt-1">
                    {formatDate(pr.logged_at)}
                  </p>
                )}
              </div>
            )
          })}
        </div>

        {/* Other PRs */}
        {bestOtherPRs.length > 0 && (
          <div className="bg-[#1C1C1E] rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#2C2C2E]">
              <p className="font-bebas text-sm text-[#888] tracking-widest">OTHER LIFTS</p>
            </div>
            {bestOtherPRs.map((pr, i) => (
              <div
                key={pr.id}
                className={`flex items-center justify-between px-4 py-3 ${
                  i < bestOtherPRs.length - 1 ? 'border-b border-[#2C2C2E]' : ''
                }`}
              >
                <div>
                  <p className="font-barlow text-white text-sm">{pr.exercise_name}</p>
                  <p className="font-barlow text-[#555] text-xs">{formatDate(pr.logged_at)}</p>
                </div>
                <div className="text-right">
                  <p className="font-bebas text-xl text-white">{pr.value}</p>
                  <p className="font-barlow text-[#C9A84C] text-[10px]">lbs</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {prs.length === 0 && (
          <div className="bg-[#1C1C1E] rounded-2xl p-6 text-center">
            <p className="font-barlow text-[#555] text-sm">No PRs logged yet.</p>
            <p className="font-barlow text-[#444] text-xs mt-1">Complete sessions to start tracking.</p>
          </div>
        )}
      </section>

      {/* ── Section 2: Strength Progress Charts ── */}
      <section className="px-5 mb-8">
        <h2 className="font-bebas text-xl text-[#C9A84C] tracking-widest mb-4">STRENGTH PROGRESS</h2>

        {/* Lift selector */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {MAIN_LIFTS.map(lift => (
            <button
              key={lift}
              onClick={() => setActiveChart(lift)}
              className={`flex-shrink-0 px-4 py-2 rounded-full font-barlow text-sm font-semibold transition-colors ${
                activeChart === lift
                  ? 'bg-[#C9A84C] text-black'
                  : 'bg-[#2C2C2E] text-[#888]'
              }`}
            >
              {lift}
            </button>
          ))}
        </div>

        <div className="bg-[#1C1C1E] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-bebas text-sm text-white tracking-wide">{activeChart.toUpperCase()} 1RM</p>
            {getBestPR(activeChart) && (
              <p className="font-barlow text-xs text-[#C9A84C]">
                Best: {getBestPR(activeChart)!.value} lbs
              </p>
            )}
          </div>
          <LineChart data={getChartData(activeChart)} height={120} />
        </div>
      </section>

      {/* ── Section 3: Weekly Volume ── */}
      <section className="px-5 mb-8">
        <h2 className="font-bebas text-xl text-[#C9A84C] tracking-widest mb-4">WEEKLY CHECK-INS</h2>
        <div className="bg-[#1C1C1E] rounded-2xl p-4">
          <p className="font-barlow text-[#888] text-xs mb-3">Check-ins per week (last 8 weeks)</p>
          <BarChart data={weeklyVolume} height={110} />
        </div>
      </section>

      {/* ── Section 4: Body Weight ── */}
      <section className="px-5 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bebas text-xl text-[#C9A84C] tracking-widest">BODY WEIGHT</h2>
          <button
            onClick={() => setShowLogWeight(true)}
            className="bg-[#C9A84C] text-black font-bebas text-sm tracking-widest px-4 py-2 rounded-full"
          >
            + LOG
          </button>
        </div>

        {/* Stats strip */}
        {latestWeight && (
          <div className="flex gap-3 mb-4">
            <div className="flex-1 bg-[#1C1C1E] rounded-2xl p-4 text-center">
              <p className="font-barlow text-[#888] text-xs mb-1">CURRENT</p>
              <p className="font-bebas text-2xl text-white">{latestWeight.weight_lbs}</p>
              <p className="font-barlow text-[#C9A84C] text-xs">lbs</p>
            </div>
            {weightDelta !== null && (
              <div className="flex-1 bg-[#1C1C1E] rounded-2xl p-4 text-center">
                <p className="font-barlow text-[#888] text-xs mb-1">CHANGE</p>
                <p
                  className={`font-bebas text-2xl ${
                    weightDelta < 0 ? 'text-green-400' : weightDelta > 0 ? 'text-red-400' : 'text-white'
                  }`}
                >
                  {weightDelta > 0 ? '+' : ''}{weightDelta.toFixed(1)}
                </p>
                <p className="font-barlow text-[#888] text-xs">lbs total</p>
              </div>
            )}
            {bodyLogs.length > 0 && (
              <div className="flex-1 bg-[#1C1C1E] rounded-2xl p-4 text-center">
                <p className="font-barlow text-[#888] text-xs mb-1">ENTRIES</p>
                <p className="font-bebas text-2xl text-white">{bodyLogs.length}</p>
                <p className="font-barlow text-[#888] text-xs">logged</p>
              </div>
            )}
          </div>
        )}

        <div className="bg-[#1C1C1E] rounded-2xl p-4">
          <LineChart data={bodyChartData} height={130} />
          {!bodyLogs.length && (
            <div className="text-center py-4">
              <p className="font-barlow text-[#555] text-sm">No weigh-ins logged yet.</p>
              <button
                onClick={() => setShowLogWeight(true)}
                className="mt-3 font-barlow text-[#C9A84C] text-sm underline"
              >
                Log your first weight
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Log Weight Modal */}
      {showLogWeight && (
        <LogWeightModal
          onClose={() => setShowLogWeight(false)}
          onSave={handleLogWeight}
        />
      )}
    </div>
  )
}
