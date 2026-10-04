# 发音纠音平台

一位老师 + N 位学生的英语发音纠音工作台。

**核心闭环**：老师布置作业 → 学生上传文章图片并朗读录音/录像 → 老师在图片上画批注并录语音/视频讲解 → 学生听完反馈重新录一版 → 老师在看板上确认完成。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | React 18 + TypeScript + Vite |
| 样式 | Tailwind CSS v4 |
| 路由 | React Router 6 |
| 后端 | Supabase（PostgreSQL + Auth + Storage + RLS） |
| 部署 | Vercel |

## 目录结构

```
pronunciation-app/
├── public/                     静态资源：PWA 清单、Service Worker、应用图标
├── scripts/
│   └── generate-icons.py       生成各尺寸应用图标（纯标准库，不依赖 Pillow）
├── supabase/
│   └── schema.sql              ★ 数据库 + 存储 + RLS 全量初始化脚本
├── docs/
│   └── ARCHITECTURE.md         数据模型与业务流程说明
├── src/
│   ├── components/
│   │   ├── annotation/         ImageAnnotator —— 图片批注画布（支持手写笔压感）
│   │   ├── assignments/        看板 / 提交表单 / 批改工作区 / 反馈面板
│   │   ├── layout/             AppShell 全局框架
│   │   ├── media/              MediaRecorderPanel —— 录音录像
│   │   ├── pwa/                InstallHint —— 「添加到主屏」引导
│   │   └── ui/                 Button / Card / Badge / Modal / Field
│   ├── contexts/AuthContext.tsx   会话与档案
│   ├── hooks/                  useAuth / useAssignments / useSignedUrl
│   ├── lib/supabase.ts         Supabase 客户端与存储路径约定
│   ├── pages/                  各页面
│   ├── routes/guards.tsx       登录守卫 + 角色守卫
│   ├── types/index.ts          领域模型（与 schema.sql 对应）
│   └── utils/
│       ├── media.ts            录制环境探测与错误翻译
│       ├── pwa.ts              Service Worker 注册与安装态判断
│       ├── stylus.ts           手写笔压感 / 全屏 / 屏幕常亮
│       └── format.ts cn.ts     格式化与 className 工具
├── .env.example
├── vercel.json                 SPA 路由重写
└── vite.config.ts
```

## 首次配置

### 1. 创建 Supabase 项目

