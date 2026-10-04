# 架构说明

## 1. 角色与权限模型

| | 老师 | 学生 |
| --- | --- | --- |
| 注册方式 | 控制台创建 + SQL 改 role | 邀请码自助注册 |
| 可见范围 | 自己的学生、自己布置的全部作业 | 仅自己的作业 |
| 主要动作 | 布置作业、批注、录讲解、看板流转、确认完成 | 上传图片、录音录像、查看反馈、重新提交 |

权限落点在**数据库**，不在前端：

- 邀请码校验写在 `auth.users` 的 `AFTER INSERT` 触发器 `handle_new_user()` 里。
  不是有效的邀请码，这次注册就会被数据库拒绝 —— 前端就算被绕过也注册不进来。
- 所有业务表开启 RLS。老师只能读写 `teacher_id = auth.uid()` 的行，
  学生只能读写 `student_id = auth.uid()` 的行。

## 2. 数据模型

```
auth.users
    │ 1:1
    ▼
profiles ──────────────┐ teacher_id 自引用
   │ role: teacher     │ （学生 → 所属老师）
   │ role: student ◄───┘
   │
   ├── invite_codes   （created_by → profiles.id）
   │
   └── assignments    （teacher_id, student_id）
           │ 1:N
           ▼
       submissions   （version 递增，保留全部历史）
           │ 1:1
           ▼
         feedback    （annotations jsonb + 讲解音视频）
```

### 表说明

| 表 | 关键字段 | 说明 |
| --- | --- | --- |
| `profiles` | `role`, `teacher_id` | 与 `auth.users` 一对一，触发器自动创建 |
| `invite_codes` | `max_uses`, `used_count`, `expires_at` | 支持一人一码或一码多人 |
| `teacher_allowlist` | `email` | 老师邮箱白名单，注册时决定 `role`；对客户端完全不可见 |
| `assignments` | `status`, `due_at` | 作业状态机的主体 |
| `submissions` | `version`, `article_images`, `audio_path`, `video_path` | 每交一次 +1 版 |
| `feedback` | `annotations`, `audio_path`, `video_path` | 每版提交最多一条反馈 |
| `teacher_board`（视图） | 全部 + `is_overdue` | 看板一次查询取全量 |

### 批注结构（`feedback.annotations`）

坐标一律用 **0~1 的相对值**，与图片像素尺寸解耦：

```jsonc
[
  { "id": "an_x1", "type": "pen",   "color": "#ef4444", "imageIndex": 0,
    "points": [{ "x": 0.31, "y": 0.42 }, { "x": 0.33, "y": 0.45 }] },

  { "id": "an_x2", "type": "circle","color": "#f59e0b", "imageIndex": 0,
    "rect": { "x": 0.28, "y": 0.38, "w": 0.12, "h": 0.06 } },

  { "id": "an_x3", "type": "arrow", "color": "#3b82f6", "imageIndex": 0,
    "points": [{ "x": 0.5, "y": 0.6 }, { "x": 0.42, "y": 0.44 }] },

  { "id": "an_x4", "type": "text",  "color": "#0f172a", "imageIndex": 0,
    "text": "th 要咬舌", "anchor": { "x": 0.55, "y": 0.52 } }
]
```

图片以 `article_images: [{ path, name, width, height }]` 形式存在 `submissions` 里，
只存 Storage 路径，渲染时换成签名 URL。

## 3. 作业状态机

```
pending ──学生提交──► submitted ──老师打开批改──► reviewing
                          │                          │
                          └──── 老师发布反馈 ────────┘
                                     │
                                     ▼
                              feedback_ready
                                     │
                          学生重新提交 │
                                     ▼
                                submitted …（循环）
                                     │
                          老师点「通过并结课」
                                     ▼
                                 completed
```

`revising` 表示学生已看到反馈、正在准备下一版（保留给后续做「正在修改」提示用）。
看板把 `reviewing` 归入「待批改」、`revising` 归入「待修改」，避免列过多。

## 4. 存储布局

两个私有 bucket，路径层级刻意设计成能直接被 RLS 解析：

```
submissions/{teacher_id}/{student_id}/{assignment_id}/{timestamp}-{filename}
feedback/{teacher_id}/{student_id}/{assignment_id}/{timestamp}-{filename}
```

- 第 1 段是老师 → 老师可读整个目录
- 第 2 段是学生 → 学生可读自己的、且只能往这里写

Storage 策略直接取 `(storage.foldername(name))[1]` / `[2]` 与 `auth.uid()` 比对，
不需要回表查 `assignments`，策略简单且高效。

前端统一通过 `buildStoragePath()` 生成路径，保证层级不会写错。

## 5. 前端数据流

```
AuthContext（会话 + profiles）
   │
   ├── useAuth()              页面与守卫都从这里读角色
   ├── useTeacherBoard()      老师看板，按状态分组
   ├── useStudentAssignments() 学生作业列表
   ├── useAssignmentDetail()  详情：作业 + 全部版本 + 每版反馈
   └── useSignedUrl(s)()      私有文件 → 临时可访问 URL
```

关键组件：

- `ImageAnnotator` —— canvas 覆盖在 `<img>` 上，导出 `Annotation[]`。
  尺寸变化时用 `ResizeObserver` 重绘，`devicePixelRatio` 保证高分屏不糊。
- `MediaRecorderPanel` —— `getUserMedia` + `MediaRecorder`，
  自动挑选浏览器支持的编码格式（Chrome 用 webm，Safari 回落到 mp4）。
- `ReviewWorkspace` —— 老师批改台。反馈按 `submission_id` upsert，
  同一版反复保存是覆盖而不是新增。
- `SubmitForm` —— 学生提交。先传文件拿到路径，再插 `submissions`，
  最后把作业状态推到 `submitted`。

## 6. 路由表

| 路径 | 角色 | 页面 |
| --- | --- | --- |
| `/login` | 公开 | 登录 |
| `/register` | 公开 | 邀请码注册 |
| `/` | 已登录 | 按角色分流 |
| `/board` | 老师 | 任务看板 |
| `/students` | 老师 | 我的学生 |
| `/invites` | 老师 | 邀请码管理 |
| `/assignments` | 学生 | 我的作业 |
| `/assignments/:id` | 双方 | 老师批改 / 学生查看反馈并重交 |

角色越权访问会被 `RequireRole` 直接弹回各自首页。

## 7. 已知取舍

- **前端只做体验，不守安全**。所有校验在 RLS 与触发器。
- **作业一次只布置给一位学生**。班级批量布置留到后续迭代。
- **音频不转码**。直接存原始 webm/mp4，浏览器原生播放够用；
  若以后要跨端稳定播放，可加 Supabase Edge Function 转码。
- **看板轮询而非实时**。教室规模下手动刷新足够；
  需要实时可订阅 `assignments` 表的 Realtime。
