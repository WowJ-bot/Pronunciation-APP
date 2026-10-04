import { useAuthContext } from '@/contexts/AuthContext'

/** 鉴权信息的统一入口，页面只依赖这个 hook */
export function useAuth() {
  const { session, profile, loading, initialized, signIn, signUpWithInvite, signOut, refreshProfile } =
    useAuthContext()

  return {
    session,
    user: session?.user ?? null,
    profile,
    isTeacher: profile?.role === 'teacher',
    isStudent: profile?.role === 'student',
    loading,
    initialized,
    signIn,
    signUpWithInvite,
    signOut,
    refreshProfile,
  }
}
