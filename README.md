# TeamPeach
TeamPeach is a peach/ivory/navy AI-tools and automation website served by one Node.js/Express Web Service on Render. Public pages live in public/; server code and secrets are outside that folder.

## Included
- Responsive public website plus a multi-page signed-in workspace: Overview, Tools & Services, Billing & Plans, Support Inbox, Account Settings and an administrator-only Journal Editor. The editor supports Markdown rich formatting, live preview, drafts, publishing, search metadata and generated public article pages. PeachBrief is a published DeepSeek-powered AI SEO content brief tool. It creates editorial recommendations but does not fetch live SERP rankings, search volumes or competitor data.
- Clean URLs, redirects away from .html URLs, canonical URLs, a generated sitemap (including the public product catalogue), and a robots.txt that blocks crawling of API and private workspace routes.
- Custom six-digit email OTP registration and password-reset codes. A user record is created only after the OTP is verified.
- Interruption-friendly registration: only name/email are kept as browser draft; neither password nor OTP is persisted in browser storage.
- Server-side scrypt password hashes, HMAC-hashed opaque session cookies, logout/session revocation, CSRF checks, rate limits, CSP/security headers and validation.
- Brevo transactional email over HTTPS API or SMTP, selectable explicitly to avoid using the wrong credential type, with persistent Supabase queue, one-person admin email and opt-in broadcasts with signed unsubscribe links.
- Admin allowlist, project inquiry storage and email notifications.
- Sitemap/robots support including explicit OAI-SearchBot access.

## Setup
1. Run `supabase/migrations/001_teampeach.sql` in Supabase SQL Editor before enabling account features. Then run `supabase/migrations/002_workspace_dashboard.sql` for workspace projects/tasks and `supabase/migrations/003_support_chat.sql` for the customer dashboard support chat and admin inbox, followed by `supabase/migrations/004_commerce.sql` for commerce, `supabase/migrations/005_usd_pricing.sql` to move catalogue pricing to USD, `supabase/migrations/006_custom_requests.sql` for customer custom requests, and `supabase/migrations/007_journal_articles.sql` for the administrator journal editor. Apply each migration once, in order. Migration 007 creates the protected `tp_journal_articles` table; the editor reports a setup message until it has been applied. Visit `/api/health` after deployment: it reports database, email and workspace readiness without exposing secrets.
2. In Brevo, verify the sender email and copy the SMTP login and SMTP key from Settings → SMTP & API → SMTP (the SMTP login is not necessarily your account email, and the SMTP key is not your account password or API key). For a Render Free service, set `EMAIL_TRANSPORT=smtp`, `SMTP_HOST=smtp-relay.brevo.com`, and `SMTP_PORT=2525`; Render blocks outbound ports `25`, `465` and `587` on free web services, while Brevo supports `2525`. Fill `SMTP_USER`, `SMTP_PASS` and `BREVO_SENDER_EMAIL` from your new Brevo account. If you deliberately want HTTPS API sending instead, set `EMAIL_TRANSPORT=brevo-api` and supply a standard `BREVO_API_KEY`. `EMAIL_TRANSPORT=auto` chooses the API when a non-empty API key is present, otherwise SMTP. Explicit `smtp` mode ignores even an old or invalid `BREVO_API_KEY`.
3. Generate three different secrets with `openssl rand -hex 32` for `OTP_PEPPER`, `SESSION_SECRET` and `RATE_LIMIT_SECRET`. Do not reuse a secret. Keep credentials only in Render Environment or an untracked local `.env`.
4. Add the values from `.env.example` to Render Environment. Never expose `SUPABASE_SERVICE_ROLE_KEY`, `BREVO_API_KEY`, `SMTP_PASS`, `SMTP_USER` or application secrets to browser JavaScript or GitHub.
5. Create a Render **Web Service**, Node.js 22+, with build command `npm ci && npm run build` and start command `npm start`. Set `NODE_ENV=production`.
6. Initially, `SITE_URL`, `APP_BASE_URL` and `TRUSTED_ORIGINS` can be omitted: the app detects Render's temporary external URL. When your custom domain is ready, set them to your real HTTPS domain before rebuilding/redeploying.
7. In Render, add your custom domain and follow its DNS instructions when you're ready. Preserve Brevo's email-authentication TXT/CNAME records.
8. Add the intended administrator email(s) to `ADMIN_EMAILS`, create and verify an account with one of those addresses, and test OTP, resend, login, logout, password reset, preferences, inquiry, one-person email and an opted-in broadcast before launch.

