/**
 * 平台领域模型定义。
 * 与 supabase/schema.sql 中的表结构一一对应，改表时请同步修改本文件。
 */

export type UserRole = 'teacher' | 'student'

export type AssignmentStatus =
  | 'pending' // 待提交
  | 'submitted' // 已提交，待批改
  | 'reviewing' // 老师批改中
  | 'feedback_ready' // 反馈已发布
  | 'revising' // 学生修改中
  | 'completed' // 已完成

export interface Profile {
  id: string
  role: UserRole
  full_name: string
  email: string | null
  teacher_id: string | null
  created_at: string
}

export interface InviteCode {
  code: string
  created_by: string
  note: string | null
  max_uses: number
  used_count: number
  active: boolean
  expires_at: string | null
  created_at: string
}

/** 学生上传的文章图片（存 Storage 路径而非完整 URL，读取时再换签名链接） */
export interface ArticleImage {
  path: string
  name: string
  width?: number
  height?: number
}

export interface Assignment {
  id: string
  teacher_id: string
  student_id: string
  title: string
  description: string | null
  status: AssignmentStatus
  due_at: string | null
  created_at: string
  updated_at: string
}

export interface Submission {
  id: string
  assignment_id: string
  student_id: string
  version: number
  article_images: ArticleImage[]
  audio_path: string | null
  video_path: string | null
  note: string | null
  created_at: string
}

/**
 * 老师在图片上的批注。坐标一律用 0~1 的相对值存储，
 * 这样在手机 / 平板上按任意尺寸渲染都能对齐。
 */
export type AnnotationType = 'pen' | 'circle' | 'rect' | 'arrow' | 'text'

export interface Annotation {
  id: string
  type: AnnotationType
  color: string
  /** 该批注画在第几张文章图片上 */
  imageIndex: number
  /**
   * pen / circle / arrow：折线或端点轨迹的相对坐标。
   * `w` 是笔画粗细倍率（1 = 基准线宽），由 Apple Pencil 的压感换算而来；
   * 鼠标、手指等无压感设备不写该字段，渲染时按 1 处理。
   */
  points?: Array<{ x: number; y: number; w?: number }>
  /** rect：左上角与宽高（相对值） */
  rect?: { x: number; y: number; w: number; h: number }
  /** text：文字内容与锚点 */
  text?: string
  anchor?: { x: number; y: number }
  /** 批注创建时间，用于回放讲解顺序 */
  createdAt?: number
}

export interface Feedback {
  id: string
  submission_id: string
  teacher_id: string
  annotations: Annotation[]
  audio_path: string | null
  video_path: string | null
  overall_comment: string | null
  created_at: string
}

/** 老师看板的一行（对应 teacher_board 视图） */
export interface TeacherBoardRow {
  assignment_id: string
  teacher_id: string
  title: string
  description: string | null
  status: AssignmentStatus
  due_at: string | null
  created_at: string
  updated_at: string
  student_name: string
  student_email: string | null
  latest_submission_id: string | null
  latest_version: number | null
  latest_submitted_at: string | null
  feedback_id: string | null
  is_overdue: boolean
}

/** 看板列定义：老师按这一顺序看作业流转 */
export const BOARD_COLUMNS: Array<{ status: AssignmentStatus; label: string; hint: string }> = [
  { status: 'pending', label: '待提交', hint: '已布置，学生尚未提交' },
  { status: 'submitted', label: '待批改', hint: '学生已提交，等待老师反馈' },
  { status: 'feedback_ready', label: '待修改', hint: '反馈已发布，等待学生修改' },
  { status: 'completed', label: '已完成', hint: '批改通过，闭环结束' },
]

export const STATUS_META: Record<AssignmentStatus, { label: string; className: string }> = {
  pending: { label: '待提交', className: 'bg-slate-100 text-slate-600 ring-slate-200' },
  submitted: { label: '待批改', className: 'bg-amber-100 text-amber-700 ring-amber-200' },
  reviewing: { label: '批改中', className: 'bg-sky-100 text-sky-700 ring-sky-200' },
  feedback_ready: { label: '待修改', className: 'bg-brand-100 text-brand-700 ring-brand-200' },
  revising: { label: '修改中', className: 'bg-violet-100 text-violet-700 ring-violet-200' },
  completed: { label: '已完成', className: 'bg-emerald-100 text-emerald-700 ring-emerald-200' },
}
