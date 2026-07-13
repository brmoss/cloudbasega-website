# CloudBaseGA — marketing website

A modernised, on-brand rebuild of [cloudbasega.aero](https://www.cloudbasega.aero). Static HTML/CSS/JS —
no framework, no build step. Open `index.html` or serve the folder with any web server:

```sh
python3 -m http.server 8000
```

## Pages

| Page | Purpose |
|---|---|
| `index.html` | Home — value proposition, how it works, stats, clients, testimonials |
| `autolog.html` | The AutoLog flight data recorder — how it works, tech specs, compliance |
| `platform.html` | Online Platform — bookings, eTechLog, invoicing, student records, movements |
| `pricing.html` | Costs & savings — pricing model, promises, interactive savings calculator |
| `clients.html` | Who we serve, testimonials, client logos |
| `faqs.html` | FAQ accordions grouped by topic |
| `order-form.html` | Order form — contact/billing details, up to 3 aircraft with per-aircraft activity option, GBP/EUR/USD |
| `contact.html` | Enquiry form and contact details |
| `404.html` | Not-found page (served automatically by GitHub Pages) |

## Preview deployment

The site deploys to GitHub Pages from the `main` branch (root folder) for
feedback before full deployment. Every push to `main` redeploys automatically.
No build step is needed. Canonical URLs point at `www.cloudbasega.aero`, so
the preview won't compete with the live site in search engines.

## Forms

Both forms validate inline, carry a honeypot spam trap and show success/error
states. Submission has two modes:

- **Default (current)**: opens the visitor's own mail client, pre-addressed to
  info@cloudbasega.com, cc ben@cloudbasega.com, with the correct subject line.
  Nothing sends without the visitor pressing send in their mail app.
- **Server-side**: deploy the Cloudflare Worker in [`worker/`](worker/README.md)
  (one command plus a Resend API key), then set `CONTACT_ENDPOINT`
  (contact.html) and `ORDER_ENDPOINT` (order-form.html) to its URL. Submissions
  are then emailed to info@ and ben@ directly — the order form with a PDF
  summary attached, in the same layout as the old Wix export.

Email subjects: contact form `"<Name> - CloudBaseGA Contact Form got a new
submission"`, order form `"AutoLog Order Form got a new submission"`.

## SEO

- Unique `<title>` and meta description per page; canonical URLs pointing at
  `https://www.cloudbasega.aero/`
- Open Graph + Twitter card tags on every page (shared AutoLog product image)
- Structured data (JSON-LD): Organization + WebSite on the homepage, Product
  on the AutoLog page, FAQPage (all 19 Q&As) on the FAQs page
- `sitemap.xml` and `robots.txt` at the root
- Semantic headings, descriptive alt text, self-hosted preloaded fonts,
  compressed images, `lang="en-GB"`

## Design system

Brand tokens live in `css/style.css` `:root`, taken from the CloudBaseGA brand guidelines
and the new web app's design system (`CloudBaseGA-web-app/cloudbasega`):

- **Brand blue** `#0057e1` (hover `#0047c1`), tints `#e8f0ff` / `#eef4ff` / `#f1f6ff`
- **Neutrals** — cool slate ramp (`#f5f8fc` page-alt … `#0f172a` text)
- **Type** — Sofia Sans (self-hosted substitute for the licensed Sofia Pro brand face);
  monospace for registrations, times and figures, per aviation convention
- **Style** — light theme only, flat fills, 14px card radius, restrained shadows, no emoji

Logos in `assets/brand/` are copied from the web app repo (`apps/web/src/assets/brand/`,
sourced from `Marketing/Logo Resources/HQ5`). Client logos and product photography in
`assets/img/` were pulled from the existing live site.

The platform page's calendar, tech log and invoicing screens (desktop and mobile)
are REAL screenshots of the web app rendered with demonstration data, captured by
`apps/web/e2e/marketing-screenshots.spec.ts` in the CloudBaseGA-web-app repo
(it drives the app against the e2e mock API — no real backend or login). To
regenerate after UI changes:

    cd CloudBaseGA-web-app/cloudbasega/apps/web
    npx playwright test e2e/marketing-screenshots.spec.ts --project=chromium

The training/student-records screen remains an HTML/CSS mockup (`.app-mock` in
`css/style.css`), captioned as a product illustration, until that module ships
in the new frontend. The stylesheet and `js/main.js` links carry a `?v=N`
cache-buster; bump it when editing those files.

## Launch checklist (moving to cloudbasega.aero)

- [ ] Deploy the forms worker and set the two endpoint constants (see above)
- [ ] Point the domain at the new host and set up HTTPS
- [ ] 301-redirect old Wix paths (e.g. `/order-form`, `/faqs`) to the new pages
- [ ] Migrate the Terms & Conditions / Privacy Policy / Terms of Use content into
      local pages (footer links currently point at the live Wix URLs)
- [ ] Verify the property in Google Search Console and submit `sitemap.xml`
- [ ] The savings calculator is deliberately an admin-time estimate, not a price
      quote — published pricing remains enquiry-based, matching current policy
