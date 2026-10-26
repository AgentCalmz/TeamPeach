# TeamPeach
TeamPeach is a peach/ivory/navy AI-tools and automation website served by one Node.js/Express Web Service on Render. Public pages live in public/; server code and secrets are outside that folder.

## Included
- Existing responsive brand theme, home page, tool concept and AI-agent article.
- Clean URLs, redirects away from .html URLs, canonical URLs and a generated sitemap.
- Custom six-digit email OTP registration and password-reset codes. A user record is created only after the OTP is verified.
- Interruption-friendly registration: only name/email are kept as browser draft; neither password nor OTP is persisted in browser storage.
- Server-side scrypt password hashes, HMAC-hashed opaque session cookies, logout/session revocation, CSRF checks, rate limits, CSP/security headers and validation.
- Brevo SMTP transactional email, persistent Supabase queue, one-person admin email and opt-in SMTP broadcasts with signed unsubscribe links.
- Admin allowlist, project inquiry storage and email notifications.
- Sitemap/robots support including explicit OAI-SearchBot access.

## Setup
1. Run `supabase/migrations/001_teampeach.sql` in Supabase SQL Editor before enabling account features. Visit `/api/health` after deployment: it reports database and email readiness without exposing secrets.
2. In Brevo, authenticate your sending domain and verify the sender email. Use the SMTP relay host, port, login and **SMTP key** from your Brevo SMTP settings. The SMTP key is not your Brevo account password and is not an API key. Default relay settings are `smtp-relay.brevo.com` and port `587`.
3. Generate three different secrets with `openssl rand -hex 32` for `OTP_PEPPER`, `SESSION_SECRET` and `RATE_LIMIT_SECRET`. Do not reuse a secret. Keep credentials only in Render Environment or an untracked local `.env`.
4. Add the values from `.env.example` to Render Environment. Never expose `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_PASS`, `SMTP_USER` or application secrets to browser JavaScript or GitHub.
5. Create a Render **Web Service**, Node.js 22+, with build command `npm ci && npm run build` and start command `npm start`. Set `NODE_ENV=production`.
6. Initially, `SITE_URL`, `APP_BASE_URL` and `TRUSTED_ORIGINS` can be omitted: the app detects Render's temporary external URL. When your custom domain is ready, set them to your real HTTPS domain before rebuilding/redeploying.
7. In Render, add your custom domain and follow its DNS instructions when you're ready. Preserve Brevo's email-authentication TXT/CNAME records.
8. Add the intended administrator email(s) to `ADMIN_EMAILS`, create and verify an account with one of those addresses, and test OTP, resend, login, logout, password reset, preferences, inquiry, one-person email and an opted-in broadcast before launch.

## Security and launch notes
- RLS is enabled on custom tables and no browser policies are created. The server uses the Supabase service-role key only on the server.
- Auth, registration, password recovery, login and project inquiries use HMAC-keyed, database-backed rate limits alongside a per-process limiter. The database stores HMACed bucket identifiers, not raw IPs or email addresses.
- Transactional and marketing messages are sent through Brevo SMTP using `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` and `SMTP_PASS`; there is no dependency on Brevo's HTTP API key, marketing list ID or provider webhook.
- Email usage reservations cap total email at 250 per rolling 24 hours by default, with up to 200 reserved for opt-in broadcasts, leaving at least 50 of that configured daily allowance available for transactional/project-notification email.
- Broadcast recipients are drawn only from users who opted in. Messages include a signed TeamPeach unsubscribe link, and the queue checks the saved preference again immediately before sending.
- If SMTP delivery is ambiguous, the reservation is retained rather than risking duplicate sends. Interrupted queue rows are marked for operator inspection rather than automatically resent.
- Free Render services may sleep after inactivity; background work pauses while sleeping and resumes on wake.
- Before live launch, add real privacy, terms and business/operator contact pages; verify sender SPF/DKIM/DMARC; review retention, deletion, backups and abuse monitoring. Repository checks are not a live deployment test or a security certification.

## Public routes
/ ; /journal/what-is-an-ai-agent/ ; /tools/seo-content-brief/ ; /register/ ; /verify-email/ ; /login/ ; /forgot-password/ ; /account/ ; /admin/ ; /unsubscribe/.

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
