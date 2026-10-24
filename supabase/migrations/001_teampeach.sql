-- TeamPeach server-side schema. Run this full migration in Supabase SQL Editor.
-- RLS is enabled and no browser policies are created. Server service-role access only.

create extension if not exists pgcrypto with schema extensions;
create table if not exists public.tp_users(
 id uuid primary key default gen_random_uuid(),email text not null unique check(email=lower(btrim(email))),
 full_name text not null check(char_length(full_name) between 2 and 100),password_hash text not null,
 email_verified_at timestamptz not null default now(),marketing_opt_in boolean not null default false,
 marketing_opt_in_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.tp_pending_registrations(
 email text primary key check(email=lower(btrim(email))),full_name text not null,password_hash text not null,
 otp_hash text not null,marketing_opt_in boolean not null default false,expires_at timestamptz not null,
 attempt_count integer not null default 0 check(attempt_count>=0),last_sent_at timestamptz not null default now(),created_at timestamptz not null default now());
create table if not exists public.tp_password_resets(
 email text primary key check(email=lower(btrim(email))),otp_hash text not null,expires_at timestamptz not null,
 attempt_count integer not null default 0 check(attempt_count>=0),last_sent_at timestamptz not null default now(),created_at timestamptz not null default now());
create table if not exists public.tp_sessions(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.tp_users(id) on delete cascade,
 token_hash text not null unique,expires_at timestamptz not null,revoked_at timestamptz,created_at timestamptz not null default now());
create index if not exists tp_sessions_user_idx on public.tp_sessions(user_id);
create index if not exists tp_sessions_expiry_idx on public.tp_sessions(expires_at);
create table if not exists public.tp_project_requests(
 id uuid primary key default gen_random_uuid(),full_name text not null,email text not null check(email=lower(btrim(email))),
 project_type text not null,details text not null,status text not null default 'new' check(status in('new','reviewing','in_progress','closed')),created_at timestamptz not null default now());
create index if not exists tp_project_requests_created_idx on public.tp_project_requests(created_at desc);
create table if not exists public.tp_email_jobs(
 id uuid primary key default gen_random_uuid(),requested_by uuid references public.tp_users(id) on delete set null,
 mode text not null check(mode in('single','broadcast','system')),subject text not null check(char_length(subject) between 3 and 150),
 body_text text not null check(char_length(body_text) between 5 and 15000),
 status text not null default 'queued' check(status in('queued','processing','completed','partially_failed','failed')),
 total_count integer not null default 0 check(total_count>=0),success_count integer not null default 0 check(success_count>=0),
 fail_count integer not null default 0 check(fail_count>=0),skipped_count integer not null default 0 check(skipped_count>=0),created_at timestamptz not null default now(),completed_at timestamptz);
alter table public.tp_email_jobs add column if not exists provider_campaign_id text;
alter table public.tp_email_jobs add column if not exists skipped_count integer not null default 0 check(skipped_count>=0);
alter table public.tp_email_jobs add column if not exists claimed_at timestamptz;
create index if not exists tp_email_jobs_created_idx on public.tp_email_jobs(created_at desc);
create table if not exists public.tp_email_queue(
 id uuid primary key default gen_random_uuid(),job_id uuid not null references public.tp_email_jobs(id) on delete cascade,
 recipient_email text not null check(recipient_email=lower(btrim(recipient_email))),recipient_name text not null default '',
 status text not null default 'pending' check(status in('pending','processing','sent','failed','skipped')),
 attempt_count integer not null default 0 check(attempt_count>=0),brevo_message_id text,last_error text,
 created_at timestamptz not null default now(),claimed_at timestamptz,sent_at timestamptz,completed_at timestamptz,unique(job_id,recipient_email));
alter table public.tp_email_queue add column if not exists claimed_at timestamptz;
alter table public.tp_email_queue drop constraint if exists tp_email_queue_status_check;
alter table public.tp_email_queue add constraint tp_email_queue_status_check check(status in('pending','processing','sent','failed','skipped'));
create index if not exists tp_email_queue_pending_idx on public.tp_email_queue(status,created_at);
create index if not exists tp_email_queue_sent_idx on public.tp_email_queue(status,sent_at);
alter table public.tp_users enable row level security;
alter table public.tp_pending_registrations enable row level security;
alter table public.tp_password_resets enable row level security;
alter table public.tp_sessions enable row level security;
alter table public.tp_project_requests enable row level security;
alter table public.tp_email_jobs enable row level security;
alter table public.tp_email_queue enable row level security;
revoke all on public.tp_users,public.tp_pending_registrations,public.tp_password_resets,public.tp_sessions,public.tp_project_requests,public.tp_email_jobs,public.tp_email_queue from anon,authenticated;

create or replace function public.tp_complete_registration(p_email text,p_otp_hash text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.tp_pending_registrations%rowtype; new_id uuid;
begin
 select * into p from public.tp_pending_registrations where email=lower(btrim(p_email)) for update;
 if not found then return jsonb_build_object('status','not_found'); end if;
 if p.expires_at<=now() then delete from public.tp_pending_registrations where email=p.email; return jsonb_build_object('status','expired'); end if;
 if p.attempt_count>=5 then return jsonb_build_object('status','too_many_attempts'); end if;
 if p.otp_hash is distinct from p_otp_hash then update public.tp_pending_registrations set attempt_count=attempt_count+1 where email=p.email;return jsonb_build_object('status','invalid');end if;
 insert into public.tp_users(email,full_name,password_hash,email_verified_at,marketing_opt_in,marketing_opt_in_at)
 values(p.email,p.full_name,p.password_hash,now(),p.marketing_opt_in,case when p.marketing_opt_in then now() else null end)
 on conflict(email) do nothing returning id into new_id;
 delete from public.tp_pending_registrations where email=p.email;
 if new_id is null then return jsonb_build_object('status','already_registered');end if;
 return jsonb_build_object('status','ok','user_id',new_id);
end $$;

create or replace function public.tp_complete_password_reset(p_email text,p_otp_hash text,p_password_hash text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.tp_password_resets%rowtype; target_id uuid;
begin
 select * into p from public.tp_password_resets where email=lower(btrim(p_email)) for update;
 if not found then return jsonb_build_object('status','not_found');end if;
 if p.expires_at<=now() then delete from public.tp_password_resets where email=p.email;return jsonb_build_object('status','expired');end if;
 if p.attempt_count>=5 then return jsonb_build_object('status','too_many_attempts');end if;
 if p.otp_hash is distinct from p_otp_hash then update public.tp_password_resets set attempt_count=attempt_count+1 where email=p.email;return jsonb_build_object('status','invalid');end if;
 update public.tp_users set password_hash=p_password_hash,updated_at=now() where email=p.email returning id into target_id;
 delete from public.tp_password_resets where email=p.email;
 if target_id is null then return jsonb_build_object('status','not_found');end if;
 update public.tp_sessions set revoked_at=now() where user_id=target_id and revoked_at is null;
 return jsonb_build_object('status','ok');
end $$;

create or replace function public.tp_enqueue_email_job(p_requested_by uuid,p_mode text,p_subject text,p_body_text text,p_recipients jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare new_job uuid;n integer;
begin
 if p_mode not in('single','broadcast','system') then return jsonb_build_object('status','invalid_mode');end if;
 if jsonb_typeof(coalesce(p_recipients,'[]'::jsonb))<>'array' then return jsonb_build_object('status','invalid_recipients');end if;
 select count(*) into n from(select lower(btrim(x.email)) email from jsonb_to_recordset(coalesce(p_recipients,'[]'::jsonb)) as x(email text,name text) where x.email ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' group by lower(btrim(x.email))) q;
 if n=0 then return jsonb_build_object('status','no_recipients');end if;
 if n>10000 then return jsonb_build_object('status','too_many_recipients');end if;
 insert into public.tp_email_jobs(requested_by,mode,subject,body_text,total_count,status) values(p_requested_by,p_mode,p_subject,p_body_text,n,'queued') returning id into new_job;
 insert into public.tp_email_queue(job_id,recipient_email,recipient_name)
 select new_job,lower(btrim(r.email)),left(coalesce(r.name,''),100) from(select distinct on(lower(btrim(x.email))) x.email,x.name from jsonb_to_recordset(coalesce(p_recipients,'[]'::jsonb)) as x(email text,name text) where x.email ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' order by lower(btrim(x.email)),x.name) r
 on conflict(job_id,recipient_email) do nothing;
 select count(*) into n from public.tp_email_queue where job_id=new_job;
 update public.tp_email_jobs set total_count=n where id=new_job;
 return jsonb_build_object('status','queued','job_id',new_job,'count',n);
end $$;

create or replace function public.tp_claim_email_queue(p_limit integer default 5,p_daily_limit integer default 250)
returns table(queue_id uuid,job_id uuid,recipient_email text,recipient_name text,subject text,body_text text,mode text)
language plpgsql security definer set search_path=public,pg_temp as $$
declare sent_today integer;remaining integer;
begin
 update public.tp_email_queue set status='failed',last_error='worker_interrupted_check_provider_before_retry',completed_at=now(),claimed_at=null where status='processing' and claimed_at<now()-interval '15 minutes';
 select count(*) into sent_today from public.tp_email_queue where status='sent' and sent_at>=date_trunc('day',now());
 remaining:=greatest(0,least(250,p_daily_limit)-sent_today);if remaining<=0 then return;end if;
 return query with picked as(select q.id from public.tp_email_queue q where q.status='pending' and exists(select 1 from public.tp_email_jobs j where j.id=q.job_id and j.mode in('single','system')) order by q.created_at,q.id limit least(greatest(1,p_limit),remaining) for update skip locked),
 claimed as(update public.tp_email_queue q set status='processing',claimed_at=now(),attempt_count=q.attempt_count+1 from picked where q.id=picked.id returning q.id,q.job_id,q.recipient_email,q.recipient_name)
 select c.id,c.job_id,c.recipient_email,c.recipient_name,j.subject,j.body_text,j.mode from claimed c join public.tp_email_jobs j on j.id=c.job_id;
end $$;

create or replace function public.tp_refresh_email_job_status(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;sent_n integer;fail_n integer;skip_n integer;active_n integer;s text;
begin
 select count(*),count(*) filter(where status='sent'),count(*) filter(where status='failed'),
        count(*) filter(where status='skipped'),count(*) filter(where status in('pending','processing'))
 into n,sent_n,fail_n,skip_n,active_n from public.tp_email_queue where job_id=p_job_id;
 if n=0 then return jsonb_build_object('status','not_found');end if;
 if active_n>0 then
   if exists(select 1 from public.tp_email_queue where job_id=p_job_id and status='processing') then s:='processing';else s:='queued';end if;
 elsif fail_n=0 then s:='completed';
 elsif sent_n+skip_n=0 then s:='failed';
 else s:='partially_failed';end if;
 update public.tp_email_jobs set total_count=n,success_count=sent_n,fail_count=fail_n,skipped_count=skip_n,
   status=s,completed_at=case when active_n=0 then coalesce(completed_at,now()) else null end,claimed_at=case when active_n=0 then null else claimed_at end where id=p_job_id;
 return jsonb_build_object('status',s,'total',n,'sent',sent_n,'failed',fail_n,'skipped',skip_n);
end $$;

create or replace function public.tp_claim_broadcast_jobs(p_limit integer default 1)
returns table(job_id uuid,subject text,body_text text,total_count integer)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.tp_email_queue q set status='failed',last_error='broadcast_worker_interrupted_check_provider',completed_at=now(),claimed_at=null
 from public.tp_email_jobs j where j.id=q.job_id and j.mode='broadcast' and j.status='processing' and j.claimed_at<now()-interval '15 minutes' and q.status in('pending','processing');
 update public.tp_email_jobs set status='failed',completed_at=now(),fail_count=total_count,claimed_at=null
 where mode='broadcast' and status='processing' and claimed_at<now()-interval '15 minutes';
 return query
 with picked as(
  select j.id from public.tp_email_jobs j
  where j.mode='broadcast' and j.status='queued'
  order by j.created_at limit least(greatest(1,p_limit),5) for update skip locked
 ), claimed as(
  update public.tp_email_jobs j set status='processing',completed_at=null,claimed_at=now()
  from picked where j.id=picked.id
  returning j.id,j.subject,j.body_text,j.total_count
 )
 select c.id,c.subject,c.body_text,c.total_count from claimed c;
end $$;

revoke all on function public.tp_complete_registration(text,text) from public,anon,authenticated;
revoke all on function public.tp_complete_password_reset(text,text,text) from public,anon,authenticated;
revoke all on function public.tp_enqueue_email_job(uuid,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.tp_claim_email_queue(integer,integer) from public,anon,authenticated;
revoke all on function public.tp_refresh_email_job_status(uuid) from public,anon,authenticated;
revoke all on function public.tp_claim_broadcast_jobs(integer) from public,anon,authenticated;
grant execute on function public.tp_complete_registration(text,text) to service_role;
grant execute on function public.tp_complete_password_reset(text,text,text) to service_role;
grant execute on function public.tp_enqueue_email_job(uuid,text,text,text,jsonb) to service_role;
grant execute on function public.tp_claim_email_queue(integer,integer) to service_role;
grant execute on function public.tp_refresh_email_job_status(uuid) to service_role;
grant execute on function public.tp_claim_broadcast_jobs(integer) to service_role;
-- Optional manual cleanup: delete expired pending registrations, password resets and old sessions.