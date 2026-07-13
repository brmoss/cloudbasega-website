/*
 * CloudBaseGA form handler — Cloudflare Worker, no dependencies.
 *
 * Endpoints:
 *   POST /contact  — enquiry form. Subject: "<Name> - CloudBaseGA Contact Form got a new submission"
 *   POST /order    — order form.   Subject: "AutoLog Order Form got a new submission"
 *                    with a PDF summary attached (field/value table, like the old Wix export).
 *
 * Both send to info@cloudbasega.com and ben@cloudbasega.com via the Resend API.
 *
 * Deploy:
 *   cd worker
 *   npx wrangler deploy
 *   npx wrangler secret put RESEND_API_KEY      # from resend.com (verify cloudbasega.com there first)
 *
 * Optional vars (wrangler.toml [vars] or dashboard): MAIL_FROM, MAIL_TO.
 * Then set CONTACT_ENDPOINT / ORDER_ENDPOINT in contact.html and order-form.html
 * to https://<worker-url>/contact and https://<worker-url>/order.
 */

const DEFAULT_TO = ["info@cloudbasega.com", "ben@cloudbasega.com"];
const DEFAULT_FROM = "CloudBaseGA Website <forms@cloudbasega.com>";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "POST") return json({ error: "POST only" }, 405);

    let data;
    try {
      data = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    // Honeypot filled in: claim success, send nothing.
    if (data.website) return json({ ok: true }, 200);

    const path = new URL(request.url).pathname;
    try {
      if (path.endsWith("/contact")) return await handleContact(data, env);
      if (path.endsWith("/order")) return await handleOrder(data, env);
      return json({ error: "Not found" }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: "Sending failed" }, 502);
    }
  },
};

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

const clean = (s) => String(s == null ? "" : s).trim().slice(0, 5000);
const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/* ---------------------------------------------------------------- contact */

async function handleContact(data, env) {
  const first = clean(data.first);
  const last = clean(data.last);
  const email = clean(data.email);
  const country = clean(data.country);
  const message = clean(data.message);

  if (!first || !last || !message || !validEmail(email)) {
    return json({ error: "Missing or invalid fields" }, 400);
  }

  const name = `${first} ${last}`;
  const text = [
    "CloudBaseGA Contact Form got a new submission.",
    "",
    `First name: ${first}`,
    `Last name: ${last}`,
    `Email: ${email}`,
    `Country: ${country || "-"}`,
    "",
    "Message:",
    message,
  ].join("\n");

  await sendEmail(env, {
    subject: `${name} - CloudBaseGA Contact Form got a new submission`,
    text,
    replyTo: email,
  });
  return json({ ok: true }, 200);
}

/* ------------------------------------------------------------------ order */

async function handleOrder(data, env) {
  const first = clean(data.first);
  const last = clean(data.last);
  const email = clean(data.email);
  const address = data.address || {};
  const aircraft = Array.isArray(data.aircraft) ? data.aircraft.slice(0, 3) : [];

  if (!first || !last || !validEmail(email) || !clean(address.line1) || aircraft.length === 0) {
    return json({ error: "Missing or invalid fields" }, 400);
  }

  // Field/value rows, in the same shape as the old Wix submission PDF.
  const rows = [
    ["First name", first],
    ["Last name", last],
    ["Company/Organisation", clean(data.company)],
    ["Phone", clean(data.phone)],
    ["Contact Email", email],
    ["Billing Email", clean(data.billingEmail)],
    ["Billing email is different", data.billingEmail ? "Checked" : "Unchecked"],
    ["Address Line 1", clean(address.line1)],
    ["Address Line 2", clean(address.line2)],
    ["City", clean(address.city)],
    ["Region/State/Province", clean(address.region)],
    ["Post / Zip code", clean(address.postcode)],
    ["Country", clean(address.country)],
    ["Billing currency", clean(data.currency)],
    ["Deliver to a different address", data.altDelivery ? "Checked (see notes)" : "Unchecked"],
  ];
  aircraft.forEach((a, i) => {
    rows.push(
      [`Aircraft ${i + 1} Reg.`, clean(a.reg).toUpperCase()],
      ["Aircraft Type", clean(a.type)],
      ["Aircraft Category", clean(a.category)],
      ["Activity Level", clean(a.activity)]
    );
  });
  rows.push(["Notes", clean(data.notes)], ["I accept terms & conditions", "Checked"]);

  const now = new Date();
  const stamp =
    now.toLocaleDateString("en-GB", { timeZone: "Europe/London" }) +
    ", " +
    now.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });

  const pdfBytes = buildSubmissionPdf("AutoLog Order Form", rows, {
    headerLines: [stamp, "https://www.cloudbasega.aero/order-form.html"],
  });

  const text =
    "AutoLog Order Form got a new submission. The full summary is attached as a PDF.\n\n" +
    rows.map(([k, v]) => `${k}: ${v || "-"}`).join("\n");

  const fileSlug = `${first}_${last}`.toLowerCase().replace(/[^a-z0-9_]+/g, "") || "order";
  await sendEmail(env, {
    subject: "AutoLog Order Form got a new submission",
    text,
    replyTo: email,
    attachments: [{ filename: `autolog_order_${fileSlug}.pdf`, content: toBase64(pdfBytes) }],
  });
  return json({ ok: true }, 200);
}

/* ------------------------------------------------------------------ email */

