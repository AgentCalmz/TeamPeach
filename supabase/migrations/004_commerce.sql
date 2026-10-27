-- TeamPeach commerce: plans, credits, catalogue, payments, licences and usage.
-- Run once in Supabase SQL Editor after migrations 001, 002 and 003.
-- Amounts are NGN kobo (100 kobo = ₦1). Provider secret keys stay on the server.

create table if not exists public.tp_products (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 2 and 80),
 name text not null check (char_length(btrim(name)) between 2 and 120),
 summary text not null default '' check (char_length(summary) <= 300),
 description text not null default '' check (char_length(description) <= 5000),
 category text not null default 'tool' check (category in ('tool','agent','automation','service')),
 product_type text not null default 'hosted_tool' check (product_type in ('hosted_tool','self_hosted_tool','hosted_and_self_hosted','service')),
 hosted_path text not null default '' check (char_length(hosted_path)<=300 and (hosted_path='' or (left(hosted_path,1)='/' and left(hosted_path,2)<>'//'))),
 price_minor bigint not null default 0 check (price_minor >= 0 and price_minor <= 100000000000),
 currency text not null default 'NGN' check (currency = 'NGN'),
 hosted_enabled boolean not null default false,
 self_hosted_enabled boolean not null default true,
 visible_publicly boolean not null default true,
 active boolean not null default false,
 credit_cost_per_run integer not null default 1 check (credit_cost_per_run between 0 and 1000000),
 source_code_url text,
 source_delivery_notes text not null default '' check (char_length(source_delivery_notes) <= 3000),
 included_setup_hours numeric(4,1) not null default 0 check (included_setup_hours between 0 and 100),
 member_discount_percent integer not null default 0 check (member_discount_percent between 0 and 90),
 features jsonb not null default '[]'::jsonb check (jsonb_typeof(features)='array'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists tp_products_public_idx on public.tp_products(active,visible_publicly,category);

create table if not exists public.tp_subscription_plans (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 2 and 80),
 name text not null check (char_length(btrim(name)) between 2 and 100),
 description text not null default '' check (char_length(description) <= 1200),
 price_minor bigint not null check (price_minor > 0 and price_minor <= 100000000000),
 currency text not null default 'NGN' check (currency='NGN'),
 monthly_credits integer not null check (monthly_credits between 1 and 100000000),
 member_discount_percent integer not null default 0 check (member_discount_percent between 0 and 90),
 paystack_plan_code text,
 flutterwave_payment_plan_id bigint,
 active boolean not null default false,
 sort_order integer not null default 100,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists tp_subscription_plans_active_idx on public.tp_subscription_plans(active,sort_order);

create table if not exists public.tp_credit_packs (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 2 and 80),
 name text not null check (char_length(btrim(name)) between 2 and 100),
 description text not null default '' check (char_length(description) <= 1000),
 credits integer not null check (credits between 1 and 100000000),
 price_minor bigint not null check (price_minor > 0 and price_minor <= 100000000000),
 currency text not null default 'NGN' check (currency='NGN'),
 active boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists tp_credit_packs_active_idx on public.tp_credit_packs(active,price_minor);

create table if not exists public.tp_payments (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.tp_users(id) on delete restrict,
 gateway text not null check (gateway in ('paystack','flutterwave')),
 reference text not null unique check (char_length(reference) between 8 and 120),
 payment_type text not null check (payment_type in ('membership','credit_topup','tool_license')),
 product_id uuid references public.tp_products(id) on delete restrict,
 plan_id uuid references public.tp_subscription_plans(id) on delete restrict,
 credit_pack_id uuid references public.tp_credit_packs(id) on delete restrict,
 amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 100000000000),
 currency text not null default 'NGN' check (currency='NGN'),
 status text not null default 'pending' check (status in ('pending','paid','failed','cancelled','refunded')),
 provider_transaction_id text,
 provider_subscription_id text,
 metadata jsonb not null default '{}'::jsonb,
 verified_at timestamptz,
 fulfilled_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check ((payment_type='membership' and plan_id is not null and product_id is null and credit_pack_id is null)
     or (payment_type='credit_topup' and credit_pack_id is not null and product_id is null and plan_id is null)
     or (payment_type='tool_license' and product_id is not null and plan_id is null and credit_pack_id is null))
);
create index if not exists tp_payments_user_created_idx on public.tp_payments(user_id,created_at desc);
create index if not exists tp_payments_status_created_idx on public.tp_payments(status,created_at desc);

