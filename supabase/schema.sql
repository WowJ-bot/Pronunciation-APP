-- ============================================================================
-- 英语发音纠音平台 —— Supabase 数据库初始化脚本
-- 使用方法：Supabase 控制台 -> SQL Editor -> 新建查询 -> 粘贴全文 -> Run
-- 本脚本可重复执行（幂等）。
-- ============================================================================

-- ============ 0. 扩展 ============
-- ⚠️ Supabase 预装的 pgcrypto 位于 `extensions` schema，**不在 public**。
-- 所以凡是调用 gen_random_bytes() 这类扩展函数的 security definer 函数，
-- search_path 必须写成 `public, extensions`，否则运行时会报
--   function gen_random_bytes(integer) does not exist
-- （gen_random_uuid() 是 PostgreSQL 13+ 内建函数，在 pg_catalog，不受影响）
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ============ 1. 枚举类型 ============
do $$ begin
  create type user_role as enum ('teacher', 'student');
exception when duplicate_object then null; end $$;

do $$ begin
  create type assignment_status as enum (
    'pending',        -- 待提交（老师已布置，学生还没交）
    'submitted',      -- 学生已提交，等待老师批改
    'reviewing',      -- 老师正在批改中
    'feedback_ready', -- 反馈已发布，等待学生查看/修改
    'revising',       -- 学生正在修改
    'completed'       -- 已完成（老师确认通过）
  );
exception when duplicate_object then null; end $$;

-- ============ 2. 表结构 ============

-- 2.1 用户档案：与 auth.users 一对一
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        user_role   not null default 'student',
  full_name   text        not null default '',
  email       text,
  teacher_id  uuid        references public.profiles(id) on delete set null, -- 学生所属老师
  created_at  timestamptz not null default now()
);
comment on table public.profiles is '用户档案：老师与学生的身份、归属关系';

-- 2.2 邀请码：只有持码者能注册成为学生
create table if not exists public.invite_codes (
  code        text primary key,                        -- 例如 PRON-8F2K3D
  created_by  uuid        not null references public.profiles(id) on delete cascade,
  note        text,                                    -- 备注：发给哪位学生
  max_uses    int         not null default 1 check (max_uses > 0),
  used_count  int         not null default 0 check (used_count >= 0),
  active      boolean     not null default true,
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);
comment on table public.invite_codes is '邀请制注册码，仅由老师生成';

