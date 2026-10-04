import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  loading: boolean
  /** 是否已完成首次会话探测（用于避免路由守卫闪屏） */
  initialized: boolean
  signIn: (email: string, password: string) => Promise<Profile>
  signUpWithInvite: (params: {
    email: string
    password: string
    fullName: string
    inviteCode: string
  }) => Promise<{ needsEmailConfirm: boolean }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** 把 Supabase 抛出的英文错误码翻译成给学生看的提示 */
export function translateAuthError(message: string): string {
  const raw = message.toUpperCase()
  if (raw.includes('INVITE_CODE_REQUIRED')) return '请输入老师发给你的邀请码。'
  if (raw.includes('INVITE_CODE_INVALID')) return '邀请码不存在，请检查是否输入有误。'
  if (raw.includes('INVITE_CODE_INACTIVE')) return '该邀请码已停用，请联系老师重新生成。'
  if (raw.includes('INVITE_CODE_EXPIRED')) return '该邀请码已过期，请联系老师重新生成。'
  if (raw.includes('INVITE_CODE_EXHAUSTED')) return '该邀请码的使用次数已达上限。'
  if (raw.includes('INVALID LOGIN') || raw.includes('INVALID_GRANT'))
    return '邮箱或密码不正确。'
  if (raw.includes('ALREADY REGISTERED') || raw.includes('ALREADY EXISTS'))
    return '该邮箱已注册，请直接登录。'
  if (raw.includes('PASSWORD SHOULD BE AT LEAST'))
    return '密码长度至少 6 位。'
  if (raw.includes('EMAIL NOT CONFIRMED')) return '邮箱尚未验证，请先到邮箱点击确认链接。'
  if (raw.includes('RATE LIMIT'))
    return '邮件发送过于频繁，已触发 Supabase 的频率限制（免费版内置邮件服务每小时约 2 封）。请稍后再试；开发阶段可在 Supabase 后台关闭「Confirm email」跳过邮件验证。'
  if (raw.includes('NOT AUTHORIZED'))
    return '这个邮箱收不到验证邮件。Supabase 免费版的内置邮件服务只能发给项目成员，正式使用需要配置自有 SMTP。'
  if (raw.includes('OTP_EXPIRED') || raw.includes('LINK IS INVALID'))
    return '邮件里的确认链接已失效或已被使用过。'
  return message
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)

  const fetchProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null)
      return null
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.error('[auth] 读取 profiles 失败：', error.message)
      setProfile(null)
      return null
    }
    setProfile((data as Profile) ?? null)
    return data as Profile | null
  }, [])

  // 首次挂载：恢复会话 + 订阅后续登录态变化
  useEffect(() => {
    let active = true

    void (async () => {
      const { data } = await supabase.auth.getSession()
      if (!active) return
      setSession(data.session)
      await fetchProfile(data.session?.user.id)
      if (!active) return
      setLoading(false)
      setInitialized(true)
    })()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      void fetchProfile(nextSession?.user.id).then(() => setLoading(false))
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [fetchProfile])

  const signIn = useCallback(
    async (email: string, password: string) => {
      setLoading(true)
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw new Error(translateAuthError(error.message))

        const p = await fetchProfile(data.user?.id)
        if (!p) throw new Error('登录成功但未找到用户档案，请联系老师处理。')
        return p
      } finally {
        setLoading(false)
      }
    },
    [fetchProfile],
  )

  const signUpWithInvite = useCallback<AuthContextValue['signUpWithInvite']>(
    async ({ email, password, fullName, inviteCode }) => {
      setLoading(true)
      try {
        // 注册前先做一次本地校验，让错误提示更快更友好；
        // 真正的把关仍在数据库触发器里，前端绕过也没用。
        const { data: valid, error: checkError } = await supabase.rpc('check_invite_code', {
          p_code: inviteCode,
        })
        if (checkError) throw new Error(checkError.message)
        if (!valid) throw new Error('邀请码无效、已过期或使用次数已用尽。')

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              invite_code: inviteCode.trim().toUpperCase(),
              // 注意：这里刻意不传 role。
              // 角色完全由数据库触发器决定（老师邮箱白名单），
              // 前端传什么都无效——传了反而会让人误以为前端能定身份。
            },
          },
        })
        if (error) throw new Error(translateAuthError(error.message))

        return { needsEmailConfirm: !data.session }
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
    setSession(null)
  }, [])

  const refreshProfile = useCallback(async () => {
    await fetchProfile(session?.user.id)
  }, [fetchProfile, session?.user.id])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      loading,
      initialized,
      signIn,
      signUpWithInvite,
      signOut,
      refreshProfile,
    }),
    [session, profile, loading, initialized, signIn, signUpWithInvite, signOut, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuthContext() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth 必须在 <AuthProvider> 内部使用')
  return ctx
}