create table if not exists public.tp_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.tp_users(id) on delete cascade,
 plan_id uuid not null references public.tp_subscription_plans(id) on delete restrict,
 gateway text not null check (gateway in ('paystack','flutterwave','admin')),
 status text not null default 'active' check (status in ('active','past_due','cancelled','expired')),
 current_period_start timestamptz not null default now(),
 current_period_end timestamptz not null,
 cancel_at_period_end boolean not null default false,
 provider_plan_id text,
 provider_subscription_id text,
 provider_customer_code text,
 provider_email_token text,
 last_payment_reference text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists tp_subscriptions_user_end_idx on public.tp_subscriptions(user_id,current_period_end desc);
create index if not exists tp_subscriptions_gateway_provider_idx on public.tp_subscriptions(gateway,provider_subscription_id);
create index if not exists tp_subscriptions_status_end_idx on public.tp_subscriptions(status,current_period_end);

create table if not exists public.tp_credit_ledger (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.tp_users(id) on delete cascade,
 amount integer not null check (amount <> 0 and amount between -1000000000 and 1000000000),
 entry_type text not null check (entry_type in ('monthly_grant','credit_topup','tool_run','admin_adjustment','refund','promotion')),
 description text not null default '' check (char_length(description) <= 500),
 idempotency_key text not null unique check (char_length(idempotency_key) between 8 and 180),
 payment_id uuid references public.tp_payments(id) on delete set null,
 created_by uuid references public.tp_users(id) on delete set null,
 created_at timestamptz not null default now()
);
create index if not exists tp_credit_ledger_user_created_idx on public.tp_credit_ledger(user_id,created_at desc);
create index if not exists tp_credit_ledger_payment_idx on public.tp_credit_ledger(payment_id);