-- 2.3 作业
create table if not exists public.assignments (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.profiles(id) on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  description text,
  status      assignment_status not null default 'pending',
  due_at      timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_assignments_teacher on public.assignments(teacher_id, status);
create index if not exists idx_assignments_student on public.assignments(student_id, status);

-- 2.4 学生提交（每次重交版本 +1）
create table if not exists public.submissions (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references public.assignments(id) on delete cascade,
  student_id     uuid not null references public.profiles(id) on delete cascade,
  version        int  not null default 1,
  article_images jsonb not null default '[]'::jsonb,  -- [{path,name,width,height}]
  audio_path     text,                                -- submissions bucket 内路径
  video_path     text,
  note           text,
  created_at     timestamptz not null default now(),
  unique (assignment_id, version)
);
create index if not exists idx_submissions_assignment on public.submissions(assignment_id, version desc);

-- 2.5 老师反馈（一条提交对应一条反馈）
create table if not exists public.feedback (
  id              uuid primary key default gen_random_uuid(),
  submission_id   uuid not null references public.submissions(id) on delete cascade,
  teacher_id      uuid not null references public.profiles(id) on delete cascade,
  annotations     jsonb not null default '[]'::jsonb, -- 见 docs/ARCHITECTURE.md 中的批注结构
  audio_path      text,
  video_path      text,
  overall_comment text,
  created_at      timestamptz not null default now(),
  unique (submission_id)
);

-- ============ 3. 通用触发器 ============

-- updated_at 自动维护
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_assignments_updated on public.assignments;
create trigger trg_assignments_updated
  before update on public.assignments
  for each row execute function public.touch_updated_at();

-- ============ 3.5 老师邮箱白名单 ============
-- 安全要点：角色的判定权必须在服务端。
--
-- auth.users.raw_user_meta_data 是「注册者自己填的」，完全可控。
-- 如果拿它决定 role，任何人用公开的 anon key 直接调
-- POST /auth/v1/signup，body 里塞 data:{"role":"teacher"}，
-- 就能跳过下面的邀请码校验，直接拿到老师权限、看到全部学生数据。
--
-- 所以老师身份只能通过这里预先登记（SQL Editor / service_role）。
create table if not exists public.teacher_allowlist (
  email      text primary key,
  note       text,
  created_at timestamptz not null default now()
);
comment on table public.teacher_allowlist is '老师邮箱白名单：注册时命中即授予 teacher 角色，且免邀请码';

-- 开启 RLS 且刻意不建任何策略 => anon / authenticated 一行都读不到、也写不了。
-- 只有 security definer 函数与 SQL Editor 能访问。
alter table public.teacher_allowlist enable row level security;

-- ============ 4. 注册流程：校验邀请码 + 建立档案 ============
-- 关键设计：校验发生在数据库端（security definer），前端无法绕过。
-- 邀请码无效时直接抛异常，Supabase Auth 会拒绝该次注册。

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code   text;
  v_role   user_role;
  v_invite public.invite_codes%rowtype;
begin
  v_code := nullif(trim(new.raw_user_meta_data ->> 'invite_code'), '');

  -- 角色仅由服务端判定：命中老师白名单就是老师，其余一律按学生处理。
  -- 这里刻意不读 raw_user_meta_data -> 'role'（那是注册者可控的）。
  if exists (
    select 1 from public.teacher_allowlist
     where lower(email) = lower(trim(new.email))
  ) then
    v_role := 'teacher';
  else
    v_role := 'student';
  end if;

  -- 学生注册必须携带有效邀请码
  if v_role = 'student' then
    if v_code is null then
      raise exception 'INVITE_CODE_REQUIRED' using errcode = 'P0001';
    end if;

    select * into v_invite from public.invite_codes where code = v_code for update;
    if not found then
      raise exception 'INVITE_CODE_INVALID' using errcode = 'P0001';
    end if;
    if not v_invite.active then
      raise exception 'INVITE_CODE_INACTIVE' using errcode = 'P0001';
    end if;
    if v_invite.expires_at is not null and v_invite.expires_at < now() then
      raise exception 'INVITE_CODE_EXPIRED' using errcode = 'P0001';
    end if;
    if v_invite.used_count >= v_invite.max_uses then
      raise exception 'INVITE_CODE_EXHAUSTED' using errcode = 'P0001';
    end if;

    update public.invite_codes
       set used_count = used_count + 1,
           active     = (used_count + 1) < max_uses
     where code = v_code;
  end if;

  insert into public.profiles (id, role, full_name, email, teacher_id)
  values (
    new.id,
    v_role,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    new.email,
    case
      when v_role = 'student' and v_code is not null
      then (select created_by from public.invite_codes where code = v_code)
      else null
    end
  );

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ 5. 辅助函数（供 RLS 使用，避免策略里递归查 profiles）============

create or replace function public.is_teacher()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher');
$$;

create or replace function public.my_teacher_id()
returns uuid language sql stable security definer set search_path = public as $$
  select p.teacher_id from public.profiles p where p.id = auth.uid();
$$;

-- 供注册页做「邀请码是否有效」的前置校验（不泄露是谁创建的）
create or replace function public.check_invite_code(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.invite_codes c
     where c.code = trim(p_code)
       and c.active
       and c.used_count < c.max_uses
       and (c.expires_at is null or c.expires_at > now())
  );
$$;
grant execute on function public.check_invite_code(text) to anon, authenticated;

-- 生成邀请码（仅老师可调用）
-- search_path 必须带上 extensions，因为下面用了 pgcrypto 的 gen_random_bytes()
create or replace function public.create_invite_code(p_note text default null, p_max_uses int default 1, p_days int default 30)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_code text;
begin
  if not public.is_teacher() then
    raise exception 'ONLY_TEACHER_CAN_CREATE_INVITE' using errcode = 'P0001';
  end if;

  loop
    v_code := 'PRON-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
    exit when not exists (select 1 from public.invite_codes where code = v_code);
  end loop;

  insert into public.invite_codes (code, created_by, note, max_uses, expires_at)
  values (v_code, auth.uid(), p_note, greatest(p_max_uses, 1), now() + make_interval(days => greatest(p_days, 1)));

  return v_code;
end $$;
-- 这一个是会写库的，默认的 PUBLIC 授权要收回，只留给登录用户
revoke all on function public.create_invite_code(text, int, int) from public, anon;
grant execute on function public.create_invite_code(text, int, int) to authenticated;

-- 登记 / 提升老师（只能在 SQL Editor 里执行）
-- 用法：select public.grant_teacher_role('teacher@example.com');
create or replace function public.grant_teacher_role(p_email text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  v_id    uuid;
begin
  if v_email is null or v_email = '' then
    raise exception 'EMAIL_REQUIRED' using errcode = 'P0001';
  end if;

  insert into public.teacher_allowlist (email, note)
  values (v_email, 'granted ' || now()::date)
  on conflict (email) do nothing;

  select id into v_id from public.profiles where lower(email) = v_email;

  if v_id is null then
    return '已加入白名单。该邮箱还没注册：去 Dashboard -> Authentication -> Users 添加用户，'
        || '创建时会自动获得 teacher 角色。';
  end if;

  update public.profiles
     set role = 'teacher', teacher_id = null
   where id = v_id;

  return '已提升为老师：' || v_email;
end $$;

-- PostgreSQL 默认把函数的 EXECUTE 授予 PUBLIC，不收回就等于留了个后门：
-- 任何匿名访问者都能调它把自己变成老师。必须显式收回。
revoke all on function public.grant_teacher_role(text) from public, anon, authenticated;

-- ============ 6. 行级安全（RLS）============
alter table public.profiles      enable row level security;
alter table public.invite_codes  enable row level security;
alter table public.assignments   enable row level security;
alter table public.submissions   enable row level security;
alter table public.feedback      enable row level security;

-- 6.1 profiles
drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read" on public.profiles
  for select to authenticated
  using (id = auth.uid() or teacher_id = auth.uid() or public.is_teacher() and teacher_id = auth.uid());

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

-- 老师可以查看自己的学生列表
drop policy if exists "profiles students of teacher" on public.profiles;
create policy "profiles students of teacher" on public.profiles
  for select to authenticated
  using (teacher_id = auth.uid());

-- 6.2 invite_codes：仅老师可见/可管理自己的
drop policy if exists "invite codes owner all" on public.invite_codes;
create policy "invite codes owner all" on public.invite_codes
  for all to authenticated
  using (created_by = auth.uid() and public.is_teacher())
  with check (created_by = auth.uid() and public.is_teacher());

-- 6.3 assignments：老师管自己布置的，学生看自己的
drop policy if exists "assignments teacher all" on public.assignments;
create policy "assignments teacher all" on public.assignments
  for all to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid() and public.is_teacher());

drop policy if exists "assignments student read" on public.assignments;
create policy "assignments student read" on public.assignments
  for select to authenticated
  using (student_id = auth.uid());

-- 学生可更新自己作业的状态（提交 / 标记修改中）
drop policy if exists "assignments student update status" on public.assignments;
create policy "assignments student update status" on public.assignments
  for update to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

-- 但 RLS 只能限制「改哪一行」，管不了「改哪一列」——
-- 上面这条策略同时允许学生改 title / due_at，甚至自己把 status 改成 completed。
-- 用触发器把列级权限收住：学生只能动 status，且只能改成 submitted / revising。
create or replace function public.guard_student_assignment_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- 老师走正常策略；auth.uid() 为空说明是 service_role / SQL Editor 直连，
  -- 属于管理员操作，也不拦（否则后台修数据会被自己的触发器挡住）。
  if auth.uid() is null or public.is_teacher() then
    return new;
  end if;

  if new.teacher_id  is distinct from old.teacher_id
     or new.student_id is distinct from old.student_id
     or new.title      is distinct from old.title
     or new.description is distinct from old.description
     or new.due_at     is distinct from old.due_at
     or new.created_at is distinct from old.created_at then
    raise exception 'STUDENT_CANNOT_EDIT_ASSIGNMENT_CONTENT' using errcode = 'P0001';
  end if;

  if new.status not in ('submitted', 'revising') then
    raise exception 'STUDENT_CANNOT_SET_STATUS_%', new.status using errcode = 'P0001';
  end if;

  return new;
end $$;

drop trigger if exists trg_guard_student_assignment on public.assignments;
create trigger trg_guard_student_assignment
  before update on public.assignments
  for each row execute function public.guard_student_assignment_update();

-- 6.4 submissions：归属校验通过 assignments 推导
drop policy if exists "submissions read" on public.submissions;
create policy "submissions read" on public.submissions
  for select to authenticated
  using (
    student_id = auth.uid()
    or exists (select 1 from public.assignments a where a.id = assignment_id and a.teacher_id = auth.uid())
  );

drop policy if exists "submissions insert by student" on public.submissions;
create policy "submissions insert by student" on public.submissions
  for insert to authenticated
  with check (
    student_id = auth.uid()
    and exists (select 1 from public.assignments a where a.id = assignment_id and a.student_id = auth.uid())
  );

-- 6.5 feedback：老师写，学生读
drop policy if exists "feedback read" on public.feedback;
create policy "feedback read" on public.feedback
  for select to authenticated
  using (
    teacher_id = auth.uid()
    or exists (
      select 1 from public.submissions s
       where s.id = submission_id and s.student_id = auth.uid()
    )
  );

drop policy if exists "feedback teacher write" on public.feedback;
create policy "feedback teacher write" on public.feedback
  for all to authenticated
  using (teacher_id = auth.uid())
  with check (
    teacher_id = auth.uid()
    and exists (
      select 1 from public.submissions s
      join public.assignments a on a.id = s.assignment_id
       where s.id = submission_id and a.teacher_id = auth.uid()
    )
  );

-- ============ 6.6 Data API 授权（必须）============
-- 新建项目时那个 "Automatically expose new tables" 勾选框一旦被取消，
-- 用 SQL 建出来的表就不会有 Data API 权限，前端会直接报
-- "permission denied for table xxx"。这里显式授权，让结果与开关无关。
--
-- 注意：授权 ≠ 放行。真正的行级隔离仍然由上面的 RLS 策略负责，
-- 没有策略的表在 RLS 开启后对 anon/authenticated 就是「一行都看不到」。

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;

grant usage, select on all sequences in schema public to anon, authenticated;

-- 之后新建的表 / 序列也自动套用同样的授权
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated;

-- 例外：老师白名单不对任何客户端角色开放。
-- 上面的 grant ... on all tables 是「全表通发」，所以要在这里单独收回。
-- （即使收回失败，RLS 无策略也已经挡住了；这是第二道锁。）
revoke all on public.teacher_allowlist from anon, authenticated;

-- ============ 7. 文件存储 ============
-- 路径约定（两个 bucket 一致）：{teacher_id}/{student_id}/{assignment_id}/{文件名}
-- 这样 RLS 可以直接用路径第 1/2 段判断身份归属。

insert into storage.buckets (id, name, public) values ('submissions', 'submissions', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('feedback', 'feedback', false)
  on conflict (id) do nothing;

-- 7.1 submissions：学生上传，双方可读
drop policy if exists "submissions objects read" on storage.objects;
create policy "submissions objects read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'submissions'
    and (
      (storage.foldername(name))[1]= auth.uid()::text
      or (storage.foldername(name))[2]= auth.uid()::text
    )
  );

drop policy if exists "submissions objects insert" on storage.objects;
create policy "submissions objects insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'submissions'
    and (storage.foldername(name))[2]= auth.uid()::text
  );