## Security and launch notes
- RLS is enabled on custom tables and no browser policies are created. The server uses the Supabase service-role key only on the server.
- Auth, registration, password recovery, login and project inquiries use HMAC-keyed, database-backed rate limits alongside a per-process limiter. The database stores HMACed bucket identifiers, not raw IPs or email addresses.
- `EMAIL_TRANSPORT=smtp` forces SMTP and ignores any API key; use port `2525` for Render Free. `EMAIL_TRANSPORT=brevo-api` forces HTTPS API delivery and requires `BREVO_API_KEY`; `auto` selects API if the key exists or SMTP otherwise. API and SMTP credentials are different. There is no dependency on a marketing list ID or provider webhook.
- Email usage reservations cap total email at 250 per rolling 24 hours by default, with up to 200 reserved for opt-in broadcasts, leaving at least 50 of that configured daily allowance available for transactional/project-notification email.
- Broadcast recipients are drawn only from users who opted in. Messages include a signed TeamPeach unsubscribe link, and the queue checks the saved preference again immediately before sending.
- If SMTP delivery is ambiguous, the reservation is retained rather than risking duplicate sends. Interrupted queue rows are marked for operator inspection rather than automatically resent.
- Free Render services may sleep after inactivity; background work pauses while sleeping and resumes on wake.
- Before live launch, add real privacy, terms and business/operator contact pages; verify sender SPF/DKIM/DMARC; review retention, deletion, backups and abuse monitoring. Repository checks are not a live deployment test or a security certification.

## Journal editing and publishing
Sign in using an account listed in `ADMIN_EMAILS`, then open `/dashboard/journal/` from the administrator section of the workspace sidebar. Create a draft, write using the toolbar (bold, italic, headings, lists, quotes, links, inline code and dividers), review the live article and search-snippet previews, then save or publish. Publishing makes a page available at `/journal/<slug>/`; the public journal list and dynamic sitemap include published articles. Before using this feature in production, apply `supabase/migrations/007_journal_articles.sql` in Supabase SQL Editor.

## Workspace and administration navigation

Customers sign in at `/login/` and land at `/dashboard/`. The workspace has separate pages at `/dashboard/projects/`, `/dashboard/tasks/`, `/dashboard/tools/`, `/dashboard/billing/` and `/dashboard/support/` so the customer does not have to navigate one long dashboard. Each page shares the same responsive sidebar.

The administrator console is at `/admin/`. Visitors without a session are sent to the dedicated `/admin/login/` page, which verifies both the account password and the administrator allowlist. A shortcut to administrator sign-in is also available from the customer login page. The console navigation separates Support Inbox, Products & Tools, Membership Plans, Credit Packs, Customers, Licences & Delivery, Payments, and Email & Enquiries into `/admin/support/`, `/admin/products/`, `/admin/memberships/`, `/admin/credits/`, `/admin/customers/`, `/admin/fulfilment/`, `/admin/payments/` and `/admin/communications/`. Administration remains restricted to accounts listed in `ADMIN_EMAILS`; the console verifies the signed-in account before showing its contents. The customer sidebar only displays the Admin console and Journal editor links for an allowlisted administrator. The editor is at `/dashboard/journal/`; only allowlisted admins can read, save, publish, archive or delete journal content. PeachChat and PeachBrief are linked from the signed-in workspace overview and Tools & Services page.

## Public routes
/ ; /journal/ ; /journal/what-is-an-ai-agent/ ; /journal/choosing-an-ai-tool/ ; /journal/business-tasks-worth-automating/ ; /journal/<published-slug>/ ; /products/ ; /register/ ; /verify-email/ ; /login/ ; /forgot-password/ ; /account/ ; /dashboard/journal/ (administrator only) ; /admin/ ; /unsubscribe/. The public `/tools/peachchat/` and `/tools/seo-content-brief/` routes are indexed with page-specific canonical and social metadata.

## SEO, AEO and GEO
Public articles use absolute canonical URLs, descriptive titles and descriptions, Open Graph metadata, visible bylines and dates, answer-first summaries, question-led FAQ sections, useful internal links, cited primary references, `BlogPosting` structured data and breadcrumb structured data. The dashboard editor generates these public article pages from saved content and adds published articles to `/journal/` and the generated sitemap. Drafts and archived articles are not publicly listed. The build sitemap excludes noindex account routes, and robots.txt points crawlers to it. These foundations help search engines and answer systems understand content but cannot guarantee ranking or citation. Prioritize original, accurate, people-first content and add real expertise or experience where the author can substantiate it.

## Local development
Run `npm ci`, copy `.env.example` to an untracked `.env`, then run `npm run build`, `npm test` and `npm start`. Set real credentials only in the local untracked file or Render Environment.

## Security and launch checklist

