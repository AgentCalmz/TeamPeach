-- TeamPeach customer customization requests and project-scoped chat.
-- Run once in Supabase SQL Editor after migrations 001 through 005.

create table if not exists public.tp_custom_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.tp_users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 120),
  request_type text not null check (char_length(btrim(request_type)) between 3 and 80),
  description text not null check (char_length(btrim(description)) between 20 and 8000),
  desired_outcome text not null default '' check (char_length(desired_outcome) <= 4000),
  budget_range text not null default 'not_sure'
    check (budget_range in ('under_500', '500_1500', '1500_5000', 'over_5000', 'not_sure')),
  timeline text not null default 'flexible'
    check (timeline in ('asap', '2_4_weeks', '1_3_months', 'flexible')),
  status text not null default 'new'
    check (status in ('new', 'discussion', 'in_progress', 'completed')),
  quoted_price_minor bigint
    check (quoted_price_minor is null or quoted_price_minor between 1 and 100000000000),
  quoted_currency text not null default 'USD' check (quoted_currency = 'USD'),
  quote_notes text not null default '' check (char_length(quote_notes) <= 2000),
  quoted_at timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tp_custom_requests_user_updated_idx
  on public.tp_custom_requests(user_id, updated_at desc);
create index if not exists tp_custom_requests_status_updated_idx
  on public.tp_custom_requests(status, updated_at desc);
create index if not exists tp_custom_requests_messages_idx
  on public.tp_custom_requests(id, last_message_at desc);

create table if not exists public.tp_custom_request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.tp_custom_requests(id) on delete cascade,
  sender_user_id uuid references public.tp_users(id) on delete set null,
  sender_role text not null check (sender_role in ('user', 'staff', 'system')),
  sender_name text not null default '' check (char_length(sender_name) <= 100),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists tp_custom_request_messages_thread_idx
  on public.tp_custom_request_messages(request_id, created_at asc);

alter table public.tp_custom_requests enable row level security;
alter table public.tp_custom_request_messages enable row level security;
revoke all on public.tp_custom_requests, public.tp_custom_request_messages from anon, authenticated;
grant select, insert, update, delete on public.tp_custom_requests, public.tp_custom_request_messages to service_role;
