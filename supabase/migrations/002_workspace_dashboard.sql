-- TeamPeach workspace dashboard: projects and tasks.
-- Run this once in the Supabase SQL Editor after migration 001_teampeach.sql.

create table if not exists public.tp_workspace_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.tp_users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 2 and 120),
  description text not null default '' check (char_length(description) <= 1200),
  project_type text not null default 'general'
    check (project_type in ('general', 'seo-brief', 'content', 'automation')),
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed')),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tp_workspace_projects_user_updated_idx
  on public.tp_workspace_projects(user_id, updated_at desc);
create index if not exists tp_workspace_projects_user_status_idx
  on public.tp_workspace_projects(user_id, status);

create table if not exists public.tp_workspace_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.tp_users(id) on delete cascade,
  project_id uuid references public.tp_workspace_projects(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 2 and 180),
  due_on date,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tp_workspace_tasks_user_created_idx
  on public.tp_workspace_tasks(user_id, completed, created_at desc);
create index if not exists tp_workspace_tasks_project_idx
  on public.tp_workspace_tasks(project_id);

alter table public.tp_workspace_projects enable row level security;
alter table public.tp_workspace_tasks enable row level security;

revoke all on public.tp_workspace_projects, public.tp_workspace_tasks from anon, authenticated;
grant select, insert, update, delete on public.tp_workspace_projects, public.tp_workspace_tasks to service_role;
