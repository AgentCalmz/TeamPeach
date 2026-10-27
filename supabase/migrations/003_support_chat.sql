-- TeamPeach in-dashboard support inbox.
-- Run this migration once in Supabase SQL Editor after 001 and 002.
create table if not exists public.tp_support_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.tp_users(id) on delete cascade,
  subject text not null check (char_length(btrim(subject)) between 3 and 120),
  status text not null default 'waiting_for_staff'
    check (status in ('open', 'waiting_for_staff', 'waiting_for_user', 'closed')),
  last_message_at timestamptz not null default now(),
  last_user_read_at timestamptz,
  last_staff_read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tp_support_conversations_user_updated_idx
  on public.tp_support_conversations(user_id, updated_at desc);
create index if not exists tp_support_conversations_status_updated_idx
  on public.tp_support_conversations(status, updated_at desc);

create table if not exists public.tp_support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.tp_support_conversations(id) on delete cascade,
  sender_user_id uuid references public.tp_users(id) on delete set null,
  sender_role text not null check (sender_role in ('user', 'staff', 'system')),
  sender_name text not null default '',
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists tp_support_messages_conversation_created_idx
  on public.tp_support_messages(conversation_id, created_at desc);

alter table public.tp_support_conversations enable row level security;
alter table public.tp_support_messages enable row level security;
revoke all on public.tp_support_conversations, public.tp_support_messages from anon, authenticated;
grant select, insert, update, delete on public.tp_support_conversations, public.tp_support_messages to service_role;
