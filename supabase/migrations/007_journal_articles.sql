-- TeamPeach journal CMS.
-- Run this migration in Supabase SQL Editor after migrations 001 through 006.
-- The application accesses this table only through the server-side service role.
create table if not exists public.tp_journal_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 100),
  title text not null check (char_length(btrim(title)) between 5 and 160),
  excerpt text not null check (char_length(btrim(excerpt)) between 30 and 420),
  content_markdown text not null check (char_length(btrim(content_markdown)) between 80 and 80000),
  meta_title text not null check (char_length(btrim(meta_title)) between 5 and 180),
  meta_description text not null check (char_length(btrim(meta_description)) between 50 and 320),
  category text not null default 'Journal' check (char_length(btrim(category)) between 2 and 80),
  cover_image_url text not null default '' check (cover_image_url = '' or cover_image_url ~ '^https://[^[:space:]<>"]+$'),
  author_name text not null default 'TeamPeach Editorial Team' check (char_length(btrim(author_name)) between 2 and 100),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid references public.tp_users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'published' or published_at is not null)
);

create index if not exists tp_journal_articles_public_idx
  on public.tp_journal_articles(status, published_at desc);
create index if not exists tp_journal_articles_updated_idx
  on public.tp_journal_articles(updated_at desc);

alter table public.tp_journal_articles enable row level security;
revoke all on public.tp_journal_articles from public, anon, authenticated;
grant select, insert, update, delete on public.tp_journal_articles to service_role;
