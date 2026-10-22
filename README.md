# TeamPeach — public website

A premium, editorial-style AI tools and automation hub. Root assets use relative URLs so the public pages can work both at a Render root domain and on GitHub Pages under a project path. This is the public-site phase; it intentionally does not implement authentication, payment processing, or live AI execution yet.

## Included
- Responsive landing page, mobile navigation, and animated editorial-style hero
- Searchable/filterable tool-concept catalogue with real stock-photo URLs from Unsplash
- Individual SEO Content Brief concept page and an original AI-agent explainer
- Reduced-motion support, keyboard focus states, responsive cards and accessible labels
- SEO basics: unique page titles/descriptions, Open Graph metadata, Organization and WebSite structured data
- robots.txt, sitemap template, SVG favicon, custom 404 page
- GitHub + Render Static Site structure

## Truthful status
The catalogue describes planned concepts, not live purchasable products. The inquiry form is a front-end preview and does not send or store details.

## Before launch
1. Replace the placeholder host in sitemap.xml with the actual Render URL or custom domain.
2. Add absolute canonical URLs and the correct live site URL in structured data once the production hostname is known.
3. Add the sitemap line to robots.txt and submit the sitemap in Google Search Console and Bing Webmaster Tools.
4. Connect the project form to a secure endpoint before soliciting real customer details.
5. Add real privacy, terms, refund/cancellation, and contact information before accounts or payments.
6. Verify all external photos and links, run mobile/accessibility checks, and validate structured data after deployment.
7. Never put API keys, payment secrets, OTP secrets, or customer data into these static files.

## Deployment

The asset links are intentionally relative. This supports Render at the domain root and GitHub Pages at a project URL such as `/TeamPeach/`.

### Deploy to Render
1. Connect repository MrCalmz/TeamPeach as a Static Site.
2. Build command: leave blank.
3. Publish directory: .
4. Deploy. Static sites do not require a keep-alive cron job.
5. Once Render generates the service URL, update sitemap.xml and SEO metadata. Relative asset paths are cache-busted via the stylesheet URL's `?v=3` query.

## Later phases
Custom email OTP authentication, a secure backend for AI execution, credit ledger, subscription billing, payment verification, and an admin dashboard.
