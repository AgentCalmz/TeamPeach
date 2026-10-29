-- TeamPeach custom project requests with private per-project chat and USD quotes.
-- Apply after migrations 001–005 in Supabase SQL Editor.

create table if not exists public.tp_custom_requests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.tp_users(id) on delete cascade,
 title text not null check (char_length(btrim(title)) between 3 and 120),
 project_type text not null check (project_type in ('custom_tool','ai_agent','automation','chatbot','web_app','integration','other')),
 description text not null check (char_length(btrim(description)) between 20 and 10000),
 desired_outcome text not null default '' check (char_length(desired_outcome) <= 3000),
 platform text not null default 'Not sure' check (char_length(platform) <= 120),
 budget_range text not null default '' check (char_length(budget_range) <= 120),
 timeline text not null default '' check (char_length(timeline) <= 120),
 status text not null default 'new' check (status in ('new','discussion','in_progress','completed')),
 quote_amount_cents bigint check (quote_amount_cents is null or quote_amount_cents between 1 and 100000000000),
 quote_currency text not null default 'USD' check (quote_currency = 'USD'),
 quote_notes text not null default '' check (char_length(quote_notes) <= 4000),
 quote_status text not null default 'draft' check (quote_status in ('draft','sent','accepted','declined')),
 quote_sent_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists tp_custom_requests_user_updated_idx
 on public.tp_custom_requests(user_id, updated_at desc);
create index if not exists tp_custom_requests_status_updated_idx
 on public.tp_custom_requests(status, updated_at desc);

create table if not exists public.tp_custom_request_messages (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.tp_custom_requests(id) on delete cascade,
 sender_user_id uuid references public.tp_users(id) on delete set null,
 sender_role text not null check (sender_role in ('user','admin')),
 sender_name text not null check (char_length(btrim(sender_name)) between 1 and 120),
 body text not null check (char_length(btrim(body)) between 1 and 4000),
 created_at timestamptz not null default now()
);
create index if not exists tp_custom_request_messages_request_created_idx
 on public.tp_custom_request_messages(request_id, created_at asc);

alter table public.tp_custom_requests enable row level security;
alter table public.tp_custom_request_messages enable row level security;
revoke all on public.tp_custom_requests, public.tp_custom_request_messages from anon, authenticated;
grant select, insert, update, delete on public.tp_custom_requests, public.tp_custom_request_messages to service_role;