create table if not exists public.tp_tool_licenses (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.tp_users(id) on delete cascade,
 product_id uuid not null references public.tp_products(id) on delete restrict,
 payment_id uuid not null unique references public.tp_payments(id) on delete restrict,
 license_key text not null unique,
 status text not null default 'active' check (status in ('active','revoked')),
 deployment_mode text not null default 'customer_hosted' check (deployment_mode in ('customer_hosted','managed')),
 delivery_status text not null default 'awaiting_setup' check (delivery_status in ('awaiting_setup','in_progress','ready','delivered')),
 source_code_url text,
 delivery_notes text not null default '' check (char_length(delivery_notes) <= 3000),
 included_setup_hours numeric(4,1) not null default 0 check (included_setup_hours between 0 and 100),
 purchased_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists tp_tool_licenses_user_idx on public.tp_tool_licenses(user_id,purchased_at desc);

create table if not exists public.tp_deployments (
 id uuid primary key default gen_random_uuid(),
 license_id uuid not null references public.tp_tool_licenses(id) on delete cascade,
 user_id uuid not null references public.tp_users(id) on delete cascade,
 hosting_provider text not null default '' check (char_length(hosting_provider) <= 100),
 deployment_url text not null default '' check (char_length(deployment_url) <= 1000),
 status text not null default 'not_started' check (status in ('not_started','in_progress','live','paused','failed')),
 notes text not null default '' check (char_length(notes) <= 3000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists tp_deployments_user_idx on public.tp_deployments(user_id,updated_at desc);

create table if not exists public.tp_tool_runs (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.tp_users(id) on delete cascade,
 product_id uuid not null references public.tp_products(id) on delete restrict,
 reference text not null unique,
 credits_charged integer not null check (credits_charged >= 0),
 status text not null default 'completed' check (status in ('started','completed','failed','refunded')),
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists tp_tool_runs_user_created_idx on public.tp_tool_runs(user_id,created_at desc);
create index if not exists tp_tool_runs_product_created_idx on public.tp_tool_runs(product_id,created_at desc);

alter table public.tp_products enable row level security;
alter table public.tp_subscription_plans enable row level security;
alter table public.tp_credit_packs enable row level security;
alter table public.tp_payments enable row level security;
alter table public.tp_subscriptions enable row level security;
alter table public.tp_credit_ledger enable row level security;
alter table public.tp_tool_licenses enable row level security;
alter table public.tp_deployments enable row level security;
alter table public.tp_tool_runs enable row level security;
revoke all on public.tp_products,public.tp_subscription_plans,public.tp_credit_packs,public.tp_payments,public.tp_subscriptions,public.tp_credit_ledger,public.tp_tool_licenses,public.tp_deployments,public.tp_tool_runs from anon,authenticated;
grant select,insert,update,delete on public.tp_products,public.tp_subscription_plans,public.tp_credit_packs,public.tp_payments,public.tp_subscriptions,public.tp_credit_ledger,public.tp_tool_licenses,public.tp_deployments,public.tp_tool_runs to service_role;

insert into public.tp_products(
 slug,name,summary,description,category,product_type,hosted_path,price_minor,currency,
 hosted_enabled,self_hosted_enabled,visible_publicly,active,credit_cost_per_run,features
) values(
 'seo-content-brief','SEO Content Brief Builder',
 'Turn a topic into a structured editorial plan and save it to your workspace.',
 'This version uses a structured template. It does not yet call an AI model or fetch live search results. Configure a price and hosted credit cost in the admin dashboard before enabling access.',
 'tool','hosted_tool','/tools/seo-content-brief/',0,'NGN',false,false,true,false,1,
 '["Structured content brief","Save a brief to your workspace","Template-based; not currently AI-powered"]'::jsonb
) on conflict(slug) do nothing;

create or replace function public.tp_credit_balance(p_user_id uuid)
returns integer language sql security definer set search_path=public,pg_temp as $$
 select coalesce(sum(amount),0)::integer from public.tp_credit_ledger where user_id=p_user_id
$$;

create or replace function public.tp_credit_apply(
 p_user_id uuid,p_amount integer,p_entry_type text,p_description text,p_idempotency_key text,p_payment_id uuid default null,p_created_by uuid default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare existing public.tp_credit_ledger%rowtype; current_balance integer; new_id uuid;
begin
 if p_user_id is null or p_amount is null or p_amount=0 or abs(p_amount)>1000000000
    or p_entry_type not in ('monthly_grant','credit_topup','tool_run','admin_adjustment','refund','promotion')
    or p_idempotency_key is null or char_length(p_idempotency_key)<8 or char_length(p_idempotency_key)>180 then
   return jsonb_build_object('status','invalid_request');
 end if;
 perform 1 from public.tp_users where id=p_user_id for update;
 if not found then return jsonb_build_object('status','user_not_found'); end if;
 select * into existing from public.tp_credit_ledger where idempotency_key=p_idempotency_key;
 if found then return jsonb_build_object('status','duplicate','balance',public.tp_credit_balance(p_user_id),'entry_id',existing.id); end if;
 current_balance:=public.tp_credit_balance(p_user_id);
 if p_amount<0 and current_balance+p_amount<0 then
   return jsonb_build_object('status','insufficient_credits','balance',current_balance);
 end if;
 insert into public.tp_credit_ledger(user_id,amount,entry_type,description,idempotency_key,payment_id,created_by)
 values(p_user_id,p_amount,p_entry_type,left(coalesce(p_description,''),500),p_idempotency_key,p_payment_id,p_created_by)
 on conflict(idempotency_key) do nothing returning id into new_id;
 if new_id is null then return jsonb_build_object('status','duplicate','balance',public.tp_credit_balance(p_user_id)); end if;
 return jsonb_build_object('status','applied','balance',public.tp_credit_balance(p_user_id),'entry_id',new_id);
end $$;

create or replace function public.tp_fulfill_payment(p_payment_id uuid,p_provider_transaction_id text default null,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.tp_payments%rowtype; plan_row public.tp_subscription_plans%rowtype; pack_row public.tp_credit_packs%rowtype;
 product_row public.tp_products%rowtype; sub_row public.tp_subscriptions%rowtype; credit_result jsonb; license_id uuid; key_value text; now_value timestamptz:=now();
begin
 select * into p from public.tp_payments where id=p_payment_id for update;
 if not found then return jsonb_build_object('status','payment_not_found'); end if;
 if p.status='paid' and p.fulfilled_at is not null then return jsonb_build_object('status','already_fulfilled'); end if;
 if p.status not in ('pending','paid') then return jsonb_build_object('status','payment_not_pending'); end if;
 if p.payment_type='membership' then
   select * into plan_row from public.tp_subscription_plans where id=p.plan_id;
   if not found then raise exception 'subscription plan missing'; end if;
   update public.tp_subscriptions set status='expired',updated_at=now_value
     where user_id=p.user_id and status='active' and current_period_end<=now_value;
   select * into sub_row from public.tp_subscriptions
     where user_id=p.user_id and status='active' and current_period_end>now_value
     order by current_period_end desc limit 1 for update;
   if found then
     if sub_row.plan_id<>p.plan_id or sub_row.gateway<>p.gateway then
       raise exception 'user already has another active subscription';
     end if;
     update public.tp_subscriptions set
       current_period_end=greatest(current_period_end,now_value)+interval '1 month',
       last_payment_reference=p.reference,updated_at=now_value,
       provider_subscription_id=coalesce(nullif(p.provider_subscription_id,''),provider_subscription_id),
       provider_plan_id=coalesce(provider_plan_id,case when p.gateway='paystack' then plan_row.paystack_plan_code when p.gateway='flutterwave' then plan_row.flutterwave_payment_plan_id::text end)
     where id=sub_row.id;
   else
     insert into public.tp_subscriptions(user_id,plan_id,gateway,status,current_period_start,current_period_end,last_payment_reference,provider_plan_id,provider_subscription_id)
     values(p.user_id,p.plan_id,p.gateway,'active',now_value,now_value+interval '1 month',p.reference,
       case when p.gateway='paystack' then plan_row.paystack_plan_code when p.gateway='flutterwave' then plan_row.flutterwave_payment_plan_id::text end,
       nullif(p.provider_subscription_id,''));
   end if;
   credit_result:=public.tp_credit_apply(p.user_id,plan_row.monthly_credits,'monthly_grant',
     'Monthly credits — '||plan_row.name,'payment:'||p.reference||':monthly-credits',p.id,null);
   if credit_result->>'status' not in ('applied','duplicate') then raise exception 'could not grant monthly credits'; end if;
 elsif p.payment_type='credit_topup' then
   select * into pack_row from public.tp_credit_packs where id=p.credit_pack_id;
   if not found then raise exception 'credit pack missing'; end if;
   credit_result:=public.tp_credit_apply(p.user_id,pack_row.credits,'credit_topup',
     'Credit pack — '||pack_row.name,'payment:'||p.reference||':top-up',p.id,null);
   if credit_result->>'status' not in ('applied','duplicate') then raise exception 'could not grant top-up credits'; end if;
 elsif p.payment_type='tool_license' then
   select * into product_row from public.tp_products where id=p.product_id;
   if not found or not product_row.self_hosted_enabled then raise exception 'tool licence unavailable'; end if;
   key_value:='TP-'||upper(encode(gen_random_bytes(16),'hex'));
   insert into public.tp_tool_licenses(user_id,product_id,payment_id,license_key,status,deployment_mode,delivery_status,source_code_url,delivery_notes,included_setup_hours)
   values(p.user_id,p.product_id,p.id,key_value,'active','customer_hosted',
     case when coalesce(product_row.source_code_url,'')<>'' then 'ready' else 'awaiting_setup' end,
     product_row.source_code_url,product_row.source_delivery_notes,product_row.included_setup_hours)
   on conflict(payment_id) do nothing returning id into license_id;
 end if;
 update public.tp_payments set status='paid',provider_transaction_id=coalesce(nullif(p_provider_transaction_id,''),provider_transaction_id),
   metadata=coalesce(metadata,'{}'::jsonb)||coalesce(p_metadata,'{}'::jsonb),verified_at=coalesce(verified_at,now_value),
   fulfilled_at=now_value,updated_at=now_value where id=p.id;
 return jsonb_build_object('status','fulfilled','payment_type',p.payment_type,'reference',p.reference);
end $$;

create or replace function public.tp_start_tool_run(p_user_id uuid,p_product_slug text,p_run_reference text,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare product_row public.tp_products%rowtype;sub_row public.tp_subscriptions%rowtype;credit_result jsonb;new_id uuid;now_value timestamptz:=now();
begin
 select * into product_row from public.tp_products where slug=p_product_slug and active=true and hosted_enabled=true;
 if not found then return jsonb_build_object('status','tool_unavailable'); end if;
 select * into sub_row from public.tp_subscriptions where user_id=p_user_id and status in ('active','cancelled') and current_period_end>now_value order by current_period_end desc limit 1;
 if not found then return jsonb_build_object('status','membership_required'); end if;
 if char_length(coalesce(p_run_reference,''))<8 or char_length(p_run_reference)>180 then return jsonb_build_object('status','invalid_reference'); end if;
 if exists(select 1 from public.tp_tool_runs where reference=p_run_reference) then return jsonb_build_object('status','duplicate_run'); end if;
 if product_row.credit_cost_per_run>0 then
  credit_result:=public.tp_credit_apply(p_user_id,-product_row.credit_cost_per_run,'tool_run',
    'Hosted run — '||product_row.name,'tool-run:'||p_run_reference,null,null);
  if credit_result->>'status' not in ('applied','duplicate') then return jsonb_build_object('status',credit_result->>'status','balance',credit_result->'balance'); end if;
 end if;
 insert into public.tp_tool_runs(user_id,product_id,reference,credits_charged,status,metadata)
 values(p_user_id,product_row.id,p_run_reference,product_row.credit_cost_per_run,'completed',coalesce(p_metadata,'{}'::jsonb))
 returning id into new_id;
 return jsonb_build_object('status','ok','run_id',new_id,'credits_charged',product_row.credit_cost_per_run,'balance',public.tp_credit_balance(p_user_id));
end $$;

revoke all on function public.tp_credit_balance(uuid) from public,anon,authenticated;
revoke all on function public.tp_credit_apply(uuid,integer,text,text,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.tp_fulfill_payment(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.tp_start_tool_run(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.tp_credit_balance(uuid) to service_role;
grant execute on function public.tp_credit_apply(uuid,integer,text,text,text,uuid,uuid) to service_role;
grant execute on function public.tp_fulfill_payment(uuid,text,jsonb) to service_role;
grant execute on function public.tp_start_tool_run(uuid,text,text,jsonb) to service_role;
