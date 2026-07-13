# CloudBaseGA forms worker

A single-file Cloudflare Worker (no dependencies, no build step) that receives
submissions from the contact and order forms and emails them to
**info@cloudbasega.com** and **ben@cloudbasega.com** via [Resend](https://resend.com).

| Route      | Form                    | Email subject                                          | Attachment |
|------------|-------------------------|--------------------------------------------------------|------------|
| `/contact` | contact.html            | `<Name> - CloudBaseGA Contact Form got a new submission` | none      |
| `/order`   | order-form.html         | `AutoLog Order Form got a new submission`              | PDF summary of the submission (same layout as the old Wix export) |

Both routes honour the honeypot field, validate required fields, and set
`Reply-To` to the visitor's email so replying goes to the customer.

## One-time setup

1. **Resend**: create an account at resend.com, add and verify the
   `cloudbasega.com` domain (a few DNS records), and create an API key.
2. **Deploy the worker** (needs a free Cloudflare account):

   ```sh
   cd worker
   npx wrangler deploy
   npx wrangler secret put RESEND_API_KEY   # paste the Resend key when prompted
   ```

   Wrangler prints the worker URL, e.g. `https://cloudbasega-forms.<account>.workers.dev`.
3. **Point the site at it**: set the endpoint constants near the bottom of the
   two pages:
   - `contact.html` → `CONTACT_ENDPOINT = "https://<worker-url>/contact"`
   - `order-form.html` → `ORDER_ENDPOINT = "https://<worker-url>/order"`

Until step 3 is done, both forms fall back to opening a pre-addressed email
(to info@, cc ben@, with the correct subjects) in the visitor's own mail app.

Optional: set `MAIL_FROM` / `MAIL_TO` vars in `wrangler.toml` to change sender
or recipients without touching code. For extra spam protection beyond the
honeypot, add Cloudflare Turnstile to the forms later.