async function sendEmail(env, { subject, text, replyTo, attachments }) {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY secret is not set");
  const to = env.MAIL_TO ? env.MAIL_TO.split(",").map((s) => s.trim()) : DEFAULT_TO;
  const body = {
    from: env.MAIL_FROM || DEFAULT_FROM,
    to,
    subject,
    text,
    reply_to: replyTo,
  };
  if (attachments) body.attachments = attachments;

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Resend responded ${r.status}: ${await r.text()}`);
}

/* ------------------------------------------------------- PDF construction */
/*
 * Minimal PDF writer producing a field/value summary table in the style of
 * the Wix form-submission export: centred bold title, timestamp and source
 * URL top right, one label/value row per field with a light separator rule.
 * Uses the built-in Helvetica fonts, so no font embedding is needed.
 */

const PAGE_W = 595; // A4 portrait, points
const PAGE_H = 842;
const MARGIN = 56;
const VALUE_X = 226;
const FONT_SIZE = 10;
const LINE_H = 14;
const ROW_PAD = 12;

const LABEL_COLOR = "0.29 0.36 0.47 rg"; // slate blue-grey
const VALUE_COLOR = "0.06 0.09 0.16 rg"; // near-black slate
const RULE_COLOR = "0.89 0.91 0.94 RG";

export function buildSubmissionPdf(title, rows, { headerLines = [] } = {}) {
  const pages = []; // each: array of content-stream commands
  let cmds = [];
  let y = PAGE_H - 46;

  const newPage = () => {
    pages.push(cmds);
    cmds = [];
    y = PAGE_H - 60;
  };

  // Header (first page only): timestamp + source URL, small grey, top right.
  headerLines.forEach((line) => {
    const w = textWidth(line, 8.5);
    cmds.push(text(PAGE_W - MARGIN - w, y, line, "F1", 8.5, "0.45 0.5 0.56 rg"));
    y -= 12;
  });

  // Title, centred bold.
  y -= 26;
  const tw = textWidth(title, 16, true);
  cmds.push(text((PAGE_W - tw) / 2, y, title, "F2", 16, VALUE_COLOR));
  y -= 34;

  const labelWrapAt = 26; // chars, label column
  const valueWrapAt = 58; // chars, value column

  rows.forEach(([label, value]) => {
    const labelLines = wrap(`${label}:`, labelWrapAt);
    const valueLines = wrap(String(value || ""), valueWrapAt);
    const rowLines = Math.max(labelLines.length, valueLines.length, 1);
    const rowH = rowLines * LINE_H + ROW_PAD * 2;

    if (y - rowH < MARGIN) newPage();

    let ly = y - ROW_PAD - FONT_SIZE;
    labelLines.forEach((line) => {
      cmds.push(text(MARGIN, ly, line, "F1", FONT_SIZE, LABEL_COLOR));
      ly -= LINE_H;
    });
    let vy = y - ROW_PAD - FONT_SIZE;
    valueLines.forEach((line) => {
      cmds.push(text(VALUE_X, vy, line, "F1", FONT_SIZE, VALUE_COLOR));
      vy -= LINE_H;
    });

    y -= rowH;
    cmds.push(`${RULE_COLOR} 0.75 w ${MARGIN} ${y.toFixed(1)} m ${PAGE_W - MARGIN} ${y.toFixed(1)} l S`);
  });

  pages.push(cmds);
  return assemblePdf(pages.map((c) => c.join("\n")));
}

function text(x, y, str, font, size, color) {
  return `BT ${color} /${font} ${size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${escapePdf(str)}) Tj ET`;
}

function escapePdf(s) {
  return String(s)
    .replace(/[^\x20-\xFF]/g, "?") // Helvetica/WinAnsi only
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

// Approximate Helvetica width: ~0.5em average per character (0.53 for bold).
function textWidth(s, size, bold) {
  return s.length * size * (bold ? 0.53 : 0.5);
}

function wrap(s, maxChars) {
  const out = [];
  for (const rawLine of String(s).split(/\r?\n/)) {
    let line = "";
    for (const word of rawLine.split(/\s+/)) {
      let w = word;
      while (w.length > maxChars) {
        // Break words longer than a full line (long URLs etc.)
        if (line) { out.push(line); line = ""; }
        out.push(w.slice(0, maxChars));
        w = w.slice(maxChars);
      }
      if (!line) line = w;
      else if ((line + " " + w).length <= maxChars) line += (w ? " " + w : "");
      else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out.length ? out : [""];
}

function assemblePdf(contentStreams) {
  // Objects: 1 catalog, 2 pages tree, 3 Helvetica, 4 Helvetica-Bold,
  // then alternating page/content pairs starting at 5.
  const objects = [];
  const pageObjNums = contentStreams.map((_, i) => 5 + i * 2);

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${contentStreams.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

  contentStreams.forEach((stream, i) => {
    const pageNum = 5 + i * 2;
    objects[pageNum] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageNum + 1} 0 R >>`;
    objects[pageNum + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  let pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [];
  for (let n = 1; n < objects.length; n++) {
    offsets[n] = pdf.length;
    pdf += `${n} 0 obj\n${objects[n]}\nendobj\n`;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let n = 1; n < objects.length; n++) {
    pdf += String(offsets[n]).padStart(10, "0") + " 00000 n \n";
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}

function toBase64(bytes) {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}
