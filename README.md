# TeamPeach
TeamPeach is a peach/ivory/navy AI-tools and automation website served by one Node.js/Express Web Service on Render. Public pages live in public/; server code and secrets are outside that folder.

## Included
- Existing responsive brand theme, home page, tool concept and AI-agent article.
- Clean URLs, redirects away from .html URLs, canonical URLs and a generated sitemap.
- Custom six-digit email OTP registration and password-reset codes. A user record is created only after the OTP is verified.
- Interruption-friendly registration: only name/email are kept as browser draft; neither password nor OTP is persisted in browser storage.
- Server-side scrypt password hashes, HMAC-hashed opaque session cookies, logout/session revocation, CSRF checks, rate limits, CSP/security headers and validation.
- Brevo transactional email sender, persistent Supabase email queue, one-person admin email, opt-in Brevo marketing campaigns and native campaign unsubscribe links.
- Admin allowlist, project inquiry storage and email notifications.
- Sitemap/robots support including explicit OAI-SearchBot access.

## Setup
1. Run supabase/migrations/001_teampeach.sql in Supabase SQL Editor before enabling account features. Visit /api/health after deployment: it reports whether the database schema and mail/auth environment are ready, without returning secret values. It also adds missing columns and refreshes the queue status constraint when re-run, so upgrades from the earlier schema stay compatible.
2. Authenticate your sending domain in Brevo and verify the sender. Generate a Brevo API key; the SMTP password is not the API key used by the HTTP integration. Create a dedicated marketing list in Brevo and set its numeric ID as BREVO_MARKETING_LIST_ID. Transactional account emails use the transactional endpoint; opt-in broadcasts use the Brevo Marketing Campaign API. Configure a **marketing** Brevo webhook for the `unsubscribed` event to POST to `https://teampeach.org/api/webhooks/brevo`, with Bearer authentication using `BREVO_WEBHOOK_TOKEN`. The server syncs unsubscribe events back to TeamPeach; do not put the token in the URL. Keep that Brevo list dedicated to TeamPeach opt-in contacts and do not add unrelated contacts manually.
3. Generate four different secrets with `openssl rand -hex 32` for `OTP_PEPPER`, `SESSION_SECRET`, `RATE_LIMIT_SECRET` and `BREVO_WEBHOOK_TOKEN`. Do not reuse a secret for multiple purposes. Keep them separate from the Brevo API key and Supabase service-role key.
4. Add variables from .env.example to Render Environment. Never expose SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY or any of these secrets to client JavaScript.
5. Create a Render **Web Service** (Render does not convert a Static Site into a Web Service), build command npm install && npm run build, start command npm start, Node.js 20+. Set NODE_ENV=production in Render Environment; keep NODE_ENV=development only for local HTTP testing.
6. Set APP_BASE_URL to the currently live primary host; once connected, use https://teampeach.org. Set SITE_URL to https://teampeach.org before build.
7. Add teampeach.org in Render Custom Domains and follow the DNS instructions. Preserve Brevo TXT/CNAME/MX records.
8. Add the intended administrator email(s) to ADMIN_EMAILS, create and verify an account with one of those addresses, then test OTP, reload, login, logout, reset, preferences, inquiry and one-to-one admin email before broadcasts.

## Security and launch notes
- RLS is enabled on custom tables and no browser policies are created. The server uses the service-role key on the server only.
- Auth, registration, password recovery, login and project inquiries use HMAC-keyed, database-backed rate-limit buckets in Supabase alongside a per-process limiter. The database stores only HMACed bucket identifiers, not raw IPs or email addresses.
- The email worker caps sending at 250/day by default, with a separate reserve of 50/day for transactional and project-notification email (`EMAIL_TRANSACTIONAL_RESERVE`). Broadcasts are restricted to opted-in users and use Brevo's marketing campaign unsubscribe handling.
- Exact-once email delivery cannot be guaranteed if the provider accepts a message just before the server crashes; interrupted queue rows are marked for operator inspection rather than automatically resent.
- Free Render services may sleep after inactivity; background work pauses while sleeping and resumes on wake.
- Before live launch, add a real privacy notice, terms and business/operator contact information; verify sender SPF/DKIM/DMARC; review retention, deletion, backups and abuse monitoring. This implementation has not yet been tested against your private Supabase/Brevo configuration and is not certified production-ready simply by committing.

## Public routes
/ ; /journal/what-is-an-ai-agent/ ; /tools/seo-content-brief/ ; /register/ ; /verify-email/ ; /login/ ; /forgot-password/ ; /account/ ; /admin/ ; /unsubscribe/.

## SEO, AEO and GEO
Public pages use absolute canonical URLs. The build script generates a sitemap from eligible public index pages and excludes noindex account routes. robots.txt permits OAI-SearchBot and points to the sitemap. Prioritize original, factual, useful answers, clear headings, descriptive titles, internal links and accurate structured data; none can guarantee ranking or AI citations. Each new article should be added as its own public/journal/<slug>/index.html file.

## Local development
Run npm install, copy .env.example to an untracked .env, then npm run build, npm test and npm start. Set real credentials only in the local untracked file or Render Environment.

## Security review follow-up (2026-10-24)

- The service requires a dedicated `SESSION_SECRET` for session-token HMACs.
- Persistent per-IP and per-email throttles protect authentication, verification-code sends, password recovery and project inquiries.
- Verification email addresses are kept out of URL query strings; inline JavaScript is blocked by CSP; Brevo webhook authentication uses a Bearer header.
- Automated checks do not replace a deployment test or independent security review. Validate the migration and provider configuration before accepting real customer data.


## Security review follow-up (2026-10-24)

- Account services require a dedicated `SESSION_SECRET` for HMAC-protected session-token hashes.
- Persistent per-IP and per-email throttles protect auth, verification, recovery and inquiry routes; only HMACed bucket identifiers are stored.
- Email capacity reservations are atomic. If the provider response is ambiguous, the reservation is retained rather than risking duplicate sends or daily-cap overruns.
- Verification email addresses stay out of URL query strings, inline JavaScript is blocked by CSP, and Brevo webhook authentication uses a Bearer header.
- This is not launch-certified until the migration runs successfully in the actual Supabase project and live auth/delivery flows are tested.


## Automated supply-chain checks

The GitHub Actions pipeline runs `npm audit --audit-level=high`. CodeQL advanced analysis runs on pushes, pull requests and a weekly schedule using the current CodeQL v4 action, and Dependabot checks npm and GitHub Actions versions weekly. Review automated dependency/security PRs before merging; never bypass failed security checks merely to deploy.
