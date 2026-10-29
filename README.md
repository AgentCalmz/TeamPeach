# TeamPeach
TeamPeach is a peach/ivory/navy AI-tools and automation website served by one Node.js/Express Web Service on Render. Public pages live in public/; server code and secrets are outside that folder.

## Included
- Responsive public website, a separate editorial Journal, a product and pricing catalogue, and a signed-in workspace for custom project requests, Tools & Services, Billing & Plans and Support Inbox. Each workspace area has a dedicated URL and shared responsive navigation. The SEO content brief builder currently uses a structured local template; it does not call an LLM or pull live SERP data.
- Clean URLs, redirects away from .html URLs, canonical URLs, a generated sitemap (including the public product catalogue), and a robots.txt that blocks crawling of API and private workspace routes.
- Custom six-digit email OTP registration and password-reset codes. A user record is created only after the OTP is verified.
- Interruption-friendly registration: only name/email are kept as browser draft; neither password nor OTP is persisted in browser storage.
- Server-side scrypt password hashes, HMAC-hashed opaque session cookies, logout/session revocation, CSRF checks, rate limits, CSP/security headers and validation.
- Brevo transactional email over HTTPS API or SMTP, selectable explicitly to avoid using the wrong credential type, with persistent Supabase queue, one-person admin email and opt-in broadcasts with signed unsubscribe links.
- Admin allowlist, project inquiry storage and email notifications.
- Sitemap/robots support including explicit OAI-SearchBot access.

## Setup
1. Run `supabase/migrations/001_teampeach.sql` in Supabase SQL Editor before enabling account features. Then run `supabase/migrations/002_workspace_dashboard.sql` for the legacy brief-builder workspace storage, `supabase/migrations/003_support_chat.sql` for general customer support chat, `supabase/migrations/004_commerce.sql` for the catalogue, memberships, credits and payments, `supabase/migrations/005_usd_pricing.sql` to convert catalogue prices to USD, and `supabase/migrations/006_custom_project_requests.sql` for private customer project requests, project-specific chat and USD quotes. Apply migrations 001–006 once, in order. Visit `/api/health` after deployment: it reports database, optional legacy brief-storage, email, commerce, USD-catalogue and custom-request readiness without exposing secrets.
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

## Workspace and administration navigation

Customers sign in at `/login/` and land at `/dashboard/`. The customer workspace has focused pages at `/dashboard/requests/`, `/dashboard/tools/`, `/dashboard/billing/` and `/dashboard/support/`. Generic personal Projects and Tasks have been removed from navigation; the old `/dashboard/projects/` and `/dashboard/tasks/` paths redirect to Custom project requests.

A customer submits a custom tool, agent, chatbot, website or automation request from `/dashboard/requests/`, with the brief, intended outcome, platform, budget and timeline. Every request has its own private discussion at `/dashboard/requests/view/?id=...`, status (New, Discussion, In progress or Completed), and quote in USD. The administrator can review requests at `/admin/requests/`, set and submit a USD quote, change project status, and reply in the request-specific chat. General support conversations remain in the separate Support inbox. Public catalogue calls to action check the current session: a signed-in customer is taken to the relevant workspace or billing area, while a guest is sent to sign-in with a return destination.

The administrator console is at `/admin/`. Visitors without a session are sent to the dedicated `/admin/login/` page, which verifies both the account password and the administrator allowlist. The console navigation separates Support Inbox, Custom Project Requests, Products & Tools, Membership Plans, Credit Packs, Customers, Licences & Delivery, Payments, and Email & Enquiries. Administration remains restricted to accounts listed in `ADMIN_EMAILS`; the console verifies the signed-in account before showing its contents. The customer sidebar only displays the Admin console link for an allowlisted administrator.

## Public routes
/ ; /journal/ ; /journal/what-is-an-ai-agent/ ; /journal/choosing-an-ai-tool/ ; /journal/business-tasks-worth-automating/ ; /products/ ; /tools/seo-content-brief/ ; /register/ ; /verify-email/ ; /login/ ; /forgot-password/ ; /account/ ; /admin/ ; /admin/requests/ ; /dashboard/requests/ ; /dashboard/requests/view/ ; /unsubscribe/.

## SEO, AEO and GEO
Public pages use absolute canonical URLs. The build script generates a sitemap from eligible public index pages and excludes noindex account routes. robots.txt permits OAI-SearchBot and points to the sitemap. Prioritize original, factual, useful answers, clear headings, descriptive titles, internal links and accurate structured data; none can guarantee ranking or AI citations. Each new article should be added as its own public/journal/<slug>/index.html file.

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

Run `supabase/migrations/006_custom_project_requests.sql` after migration 005 to enable the dedicated customer project request form, request-specific chat, status tracking and quote workflow. Apply the migration in the same Supabase project used by the deployed Render service. The application health response reports `customRequestsSchemaReady` and `usdPricingReady`; the public catalogue intentionally refuses to display non-USD catalogue rows rather than mislabel them.
