-- TeamPeach USD catalogue pricing and legacy billing preservation.
-- Safe to rerun after 004_commerce.sql; each pricing conversion only targets rows still marked NGN.
-- Reference conversion: USD 1 = NGN 1,341.62 (market quote, 2026-10-28).
-- Amount columns are minor units: kobo before conversion, cents after conversion.
-- Historical payment records are deliberately not converted.

alter table public.tp_products drop constraint if exists tp_products_currency_check;
alter table public.tp_products drop constraint if exists tp_products_currency_usd_ngn_check;
alter table public.tp_subscription_plans drop constraint if exists tp_subscription_plans_currency_check;
alter table public.tp_subscription_plans drop constraint if exists tp_subscription_plans_currency_usd_ngn_check;
alter table public.tp_credit_packs drop constraint if exists tp_credit_packs_currency_check;
alter table public.tp_credit_packs drop constraint if exists tp_credit_packs_currency_usd_ngn_check;
alter table public.tp_payments drop constraint if exists tp_payments_currency_check;
alter table public.tp_payments drop constraint if exists tp_payments_currency_usd_ngn_check;

alter table public.tp_products
  alter column currency set default 'USD',
  add constraint tp_products_currency_usd_ngn_check check (currency in ('NGN', 'USD'));
alter table public.tp_subscription_plans
  alter column currency set default 'USD',
  add constraint tp_subscription_plans_currency_usd_ngn_check check (currency in ('NGN', 'USD'));
alter table public.tp_credit_packs
  alter column currency set default 'USD',
  add constraint tp_credit_packs_currency_usd_ngn_check check (currency in ('NGN', 'USD'));
alter table public.tp_payments
  alter column currency set default 'USD',
  add constraint tp_payments_currency_usd_ngn_check check (currency in ('NGN', 'USD'));

do $$
declare
  v_ngn_per_usd numeric := 1341.62;
  v_plan record;
  v_usd_minor bigint;
  v_usd_slug text;
begin
  update public.tp_products
     set price_minor = round(price_minor::numeric / v_ngn_per_usd)::bigint,
         currency = 'USD',
         updated_at = now()
   where currency = 'NGN';

  update public.tp_credit_packs
     set price_minor = greatest(1, round(price_minor::numeric / v_ngn_per_usd)::bigint),
         currency = 'USD',
         updated_at = now()
   where currency = 'NGN';

  -- Preserve plan prices and provider IDs if subscription/payment history references them.
  for v_plan in
    select p.*
      from public.tp_subscription_plans p
     where p.currency = 'NGN'
       and (
         exists (select 1 from public.tp_subscriptions s where s.plan_id = p.id)
         or exists (select 1 from public.tp_payments pay where pay.plan_id = p.id)
       )
  loop
    v_usd_minor := greatest(1, round(v_plan.price_minor::numeric / v_ngn_per_usd)::bigint);
    v_usd_slug := left(v_plan.slug, 56) || '-usd-20261028-' || left(replace(v_plan.id::text, '-', ''), 8);

    update public.tp_subscription_plans
       set active = false, updated_at = now()
     where id = v_plan.id;

    insert into public.tp_subscription_plans
      (slug, name, description, price_minor, currency, monthly_credits,
       member_discount_percent, paystack_plan_code, flutterwave_payment_plan_id,
       active, sort_order, created_at, updated_at)
    values
      (v_usd_slug, v_plan.name, v_plan.description, v_usd_minor, 'USD',
       v_plan.monthly_credits, v_plan.member_discount_percent, null, null,
       v_plan.active, v_plan.sort_order, now(), now())
    on conflict (slug) do nothing;
  end loop;

  update public.tp_subscription_plans p
     set price_minor = greatest(1, round(p.price_minor::numeric / v_ngn_per_usd)::bigint),
         currency = 'USD',
         paystack_plan_code = null,
         flutterwave_payment_plan_id = null,
         updated_at = now()
   where p.currency = 'NGN'
     and not exists (select 1 from public.tp_subscriptions s where s.plan_id = p.id)
     and not exists (select 1 from public.tp_payments pay where pay.plan_id = p.id);
end $$;
