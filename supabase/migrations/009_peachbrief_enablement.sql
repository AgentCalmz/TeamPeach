-- Enable PeachBrief in the hosted TeamPeach catalogue.
-- Run once after 008_chatbot_builder.sql. Safe to rerun.
-- PeachBrief charges actual DeepSeek token usage in its own generation endpoint;
-- set the generic hosted-run cost to zero to prevent a second credit deduction.

insert into public.tp_products(
 slug,name,summary,description,category,product_type,hosted_path,price_minor,currency,
 hosted_enabled,self_hosted_enabled,visible_publicly,active,credit_cost_per_run,features
) values(
 'seo-content-brief',
 'PeachBrief — AI SEO Content Planner',
 'Create an AI-assisted SEO content brief from a topic, audience and reader goal.',
 'DeepSeek-powered editorial planning that produces a recommended angle, outline, reader questions, entities, internal-link ideas and evidence checks. It does not fetch live search rankings, search volumes or competitor data.',
 'tool','hosted_tool','/tools/seo-content-brief/',0,'USD',
 true,false,true,true,0,
 '["DeepSeek-powered SEO brief generation","Structured outline and reader questions","Save and update briefs in the workspace","No fabricated live ranking or search-volume data"]'::jsonb
)
on conflict (slug) do update set
 name=excluded.name,
 summary=excluded.summary,
 description=excluded.description,
 category=excluded.category,
 product_type=excluded.product_type,
 hosted_path=excluded.hosted_path,
 currency='USD',
 hosted_enabled=true,
 self_hosted_enabled=false,
 visible_publicly=true,
 active=true,
 credit_cost_per_run=0,
 features=excluded.features,
 updated_at=now();