- Account services require three distinct secrets: `OTP_PEPPER`, `SESSION_SECRET` and `RATE_LIMIT_SECRET`. Keep SMTP credentials and the Supabase service-role key server-side only.
- Persistent per-IP and per-email throttles protect registration, verification, recovery, login and project inquiries. The database stores HMACed bucket identifiers, not raw IP/email keys.
- API responses use `Cache-Control: no-store`; verification email addresses stay out of query strings; inline executable JavaScript is blocked by CSP; unsubscribe URLs use keyed signatures.
- Email usage is reserved transactionally. Uncertain SMTP outcomes retain their reservation rather than risking duplicates or exceeding the daily limit. Campaign messages are sent individually via SMTP only to users who opted in, with a signed unsubscribe link.
- Repository checks include dependency auditing, HTTP/security regression tests, CodeQL scanning and weekly Dependabot updates. A green CI run is not a live deployment test or a third-party security certification.
- Before launch, run the SQL migration in the real Supabase project; configure SMTP credentials in Render; test registration/OTP/resend/login/logout/password-reset/preferences/inquiry/one-person-email/unsubscribe/broadcast with test accounts. Add real privacy, terms and operator-contact pages and review retention, deletion, backups and abuse monitoring.


## In-dashboard support chat

The customer dashboard includes private support conversations. Signed-in users can open a conversation and continue replying without leaving TeamPeach; an account listed in `ADMIN_EMAILS` can answer from `/admin/`. Messages are stored in Supabase, shown only through authenticated server routes, and refreshed periodically while the page is open. This is polling-based chat, not WebSocket/live push.

Before enabling it in production, apply `supabase/migrations/003_support_chat.sql` in Supabase SQL Editor after migrations 001 and 002. The migration enables RLS and grants table access to the server-side service role only. The server health endpoint checks that both support tables exist. Use the customer dashboard and admin inbox to test a customer message, staff reply, status update, refresh, and a second account's access boundary.


## Memberships, usage credits, products and payments

The commerce feature provides the data model and server APIs for monthly memberships with credit allowances, separate one-time credit top-ups, product catalogue pricing, one-time self-hosted software licences, hosted tool charging, a credit ledger, user billing history, purchased licences and admin delivery controls.

