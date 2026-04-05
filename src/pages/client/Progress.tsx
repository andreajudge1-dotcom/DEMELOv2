import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface BigThreeLift {
  name: string
  bestWeight: number | null
  bestReps: number | null
  estimated1RM: number | null
  date: string | null
}

interface PRRecord {
  exercise_name: string
  best_weight: number
  best_reps: number
  date: string
}

// Epley formula: 1RM = weight * (1 + reps * 0.0333)
function epley(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return weight
  if (reps === 1) return weight
  return Math.round(weight * (1 + reps * 0.0333))
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const BIG_THREE = ['Squat', 'Bench Press', 'Deadlift']

function matchesBigThree(exerciseName: string, liftName: string): boolean {
  return exerciseName.toLowerCase().includes(liftName.toLowerCase())
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function Progress() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [bigThree, setBigThree] = useState<BigThreeLift[]>([])
  const [allPRs, setAllPRs] = useState<PRRecord[]>([])

  useEffect(() => {
    if (profile?.id) loadProgress(profile.id)
  }, [profile])

  async function loadProgress(userId: string) {
    setLoading(true)

    // Get client id
    const { data: clientRow } = await supabase
      .from('clients')
      .select('id')
      .eq('profile_id', userId)
      .maybeSingle()
    if (!clientRow) { setLoading(false); return }

    // Fetch all logged sets with exercise names
    const { data: sets } = await supabase
      .from('session_sets')
      .select('weight_kg, reps_completed, created_at, session_exercises!inner(exercise_id, exercises!inner(name), sessions!inner(client_id, status))')
      .eq('session_exercises.sessions.client_id', clientRow.id)
      .eq('session_exercises.sessions.status', 'completed')
      .not('weight_kg', 'is', null)
      .not('reps_completed', 'is', null)

    // Also try personal_records table
    const { data: prRecords } = await supabase
      .from('personal_records')
      .select('exercise_name, pr_type, value, logged_at')
      .eq('client_id', clientRow.id)
      .order('logged_at', { ascending: false })

    // Build exercise map from session_sets
    const exerciseMap: Record<string, { weight: number; reps: number; e1rm: number; date: string }[]> = {}
    for (const s of sets ?? []) {
      const se = s.session_exercises as any
      const name = se?.exercises?.name ?? ''
      const w = s.weight_kg ?? 0
      const r = s.reps_completed ?? 0
      if (!name || w <= 0) continue

      if (!exerciseMap[name]) exerciseMap[name] = []
      exerciseMap[name].push({
        weight: w,
        reps: r,
        e1rm: epley(w, r),
        date: s.created_at ?? '',
      })
    }

    // Big Three
    const bigThreeResults: BigThreeLift[] = BIG_THREE.map(liftName => {
      let best: { weight: number; reps: number; e1rm: number; date: string } | null = null

      for (const [exName, entries] of Object.entries(exerciseMap)) {
        if (!matchesBigThree(exName, liftName)) continue
        for (const entry of entries) {
          if (!best || entry.e1rm > best.e1rm) {
            best = entry
          }
        }
      }

      return {
        name: liftName,
        bestWeight: best?.weight ?? null,
        bestReps: best?.reps ?? null,
        estimated1RM: best?.e1rm ?? null,
        date: best?.date ?? null,
      }
    })
    setBigThree(bigThreeResults)

    // All PRs — prefer personal_records table, fall back to session_sets
    if (prRecords && prRecords.length > 0) {
      // Group by exercise, take best weight
      const prMap: Record<string, { weight: number; reps: number; date: string }> = {}
      for (const pr of prRecords) {
        if (pr.pr_type === 'weight') {
          if (!prMap[pr.exercise_name] || pr.value > prMap[pr.exercise_name].weight) {
            prMap[pr.exercise_name] = {
              weight: pr.value,
              reps: 0,
              date: pr.logged_at ?? '',
            }
          }
        }
        if (pr.pr_type === 'reps' && prMap[pr.exercise_name]) {
          prMap[pr.exercise_name].reps = Math.max(prMap[pr.exercise_name].reps, pr.value)
        }
      }
      setAllPRs(
        Object.entries(prMap)
          .map(([name, data]) => ({ exercise_name: name, best_weight: data.weight, best_reps: data.reps, date: data.date }))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      )
    } else {
      // Fall back to calculating from session_sets
      const prFromSets: PRRecord[] = Object.entries(exerciseMap).map(([name, entries]) => {
        const bestByWeight = entries.reduce((best, e) => e.weight > best.weight ? e : best, entries[0])
        const bestByReps = entries.reduce((best, e) => e.reps > best.reps ? e : best, entries[0])
        return {
          exercise_name: name,
          best_weight: bestByWeight.weight,
          best_reps: bestByReps.reps,
          date: bestByWeight.date,
        }
      }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      setAllPRs(prFromSets)
    }

    setLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#C9A84C]/30 border-t-[#C9A84C] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-24">
      <div className="max-w-[390px] mx-auto px-4 pt-8">

        {/* ── SECTION 1: THE BIG THREE ── */}
        <h1 className="font-bebas text-3xl text-white tracking-wide mb-4">Strength Progress</h1>

        <div className="flex flex-col gap-3 mb-8">
          {bigThree.map(lift => (
            <div key={lift.name} className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-2xl p-5">
              <p className="font-bebas text-lg text-white tracking-wide mb-2">{lift.name}</p>
              {lift.bestWeight !== null ? (
                <>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-bebas text-4xl text-[#C9A84C]">{lift.bestWeight}</span>
                    <span className="font-barlow text-sm text-white/40">lbs</span>
                    {lift.bestReps !== null && lift.bestReps > 0 && (
                      <span className="font-barlow text-xs text-white/30 ml-2">x {lift.bestReps} reps</span>
                    )}
                  </div>
                  {lift.date && (
                    <p className="font-barlow text-xs text-white/30 mt-1">{fmtDate(lift.date)}</p>
                  )}
                  {lift.estimated1RM !== null && (
                    <p className="font-barlow text-xs text-white/40 mt-1.5">
                      Estimated 1RM: <span className="text-white/60">{lift.estimated1RM} lbs</span>
                    </p>
                  )}
                </>
              ) : (
                <div>
                  <span className="font-bebas text-4xl text-white/15">—</span>
                  <p className="font-barlow text-xs text-white/25 mt-1">No sessions logged yet</p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── SECTION 2: ALL PERSONAL RECORDS ── */}
        <h2 className="font-bebas text-2xl text-white tracking-wide mb-3">All Personal Records</h2>

        {allPRs.length === 0 ? (
          <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-2xl p-8 text-center">
            <p className="font-barlow text-sm text-white/30">Your PRs will appear here after your first session.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {allPRs.map((pr, i) => (
              <div key={i} className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] rounded-xl px-4 py-3 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-barlow text-sm text-white truncate">{pr.exercise_name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-bebas text-base text-[#C9A84C]">{pr.best_weight} <span className="text-xs text-[#C9A84C]/60">lbs</span></span>
                    {pr.best_reps > 0 && (
                      <span className="font-barlow text-xs text-white/30">x {pr.best_reps} reps</span>
                    )}
                  </div>
                </div>
                {pr.date && (
                  <span className="font-barlow text-xs text-white/25 flex-shrink-0">{fmtDate(pr.date)}</span>
                )}
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
