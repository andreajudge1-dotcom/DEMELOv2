import { createContext, useContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface Profile {
  id: string
  full_name: string | null
  role: 'trainer' | 'client'
  avatar_url: string | null
}

interface AuthContextType {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string, fullName: string, role: 'trainer' | 'client') => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
    setLoading(false)
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signUp(email: string, password: string, fullName: string, role: 'trainer' | 'client') {
    // Try sign-in first — if it works the account already exists (skip signUp to avoid magic link emails)
    const { data: existingSignIn } = await supabase.auth.signInWithPassword({ email, password })
    if (!existingSignIn.user) {
      // Account doesn't exist yet — create it
      const { error: signUpErr } = await supabase.auth.signUp({ email, password })
      if (signUpErr) return { error: signUpErr }

      // Now sign in to get a guaranteed session
      const { data: newSignIn, error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
      if (signInErr || !newSignIn.user) {
        return { error: signInErr ?? new Error('Could not sign in after registration') }
      }
    }

    // At this point we have a valid session — get the current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: new Error('Could not retrieve user after sign in') }

    const uid = user.id
    await supabase.from('profiles').upsert({ id: uid, full_name: fullName, role }, { onConflict: 'id' })
    if (role === 'trainer') await supabase.from('trainers').upsert({ id: uid, business_name: fullName }, { onConflict: 'id' })
    return { error: null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
