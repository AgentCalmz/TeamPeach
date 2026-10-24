# TeamPeach
TeamPeach is a peach/ivory/navy AI-tools and automation website served by one Node.js/Express Web Service on Render. Public pages live in public/; server code and secrets are outside that folder.

## Included
- Existing responsive brand theme, home page, tool concept and AI-agent article.
- Clean URLs, redirects away from .html URLs, canonical URLs and a generated sitemap.
- Custom six-digit email OTP registration and password-reset codes. A user record is created only after the OTP is verified.
- Interruption-friendly registration: only name/email are kept as browser draft; neither password nor OTP is persisted in browser storage.
- Server-side scrypt password hashes, hashed opaque session cookies, logout/session revocation, CSRF checks, rate limits, CSP/security headers and validation.
- Brevo transactional email sender, persistent Supabase email queue, one-person admin email, opt-in Brevo marketing campaigns and native campaign unsubscribe links.
- Admin allowlist, project inquiry storage and email notifications.
- Sitemap/robots support including explicit OAI-SearchBot access.

## Setup
1. Run supabase/migrations/001_teampeach.sql in Supabase SQL Editor before enabling account features. It is designed to be re-runnable for the provider campaign ID column and function definitions.
2. Authenticate your sending domain in Brevo and verify the sender. Generate a Brevo API key; the SMTP password is not the API key used by the HTTP integration. Create a dedicated marketing list in Brevo and set its numeric ID as BREVO_MARKETING_LIST_ID. Transactional account emails use the transactional endpoint; opt-in broadcasts use the Brevo Marketing Campaign API.
3. Generate two different secrets with openssl rand -hex 32 for OTP_PEPPER and UNSUBSCRIBE_SECRET.
4. Add variables from .env.example to Render Environment. Never expose SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY or any of these secrets to client JavaScript.
5. Set Render service type to Web Service, build command npm install && npm run build, start command npm start, Node.js 20+.
6. Set APP_BASE_URL to the currently live primary host; once connected, use https://teampeach.org. Set SITE_URL to https://teampeach.org before build.
7. Add teampeach.org in Render Custom Domains and follow the DNS instructions. Preserve Brevo TXT/CNAME/MX records.
8. Add the intended administrator email(s) to ADMIN_EMAILS, create and verify an account with one of those addresses, then test OTP, reload, login, logout, reset, preferences, inquiry and one-to-one admin email before broadcasts.

## Security and launch notes
- RLS is enabled on custom tables and no browser policies are created. The server uses the service-role key on the server only.
- IP rate limits are in-process and reset when a free Render instance restarts. OTP attempts, expiry, account uniqueness and email queue state are persisted in Supabase.
- The email worker caps sending at 250/day by default. Broadcast sends include an unsubscribe link, are sent only to opted-in users, and re-check the user's preference immediately before sending.
- Exact-once email delivery cannot be guaranteed if the provider accepts a message just before the server crashes; interrupted queue rows are marked for operator inspection rather than automatically resent.
- Free Render services may sleep after inactivity; background work pauses while sleeping and resumes on wake.
- Before live launch, add a real privacy notice, terms and business/operator contact information; verify sender SPF/DKIM/DMARC; review retention, deletion, backups and abuse monitoring. This implementation has not yet been tested against your private Supabase/Brevo configuration and is not certified production-ready simply by committing.

## Public routes
/ ; /journal/what-is-an-ai-agent/ ; /tools/seo-content-brief/ ; /register/ ; /verify-email/ ; /login/ ; /forgot-password/ ; /account/ ; /admin/ ; /unsubscribe/.

## SEO, AEO and GEO
Public pages use absolute canonical URLs. The build script generates a sitemap from eligible public index pages and excludes noindex account routes. robots.txt permits OAI-SearchBot and points to the sitemap. Prioritize original, factual, useful answers, clear headings, descriptive titles, internal links and accurate structured data; none can guarantee ranking or AI citations. Each new article should be added as its own public/journal/<slug>/index.html file.

## Local development
Run npm install, copy .env.example to an untracked .env, then npm run build, npm test and npm start. Set real credentials only in the local untracked file or Render Environment.