Apply \`supabase/migrations/004_commerce.sql\` after migrations 001–003, then apply \`supabase/migrations/005_usd_pricing.sql\` to convert catalogue prices to USD before enabling new USD sales. The initial SEO brief product is seeded as inactive and unpriced. Configure and review its price, hosted path, run cost, and delivery scope in \`/admin/\` before publishing it. The current brief builder uses a structured template and does not call an AI model or live search yet.

### Payment test configuration

Set these variables in **Render → your TeamPeach service → Environment**. Never commit real keys to this repository or paste secret keys into chat:

- \`PAYMENT_MODE=test\`
- \`PAYSTACK_SECRET_KEY\`: your Paystack **test secret key** (starts with \`sk_test_\`)
- \`FLW_SECRET_KEY\`: your Flutterwave **test secret key** (starts with \`FLWSECK_TEST-\`)
- \`FLW_SECRET_HASH\`: the webhook secret hash configured in the Flutterwave test dashboard

Save and redeploy after setting them. The server refuses to use keys whose test/live prefix conflicts with \`PAYMENT_MODE\`. The browser never receives a provider secret key.

Configure these webhook URLs in the payment providers' test environments:
- Paystack: \`https://teampeach.org/api/payments/webhooks/paystack\`
- Flutterwave: \`https://teampeach.org/api/payments/webhooks/flutterwave\`

Before a monthly plan can be purchased through a gateway, create the plan in TeamPeach admin, publish it, and use the matching **Sync Paystack** or **Sync Flutterwave** action. If you change the price, sync the plan again. Payments and webhook notifications are verified server-side; a browser redirect alone does not grant credits or deliver a licence.

The web service starts in test mode. Do not set \`PAYMENT_MODE=live\` until both test gateways have been exercised end-to-end, duplicate webhook events have been tested, and the live keys and webhook hashes are configured only in Render.

### Self-hosted software purchases

A one-time licence record confirms the purchase and the agreed delivery status; it does not automatically deploy a separate Render service. The admin should set the source-code delivery link, included modification/setup scope and progress in the licence section. Customer deployment URLs and details are recorded in the dashboard. True automated customer-owned deployments can be added later; managed hosting needs a separately priced recurring hosting agreement.


## USD catalogue pricing

Run `supabase/migrations/005_usd_pricing.sql` once in the Supabase SQL Editor after migration 004. It converts existing NGN catalogue amounts to USD cents using an indicative market reference of **USD 1 = NGN 1,341.62 on 28 October 2026**; review and adjust the resulting commercial prices in Admin → Memberships, Credits and Products before treating them as final retail pricing. Existing payment records remain in their original currency. Plan rows referenced by payment/subscription history are preserved for those records, with separate USD plans created for new sales. Because the migration clears provider IDs for converted/new USD plans, open Admin → Memberships and sync each published USD plan with the gateway(s) you intend to offer. Paystack currently lists a USD transaction minimum of $2 and Nigeria-based USD acceptance requires the relevant international-payments approval; confirm that capability in your Paystack dashboard. Flutterwave USD card acceptance also depends on your account and enabled payment methods.


## Customization requests and project chat

The customer dashboard is focused on tools, billing, general support and **Custom requests**. Customers can submit a scoped request for a custom tool, agent, bot, integration or automation, including requirements, desired outcome, budget range and timeline. Each request has its own private thread so scope discussion stays attached to that project.

Administrators with an email in `ADMIN_EMAILS` can open `/admin/custom-requests/`, review the request queue, set its status (**New**, **In discussion**, **In progress**, or **Completed**), add quote notes and set a price in USD. A changed quote is added to the request thread as a system message; the customer can view it and ask follow-up questions. Status, messages and quotes are validated by authenticated server routes. One customer's request and messages are not available to another customer.

After migrations 001–005 have been applied, run `supabase/migrations/006_custom_requests.sql` in the Supabase SQL Editor. The customer page is `/dashboard/custom-requests/`; the administrator queue is `/admin/custom-requests/`. The old personal task/project tracker routes redirect to the custom requests page. Internal workspace storage is retained only for features such as saving SEO briefs; the generic project/task tracker is no longer part of the customer dashboard.

The public catalogue at `/products/` checks the signed-in session and exposes the appropriate checkout/workspace actions. Signed-in customers can start a supported USD checkout directly from the catalogue without being asked to sign in again. Monthly plans still need to be synced with each payment gateway from Admin → Memberships before that gateway can sell the plan. Verify international/USD payment acceptance, provider account settings, and test-mode checkout before publishing real prices.

The editorial journal has its own landing page at `/journal/`, separate from the product catalogue. The sitemap generator automatically includes this page and published journal articles.


## AI chatbot builder

The AI Chatbot Builder lets a signed-in user create a business assistant using a required business name and description. Products, services, FAQs, policies and response instructions are optional. Owners can test a saved draft in a private TeamPeach playground, then publish it and install one universal HTML widget snippet on one or many websites. Website restrictions are optional and are enforced by the public API using the browser origin; the TeamPeach share and preview pages remain available.

Apply `supabase/migrations/008_chatbot_builder.sql` once after migrations 001–007. The migration creates assistant configuration, daily aggregate usage and opt-in conversation tables. It enables RLS and grants table access only to the server service role. The health endpoint reports `chatbotSchemaReady` separately; apply the migration before using the chatbot builder.

Set these variables in **Render → TeamPeach → Environment** and redeploy:

- `DEEPSEEK_API_KEY`: your DeepSeek API key (server-side only; never put it in a widget or HTML snippet).
- `DEEPSEEK_MODEL=deepseek-flash`: model used for normal business replies.
- `CHATBOT_CREDITS_PER_1000_TOKENS=1`: adjustable number of TeamPeach credits charged per 1,000 combined input/output tokens. The first implementation charges at least one credit per successful reply. Review the rate against your credit-pack and membership economics before making the product widely available.

The chatbot charges the owner's existing TeamPeach wallet through the credit ledger. It does not create a second wallet. Free accounts do not store visitor transcripts in TeamPeach; a short conversation context is kept in page memory only. Visitor transcripts are not written to browser storage or TeamPeach unless the owner explicitly enables Premium conversation saving. Premium membership unlocks the conversation-saving and branding-removal switches, but **both switches are off by default and remain off until the owner enables them**. Conversation history is available in the dashboard only while membership is active and saving is enabled. Branding returns if membership is inactive, even if the owner's saved preference was previously enabled.

A new assistant is created as an unpublished draft. The owner tests it at `/chatbot-preview/`, then explicitly publishes it. Published assistants have a share page at `/assistant/?id=PUBLIC_ID` and an HTML snippet that loads `/js/chatbot-widget.js`. The standard self-service product does not crawl a website, manage staff, hand conversations to staff, read orders, create bookings or modify carts. Independently hosted software, staff workflows and custom commerce integrations are separate full-purchase/support work.

The public product page is `/tools/peachchat/`. It includes a descriptive canonical URL, Open Graph metadata, visible question-and-answer content, and structured WebApplication, FAQPage and BreadcrumbList data. The private workspace and per-assistant pages are marked noindex. Visitor messages remain in page memory by default; only the anonymous visitor key is stored in the browser when the owner enables server-side conversation saving. Run `npm run build` to regenerate both sitemap copies after adding public pages.
