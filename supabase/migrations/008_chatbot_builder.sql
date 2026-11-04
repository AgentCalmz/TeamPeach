-- TeamPeach AI chatbot builder: owner-supplied knowledge, metered usage and opt-in conversation storage.
-- Run once after migrations 001-007.

create table if not exists public.tp_chatbots (
 id uuid primary key default gen_random_uuid(),
 public_id uuid not null unique default gen_random_uuid(),
 user_id uuid not null references public.tp_users(id) on delete cascade,
 assistant_name text not null default '' check (char_length(assistant_name) <= 100),
 business_name text not null check (char_length(btrim(business_name)) between 2 and 160),
 business_description text not null check (char_length(btrim(business_description)) between 3 and 4000),
 category text not null default '' check (char_length(category) <= 80),
 business_location text not null default '' check (char_length(business_location) <= 180),
 business_contact text not null default '' check (char_length(business_contact) <= 300),
 products_services text not null default '' check (char_length(products_services) <= 7000),
 faqs text not null default '' check (char_length(faqs) <= 8000),
 policies text not null default '' check (char_length(policies) <= 7000),
 instructions text not null default '' check (char_length(instructions) <= 6000),
 restrictions text not null default '' check (char_length(restrictions) <= 4000),
 welcome_message text not null default '' check (char_length(welcome_message) <= 500),
 tone text not null default 'friendly' check (tone in ('friendly','professional','concise','warm')),
 widget_color text not null default '#253047' check (widget_color ~ '^#[0-9A-Fa-f]{6}$'),
 widget_icon text not null default 'message' check (widget_icon in ('message','sparkles','help')),
 allowed_domains_enabled boolean not null default false,
 allowed_domains text[] not null default '{}'::text[] check (cardinality(allowed_domains) <= 50),
 save_conversations boolean not null default false,
 remove_branding boolean not null default false,
 is_active boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists tp_chatbots_user_created_idx on public.tp_chatbots(user_id,created_at desc);
create index if not exists tp_chatbots_public_idx on public.tp_chatbots(public_id) where is_active=true;

create table if not exists public.tp_chatbot_usage_daily (
 assistant_id uuid not null references public.tp_chatbots(id) on delete cascade,
 user_id uuid not null references public.tp_users(id) on delete cascade,
 usage_date date not null,
 request_count integer not null default 0 check (request_count >= 0),
 input_tokens bigint not null default 0 check (input_tokens >= 0),
 output_tokens bigint not null default 0 check (output_tokens >= 0),
 credits_charged bigint not null default 0 check (credits_charged >= 0),
 updated_at timestamptz not null default now(),
 primary key (assistant_id,usage_date)
);
create index if not exists tp_chatbot_usage_user_date_idx on public.tp_chatbot_usage_daily(user_id,usage_date desc);

-- Conversation content is stored only when the owner is a current member AND explicitly enables saving.
create table if not exists public.tp_chatbot_conversations (
 id uuid primary key default gen_random_uuid(),
 assistant_id uuid not null references public.tp_chatbots(id) on delete cascade,
 visitor_key uuid not null,
 message_count integer not null default 0 check (message_count >= 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 last_message_at timestamptz not null default now(),
 unique (assistant_id,visitor_key)
);
create index if not exists tp_chatbot_conversations_assistant_last_idx
 on public.tp_chatbot_conversations(assistant_id,last_message_at desc);

create table if not exists public.tp_chatbot_messages (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.tp_chatbot_conversations(id) on delete cascade,
 request_id uuid not null,
 role text not null check (role in ('user','assistant')),
 content text not null check (char_length(content) between 1 and 12000),
 created_at timestamptz not null default now(),
 unique (conversation_id,request_id,role)
);
create index if not exists tp_chatbot_messages_conversation_created_idx
 on public.tp_chatbot_messages(conversation_id,created_at asc);

alter table public.tp_chatbots enable row level security;
alter table public.tp_chatbot_usage_daily enable row level security;
alter table public.tp_chatbot_conversations enable row level security;
alter table public.tp_chatbot_messages enable row level security;
revoke all on public.tp_chatbots,public.tp_chatbot_usage_daily,public.tp_chatbot_conversations,public.tp_chatbot_messages from public,anon,authenticated;
grant select,insert,update,delete on public.tp_chatbots,public.tp_chatbot_usage_daily,public.tp_chatbot_conversations,public.tp_chatbot_messages to service_role;

create or replace function public.tp_chatbot_record_usage(
 p_assistant_id uuid,p_user_id uuid,p_usage_date date,p_requests integer,
 p_input_tokens bigint,p_output_tokens bigint,p_credits_charged bigint
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_id uuid;
begin
 if p_assistant_id is null or p_user_id is null or p_usage_date is null
    or p_requests<0 or p_input_tokens<0 or p_output_tokens<0 or p_credits_charged<0 then
  return jsonb_build_object('status','invalid_request');
 end if;
 select user_id into owner_id from public.tp_chatbots where id=p_assistant_id for update;
 if owner_id is null or owner_id<>p_user_id then
  return jsonb_build_object('status','not_authorised');
 end if;
 insert into public.tp_chatbot_usage_daily(assistant_id,user_id,usage_date,request_count,input_tokens,output_tokens,credits_charged)
 values(p_assistant_id,p_user_id,p_usage_date,p_requests,p_input_tokens,p_output_tokens,p_credits_charged)
 on conflict(assistant_id,usage_date) do update set
  request_count=tp_chatbot_usage_daily.request_count+excluded.request_count,
  input_tokens=tp_chatbot_usage_daily.input_tokens+excluded.input_tokens,
  output_tokens=tp_chatbot_usage_daily.output_tokens+excluded.output_tokens,
  credits_charged=tp_chatbot_usage_daily.credits_charged+excluded.credits_charged,
  updated_at=now();
 return jsonb_build_object('status','ok');
end $$;

create or replace function public.tp_chatbot_save_messages(
 p_assistant_id uuid,p_user_id uuid,p_visitor_key uuid,p_request_id uuid,
 p_user_content text,p_assistant_content text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_id uuid; conversation_id uuid;
begin
 if p_assistant_id is null or p_user_id is null or p_visitor_key is null or p_request_id is null
    or p_user_content is null or char_length(p_user_content)<1 or char_length(p_user_content)>12000
    or p_assistant_content is null or char_length(p_assistant_content)<1 or char_length(p_assistant_content)>12000 then
  return jsonb_build_object('status','invalid_request');
 end if;
 select user_id into owner_id from public.tp_chatbots
 where id=p_assistant_id and is_active=true and save_conversations=true for update;
 if owner_id is null or owner_id<>p_user_id then
  return jsonb_build_object('status','saving_disabled');
 end if;
 insert into public.tp_chatbot_conversations(assistant_id,visitor_key,last_message_at,updated_at)
 values(p_assistant_id,p_visitor_key,now(),now())
 on conflict(assistant_id,visitor_key) do update set last_message_at=now(),updated_at=now()
 returning id into conversation_id;
 insert into public.tp_chatbot_messages(conversation_id,request_id,role,content)
 values
  (conversation_id,p_request_id,'user',p_user_content),
  (conversation_id,p_request_id,'assistant',p_assistant_content)
 on conflict(conversation_id,request_id,role) do nothing;
 update public.tp_chatbot_conversations set
  message_count=(select count(*) from public.tp_chatbot_messages where conversation_id=tp_chatbot_conversations.id),
  updated_at=now(),last_message_at=now()
 where id=conversation_id;
 return jsonb_build_object('status','ok','conversation_id',conversation_id);
end $$;

revoke all on function public.tp_chatbot_record_usage(uuid,uuid,date,integer,bigint,bigint,bigint) from public,anon,authenticated;
revoke all on function public.tp_chatbot_save_messages(uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.tp_chatbot_record_usage(uuid,uuid,date,integer,bigint,bigint,bigint) to service_role;
grant execute on function public.tp_chatbot_save_messages(uuid,uuid,uuid,uuid,text,text) to service_role;
