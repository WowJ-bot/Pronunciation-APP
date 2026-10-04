import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // 故意不抛异常：先让页面能跑起来，方便照常调试 UI
  console.warn(
    '[supabase] 未检测到 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY。\n' +
      '请把 .env.example 复制为 .env.local 并填入 Supabase 项目的真实配置，然后重启 dev server。',
  )
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

/** 两个私有 bucket，路径约定见 supabase/schema.sql 第 7 节 */
export const BUCKETS = {
  submissions: 'submissions',
  feedback: 'feedback',
} as const

/**
 * 生成规范的存储路径：{teacherId}/{studentId}/{assignmentId}/{fileName}
 * RLS 依赖这个层级来判断归属，请不要随意改动顺序。
 */
export function buildStoragePath(params: {
  teacherId: string
  studentId: string
  assignmentId: string
  fileName: string
}) {
  const safeName = params.fileName.replace(/[^\w.\-]+/g, '_')
  return `${params.teacherId}/${params.studentId}/${params.assignmentId}/${Date.now()}-${safeName}`
}

/** 私有文件的临时访问链接（默认 1 小时） */
export async function createSignedUrl(bucket: string, path: string, expiresIn = 3600) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn)
  if (error) throw error
  return data.signedUrl
}
