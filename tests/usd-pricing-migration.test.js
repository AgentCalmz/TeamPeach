"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

test("USD pricing migration can be rerun after a partial or prior attempt",function(){
 const sql=fs.readFileSync(path.join(__dirname,"..","supabase","migrations","005_usd_pricing.sql"),"utf8");
 const tables=["tp_products","tp_subscription_plans","tp_credit_packs","tp_payments"];
 for(const table of tables){
  const constraint=table+"_currency_usd_ngn_check";
  const drop="alter table public."+table+" drop constraint if exists "+constraint;
  const add="add constraint "+constraint+" check (currency in ('NGN', 'USD'))";
  assert.ok(sql.includes(drop),"migration must remove an existing "+constraint+" before re-adding it");
  assert.ok(sql.indexOf(drop)<sql.indexOf(add),"existing "+constraint+" must be dropped before it is added");
 }
 assert.match(sql,/where currency = 'NGN'/);
 assert.match(sql,/where p\.currency = 'NGN'/);
 assert.match(sql,/Historical payment records are deliberately not converted/);
});