到 [supabase.com](https://supabase.com) 新建项目，记下 `Project URL` 与 `anon public key`
（Project Settings → API）。

### 2. 执行数据库脚本

打开 SQL Editor，把 `supabase/schema.sql` 全文粘贴进去执行。
这一步会创建 5 张表、2 个存储桶、全部 RLS 策略，以及注册用的触发器。

### 3. 配置环境变量

```bash
cp .env.example .env.local
```

填入真实的 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。

### 4. 安装并启动

```bash
npm install
npm run dev
```

### 5. 创建第一个老师账号

老师不走邀请码注册，但**必须先在白名单里登记邮箱**，否则注册触发器会把他当成学生、
而学生没有邀请码就会被直接拒绝（账号根本建不出来）。顺序不能反：

**第一步**，SQL Editor 里登记老师邮箱：

```sql
select public.grant_teacher_role('teacher@example.com');
```

返回「已加入白名单。该邮箱还没注册…」就是成功了。

**第二步**，控制台 → Authentication → Users → **Add user**，用同一个邮箱建账号
（勾选 Auto Confirm）。触发器命中白名单，自动授予 `teacher` 角色。

之后老师登录 → 「邀请码」页面生成邀请码 → 发给学生 → 学生自助注册。

> 如果账号已经存在（比如先建了用户），同一个函数会把现有档案提升为老师，直接再跑一次即可。

#### 为什么要有这张白名单

角色的判定权必须在服务端。`raw_user_meta_data`（注册时随请求提交的自定义字段）
是**注册者自己填的**，完全可控。早期版本用它来决定角色，结果是：任何人拿公开的
anon key 直接调 `POST /auth/v1/signup`，body 里塞 `{"data":{"role":"teacher"}}`，
就能跳过邀请码校验拿到老师权限，看到全部学生数据。

现在角色只由 `public.teacher_allowlist` 决定，前端传什么都被忽略。

### 6. 邮箱验证与 SMTP（本地开发 / 上线前必读）

Supabase 有一项**默认开启**的设置，会直接卡住学生的注册：

**Authentication → Sign In / Providers → Email → Confirm email**

开启时，每次注册都会尝试发一封确认邮件，而免费版用的是 Supabase 共享的邮件服务，
有两个硬限制：

- **每小时约 2 封**，超了报 `email rate limit exceeded`
- **只能发给项目成员邮箱**，学生用 QQ 邮箱 / 163 邮箱注册会报 `Email address not authorized`

而且这类链接有两个坑：**有效期只有 1 小时**，并且很多邮件客户端（QQ 邮箱、微信）
会**提前自动访问链接**，一次性 token 当场就被消耗掉，学生点开时已经失效。

#### 本地开发：直接关掉

别折腾邮件，把上面那个 **Confirm email 开关关掉**即可。注册完立刻就是登录态，
不经过邮件，也就不会撞频率限制。邀请码校验仍在数据库触发器里，安全性不受影响。

#### 正式上线：必须配自有 SMTP

学生用的是各自的邮箱，共享邮件服务发不到，所以上线前一定要接一个真实发信服务：

**Authentication → Emails → SMTP Settings**，填任意一家的凭据：

| 服务商 | 说明 |
| --- | --- |
| 腾讯企业邮箱 / QQ 邮箱 | 国内送达率最好，需要开 SMTP 授权码 |
| Resend / SendGrid | 国外服务，配置最简单，国内送达一般 |

配好之后再把 **Confirm email** 重新打开。

#### 顺手改掉 Site URL

**Authentication → URL Configuration → Site URL** 默认是 `http://localhost:5173`。
这是邮件链接要跳回的地址——**部署到 Vercel 后必须改成你的正式域名**，
否则学生点确认链接会被带到 `localhost`（在他们手机上是打不开的）。
同页的 **Redirect URLs** 建议把本地和线上两个域名都加上。

## 可用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 本地开发（http://localhost:5173） |
| `npm run build` | 类型检查 + 生产构建 |
| `npm run preview` | 预览构建产物 |
| `npm run typecheck` | 只做类型检查 |

## 部署到 Vercel

1. 把仓库推到 GitHub。
2. Vercel → New Project → 选择该仓库（框架会被识别为 Vite）。
3. 在 Environment Variables 里加上 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`。
4. Deploy。

`vercel.json` 已配置 SPA 重写，刷新子路由不会 404。

## 手机使用（学生的主要入口）

界面是移动优先的：布局自适应、批注 canvas 支持手指绘制、拍照直接调起相机。
手机能用，但**录制音视频有三个硬性前提**，缺一个就录不了：

| 前提 | 不满足时的表现 | 解决 |
| --- | --- | --- |
| 页面是 **https**（或 localhost） | 录音按钮点了没反应 / 提示不支持 | 用正式域名访问；本地开发见下 |
| **不是微信内置浏览器** | 同上，且常被误认为「网站坏了」 | 点右上角「···」→「在浏览器打开」 |
| 浏览器支持 MediaRecorder | 提示不支持 | iOS 需 14.3+，或换 Chrome |

组件已经内置了这三项的探测，会在录制区直接显示对应的中文指引，不会只丢一句
「无法启动录制设备」。

> **微信是最容易踩的坑。** 老师往往把链接发到群里，学生直接在微信里点开——
> 这时录音和摄像头都调不起来。如果学生反馈「点不动」，先让他「在浏览器打开」。

### 本地开发时怎么用手机测

```bash
npm run dev -- --host
```

然后用手机访问 `http://<电脑的局域网IP>:5173`。但注意：
**`http://` 不是安全上下文，这个地址下录音功能一定不可用**（这是浏览器规则，
不是代码问题）。想真机测录音，两条路：

- 用隧道给个 https 域名，例如 `npx cloudflared tunnel --url http://localhost:5173`
- 或者直接部署到 Vercel（本身就是 https），用预览地址测

### iPhone 的相机格式

iPhone 默认拍 HEIC，这种图在 Chrome / Android / Windows 上都打不开，
老师会看到一张破图。学生上传后页面会检测并提示改成
**设置 → 相机 → 格式 → 兼容性最佳**。

## 安装到主屏（像 App 一样用）

不需要经过任何应用商店。浏览器里打开一次，选「添加到主屏幕」，之后从桌面图标启动
就是**独立的应用**：全屏、无地址栏、有自己的应用切换卡片，断网时也能打开外壳。

| 设备 | 操作 |
| --- | --- |
| iPad / iPhone（Safari） | 点底部「分享」图标 → 「添加到主屏幕」 |
| 安卓（Chrome / Edge / 三星浏览器 / 华为浏览器…） | 菜单 → 「安装应用」或「添加到主屏幕」 |

页面底部会自动出现这条引导，用户点「✕」后不再提示。

> **微信 / QQ 的内置浏览器装不了 PWA，也调不起录音和摄像头。**
> 学生从群里的链接点进来时，引导条会直接提示「点右上角 ··· → 在浏览器打开」——
> 这是国内分发绕不开的一步，不是代码能消除的。

### 手写笔批注（不限于 Apple Pencil）

批注画布走的是通用的 **Pointer Events**，各品牌手写笔在浏览器里暴露的是同一套接口：

| 笔 | 设备 | 压感 |
| --- | --- | --- |
| Apple Pencil | iPad | ✅ |
| S Pen | 三星 Galaxy Tab / Ultra | ✅ |
| M-Pencil | 华为 MatePad | ✅ |
| 小米 灵感笔 / Lenovo Precision Pen | 对应安卓平板 | ✅ |
| Surface Pen / Wacom 数位板 | Windows 平板、台式机 | ✅ |
| 被动电容笔、手指 | 任意触摸屏 | ❌ 无压感，笔画粗细固定 |

实现上只判断 `pointerType === 'pen'`：是笔走压感变宽，是手指走固定线宽，
**不需要为任何品牌写专属分支**。此外有两条是「平板批注能不能用」的前提：

- canvas 的 `touch-action: none`——少了它，笔一落笔就被浏览器当成滚动页面
- **掌纹抑制**——笔正在写时忽略并存的触摸点，否则手腕一压就多画一道

「全屏批注」按钮只在支持元素全屏的浏览器（桌面、安卓）出现。
**iOS / iPadOS 的 Safari 至今不支持对任意元素全屏**——iPad 上用「添加到主屏」的
独立窗口模式即可达到同样效果，不需要这个按钮。

> 老师端建议：iPad + Apple Pencil 的精度与效率明显优于手指，值得单独备一台。

## 注意事项

- **浏览器录音/录像需要 HTTPS 或 localhost**，Vercel 部署与本地开发都满足。
- 两个存储桶都是**私有**的，前端通过 `createSignedUrl` 换取 1 小时有效的临时链接。
- **权限不靠前端**：邀请码校验写在数据库触发器里，学生看不到别人的作业也靠 RLS 兜底。
- 批注坐标存的是 **0~1 相对值**，所以在手机、平板、电脑上看到的位置都一致。

## 下一步可做

- 发音评分（接入语音评测 API，给出音素级得分）
- 作业模板与班级批量布置
- 学生端「今日待办」提醒 / 邮件通知
- 老师批改时的批注回放（按录制时间逐条重现）
- 学习档案：按音素统计反复出错的单词