drop policy if exists "submissions objects delete" on storage.objects;
create policy "submissions objects delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'submissions'
    and (storage.foldername(name))[2]= auth.uid()::text
  );

-- 7.2 feedback：老师上传，双方可读
drop policy if exists "feedback objects read" on storage.objects;
create policy "feedback objects read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'feedback'
    and (
      (storage.foldername(name))[1]= auth.uid()::text
      or (storage.foldername(name))[2]= auth.uid()::text
    )
  );

drop policy if exists "feedback objects insert" on storage.objects;
create policy "feedback objects insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'feedback'
    and (storage.foldername(name))[1]= auth.uid()::text
  );

drop policy if exists "feedback objects delete" on storage.objects;
create policy "feedback objects delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'feedback'
    and (storage.foldername(name))[1]= auth.uid()::text
  );

-- ============ 8. 看板视图：老师的任务总览 ============
-- 一次查询即可渲染看板，无需前端多次请求。
create or replace view public.teacher_board as
select
  a.id                as assignment_id,
  a.teacher_id,
  a.title,
  a.description,
  a.status,
  a.due_at,
  a.created_at,
  a.updated_at,
  p.full_name         as student_name,
  p.email             as student_email,
  s.id                as latest_submission_id,
  s.version           as latest_version,
  s.created_at        as latest_submitted_at,
  f.id                as feedback_id,
  (a.due_at is not null and a.due_at < now() and a.status in ('pending', 'revising')) as is_overdue
from public.assignments a
join public.profiles p on p.id = a.student_id
left join lateral (
  select * from public.submissions s2
   where s2.assignment_id = a.id
   order by s2.version desc limit 1
) s on true
left join public.feedback f on f.submission_id = s.id;

-- 视图继承底层表 RLS；显式再包一层以适配 security_invoker
alter view public.teacher_board set (security_invoker = on);

-- ============ 完成 ============
-- 后续步骤见 README.md「首次配置」
