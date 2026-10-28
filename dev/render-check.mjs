#!/usr/bin/env node
// dev/render-check.mjs
// Checks index.html against content/plan.json: every block id appears exactly
// once as data-block, every stance id exactly once as data-stance, nothing
// extra, and the page contract the review layer relies on is present.
// Run: node dev/render-check.mjs   (exit code 1 on any failure)

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plan = JSON.parse(readFileSync(path.join(root, "content", "plan.json"), "utf8"));
const html = readFileSync(path.join(root, "index.html"), "utf8");

const failures = [];
const notes = [];
const fail = (m) => failures.push(m);

// ---- expected ids from the JSON
const blockIds = [];
const stances = [];   // { id, title }
for (const s of plan.sections) {
  for (const b of s.blocks) {
    blockIds.push(b.id);
    if (b.type === "ul") for (const it of b.items) blockIds.push(it.id);
    if (b.type === "design") for (const o of b.options) {
      blockIds.push(o.id);
      stances.push({ id: o.stance, owner: o.id, design: true });
    }
    if (b.stance && !(b.type === "idea" && b.leaveAlone)) stances.push({ id: b.stance, owner: b.id });
  }
}

// ---- counts in the HTML
const count = (re) => {
  const m = new Map();
  for (const x of html.matchAll(re)) m.set(x[1], (m.get(x[1]) || 0) + 1);
  return m;
};
const foundBlocks = count(/data-block="([^"]+)"/g);
const foundStances = count(/data-stance="([^"]+)"/g);

for (const id of blockIds) {
  const n = foundBlocks.get(id) || 0;
  if (n !== 1) fail(`block "${id}" appears ${n} times as data-block (want 1)`);
}
for (const id of foundBlocks.keys()) {
  if (!blockIds.includes(id)) fail(`data-block "${id}" is in the HTML but not in plan.json`);
}
const dupBlocks = blockIds.filter((id, i) => blockIds.indexOf(id) !== i);
if (dupBlocks.length) fail(`plan.json itself repeats block ids: ${dupBlocks.join(", ")}`);

for (const { id } of stances) {
  const n = foundStances.get(id) || 0;
  if (n !== 1) fail(`stance "${id}" appears ${n} times as data-stance (want 1)`);
}
for (const id of foundStances.keys()) {
  if (!stances.some((s) => s.id === id)) fail(`data-stance "${id}" is in the HTML but not in plan.json`);
}
// leave-alone ideas must not get a mount
for (const s of plan.sections) for (const b of s.blocks) {
  if (b.type === "idea" && b.leaveAlone && foundStances.has(b.stance)) fail(`leave-alone idea ${b.id} has a stance mount`);
}
// every mount is empty and carries a title; design mounts also carry their labels
const DESIGN_LABELS = "Love it|Maybe|Not this";
const MOUNT_RE = /<div class="stance" data-stance="([^"]+)" data-stance-title="([^"]*)"(?: data-stance-labels="([^"]*)")?><\/div>/g;
for (const m of html.matchAll(MOUNT_RE)) {
  if (!m[2].trim()) fail(`stance "${m[1]}" has an empty data-stance-title`);
  const isDesign = stances.some((s) => s.id === m[1] && s.design);
  if (isDesign && m[3] !== DESIGN_LABELS) fail(`design stance "${m[1]}" needs data-stance-labels="${DESIGN_LABELS}"`);
  if (!isDesign && m[3] !== undefined) fail(`stance "${m[1]}" carries data-stance-labels but is not a design option`);
  if (m[3] !== undefined && m[3].split("|").length !== 3) fail(`stance "${m[1]}" labels must be three, pipe-separated`);
}
for (const s of stances) if (s.id.length > 80) fail(`stance id "${s.id}" is longer than 80 chars`);
const mountCount = (html.match(/<div class="stance"/g) || []).length;
const wellFormed = (html.match(MOUNT_RE) || []).length;
if (mountCount !== wellFormed) fail(`${mountCount - wellFormed} stance mount(s) are not empty divs with both attributes`);

// ---- sections
for (const s of plan.sections) {
  const plain = s.title.replace(/<[^>]+>/g, "");
  const re = new RegExp(`<section id="${s.id}" data-section-title="([^"]*)"`);
  const m = html.match(re);
  if (!m) fail(`section "${s.id}" missing or missing data-section-title`);
  else if (m[1] !== plain) fail(`section "${s.id}" title is "${m[1]}", want "${plain}"`);
  if (!new RegExp(`<section id="${s.id}"[^>]*class="sec sec-${s.kind}`).test(html)) fail(`section "${s.id}" lacks class sec-${s.kind}`);
}
const sectionIds = [...html.matchAll(/<section\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
const extraSections = sectionIds.filter((id) => !plan.sections.some((s) => s.id === id));
if (extraSections.length) fail(`sections with ids not in plan.json: ${extraSections.join(", ")}`);

// ---- blocks must live inside their section
for (const s of plan.sections) {
  const start = html.indexOf(`<section id="${s.id}"`);
  const end = html.indexOf("</section>", start);
  const slice = html.slice(start, end);
  for (const b of s.blocks) {
    const ids = b.type === "ul" ? b.items.map((i) => i.id) : b.type === "design" ? [b.id, ...b.options.map((o) => o.id)] : [b.id];
    for (const id of ids) if (!slice.includes(`data-block="${id}"`)) fail(`block "${id}" is not inside <section id="${s.id}">`);
  }
}

// ---- mounts, scripts, head, nav
const once = (needle, label) => {
  const n = html.split(needle).length - 1;
  if (n !== 1) fail(`${label}: found ${n} times (want 1)`);
};
once('<div id="review-identity"></div>', "#review-identity mount");
once('<div id="review-reviewers"></div>', "#review-reviewers mount");
once('id="review-tutorial"', "#review-tutorial mount");
once('<div id="review-general"></div>', "#review-general mount");
// ---- build stamp: <meta name="sc-build">, ?v= on every asset, version.json
const STAMP_FILES = [
  "content/plan.json", "dev/build-page.mjs", "assets/site.css", "assets/review.css", "assets/review.js", "assets/config.js",
  "dev/phone/kit.mjs", "dev/phone/frame.mjs", "dev/phone/screens-look.mjs", "dev/phone/screens-map.mjs", "dev/phone/screens-social.mjs",
];
const BUILD_NOW = createHash("sha256")
  .update(Buffer.concat(STAMP_FILES.map((f) => readFileSync(path.join(root, f)))))
  .digest("hex")
  .slice(0, 10);
const metaBuild = (html.match(/<meta name="sc-build" content="([0-9a-f]{10})">/) || [])[1];
if (!metaBuild) fail('<meta name="sc-build" content="<10 hex>"> missing from <head>');
else if (html.indexOf('name="sc-build"') > html.indexOf("</head>")) fail("sc-build meta must be in <head>");
let fileBuild = null;
const versionPath = path.join(root, "version.json");
if (!existsSync(versionPath)) fail("version.json is missing (run node dev/build-page.mjs)");
else {
  try {
    const vj = JSON.parse(readFileSync(versionPath, "utf8"));
    fileBuild = vj.build;
    if (Object.keys(vj).length !== 1 || typeof vj.build !== "string") fail('version.json must be exactly {"build":"<hash>"}');
  } catch (err) { fail(`version.json is not valid JSON: ${err.message}`); }
}
if (fileBuild && metaBuild && fileBuild !== metaBuild) fail(`version.json build ${fileBuild} differs from the page's sc-build ${metaBuild}`);
if (metaBuild && metaBuild !== BUILD_NOW) fail(`stale build: index.html says ${metaBuild}, the sources now hash to ${BUILD_NOW} (run node dev/build-page.mjs)`);
const B = metaBuild || BUILD_NOW;
once(`<script defer src="assets/config.js?v=${B}"></script>`, "config.js script tag with ?v=");
once(`<script defer src="assets/review.js?v=${B}"></script>`, "review.js script tag with ?v=");
if (!new RegExp(`assets/config\\.js\\?v=${B}"><\\/script>\\s*<script defer src="assets/review\\.js`).test(html)) fail("config.js must load before review.js");
if (!/<\/script>\s*<\/body>\s*<\/html>\s*$/.test(html)) fail("scripts are not at the end of body");
once(`<link rel="stylesheet" href="assets/site.css?v=${B}">`, "site.css link with ?v=");
once(`<link rel="stylesheet" href="assets/review.css?v=${B}">`, "review.css link with ?v=");
for (const m of html.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)) {
  if (!m[1].endsWith(`?v=${B}`)) fail(`asset URL without the build stamp: ${m[1]}`);
}
if (html.indexOf('assets/site.css') > html.indexOf('assets/review.css')) fail("site.css must come before review.css");
if (!/<html lang="en">/.test(html)) fail("html lang=en missing");
if (!/<meta charset="utf-8">/.test(html)) fail("charset missing");
if (!/viewport-fit=cover/.test(html)) fail("viewport-fit=cover missing");
if (!/<meta name="robots" content="noindex, nofollow">/.test(html)) fail("robots meta missing");
if (!/<title>The Secret Cloud<\/title>/.test(html)) fail("title missing");
if (!/fonts\.googleapis\.com\/css2\?[^"]*display=swap/.test(html)) fail("Google Fonts link missing display=swap");
if (!/<nav class="bar-nav" aria-label="Sections">/.test(html)) fail("nav aria-label missing");
for (const n of plan.nav) if (!html.includes(`<a href="#${n.id}">${n.label}</a>`)) fail(`nav link for ${n.id} missing`);
if (!/id="review-identity"/.test(html.slice(0, html.indexOf("<main")))) fail("#review-identity must be in the sticky bar before main");
const marksStart = html.indexOf('<section id="marks"');
const marksEnd = html.indexOf("</section>", marksStart);
const marksSlice = html.slice(marksStart, marksEnd);
const order = ['data-block="marks-p-1"', 'id="review-reviewers"', 'id="review-tutorial"', 'id="review-general"'].map((s) => marksSlice.indexOf(s));
if (order.some((i) => i < 0) || order.some((v, i) => i && v < order[i - 1])) fail("marks section order must be p, reviewers, tutorial, general");

// ---- heading order (h1 once, no level skipped)
const levels = [...html.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
if (levels.filter((l) => l === 1).length !== 1) fail(`expected one h1, found ${levels.filter((l) => l === 1).length}`);
for (let i = 1; i < levels.length; i++) if (levels[i] > levels[i - 1] + 1) fail(`heading level skips from h${levels[i - 1]} to h${levels[i]} at heading #${i + 1}`);

// ---- copy fidelity: every html/text field appears verbatim
let copyChecked = 0;
for (const s of plan.sections) {
  for (const b of s.blocks) {
    const items = b.type === "ul" ? b.items.map((i) => i.html)
      : b.type === "design" ? [b.eyebrow, b.title, b.html, ...b.options.flatMap((o) => [o.name, o.html])]
      : [b.html, b.text, b.fit, b.deliverable, b.risk, b.when, b.title, b.caption, b.cite].filter(Boolean);
    for (const raw of items) {
      const needle = b.type === "p" || b.type === "ul" || b.type === "quote" || b.type === "callout" || b.type === "question" || b.type === "idea" || b.type === "phase"
        ? raw : raw;
      // text-only fields are HTML-escaped on the page; html fields are inserted raw
      const escaped = String(raw).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      if (!html.includes(needle) && !html.includes(escaped)) fail(`copy for block "${b.id}" not found verbatim: ${String(raw).slice(0, 60)}...`);
      copyChecked++;
    }
  }
}
for (const key of ["tagline", "dek", "about"]) {
  if (!html.includes(plan.meta[key])) fail(`meta.${key} not on the page verbatim`);
}

// ---- design calls: card and option anchors, previews, jump links
const moodKeys = new Set();
for (const s of plan.sections) for (const b of s.blocks) {
  if (b.type !== "design") continue;
  if (!/^[a-z]+$/.test(b.call)) fail(`design call "${b.id}" needs a lowercase "call" key`);
  if (b.options.length < 3 || b.options.length > 4) fail(`design call "${b.id}" has ${b.options.length} options (want 3 or 4)`);
  if (!new RegExp(`<aside class="design" id="${b.id}" data-block="${b.id}"`).test(html)) fail(`design call "${b.id}" card is missing its id and data-block`);
  for (const o of b.options) {
    if (o.stance !== `design-${b.call}-${o.key}`) fail(`design option "${o.id}" stance should be design-${b.call}-${o.key}, is ${o.stance}`);
    if (!html.includes(`<div class="design-opt-text" data-block="${o.id}">`)) fail(`design option "${o.id}" text block missing`);
    if (o.mood) {
      moodKeys.add(o.mood);
      const n = html.split(`<button type="button" class="design-try" data-mood="${o.mood}">Try it on the page</button>`).length - 1;
      if (n !== 1) fail(`Try it button for mood "${o.mood}" found ${n} times (want 1)`);
    }
  }
}
for (const m of html.matchAll(/data-mood="([^"]+)"/g)) if (!moodKeys.has(m[1])) fail(`data-mood "${m[1]}" is not a mood any design option offers`);
for (const id of [...html.matchAll(/<a href="#([^"]+)"/g)].map((m) => m[1])) {
  if (!new RegExp(`\\bid="${id}"`).test(html)) fail(`link to #${id} has no target`);
}
// ---- plan contents nav: one landmark, every section and subsection linked in
// page order, every link lands on exactly one element, one tick per link
const reEscId = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SUB_TYPES = new Set(["h3", "design", "phase", "idea", "question"]);
const navWant = plan.sections.flatMap((s) => [s.id, ...s.blocks.filter((b) => SUB_TYPES.has(b.type)).map((b) => b.id)]);
const pnavOpen = '<nav class="pnav" id="pnav" aria-label="Plan contents">';
once(pnavOpen, "plan contents nav landmark");
const pnavAt = html.indexOf(pnavOpen);
let pnavLinks = [];
if (pnavAt > -1) {
  const pnavHtml = html.slice(pnavAt, html.indexOf("</nav>", pnavAt));
  pnavLinks = [...pnavHtml.matchAll(/<a class="pnav-link[^"]*" href="#([^"]+)"/g)].map((m) => m[1]);
  for (const id of pnavLinks) {
    const n = (html.match(new RegExp(`\\sid="${reEscId(id)}"`, "g")) || []).length;
    if (n !== 1) fail(`contents link #${id} has ${n} targets (want exactly 1)`);
  }
  if (pnavLinks.join(" ") !== navWant.join(" ")) {
    const missing = navWant.filter((id) => !pnavLinks.includes(id));
    const extra = pnavLinks.filter((id) => !navWant.includes(id));
    fail(`contents nav links differ from plan order${missing.length ? `; missing ${missing.join(", ")}` : ""}${extra.length ? `; extra ${extra.join(", ")}` : ""}`);
  }
  const ticks = [...pnavHtml.matchAll(/<span class="pnav-tick [^"]*" data-for="([^"]+)"><\/span>/g)].map((m) => m[1]);
  if (ticks.join(" ") !== navWant.join(" ")) fail("contents nav timeline ticks do not match its links one for one");
  if (!/<button type="button" class="pnav-toggle" id="pnav-toggle" aria-expanded="false" aria-controls="pnav-panel">/.test(pnavHtml)) fail("contents toggle needs aria-expanded and aria-controls=pnav-panel");
  if (!/<div class="pnav-panel" id="pnav-panel">/.test(pnavHtml)) fail("contents panel #pnav-panel missing");
  if (/<h[1-6]\b/.test(pnavHtml)) fail("the contents nav must not add headings to the outline");
}
once('<div class="mood-chip" id="mood-chip" hidden>', "mood preview chip");
if (!html.includes("Back to the original")) fail("mood chip lacks Back to the original");
once('<button type="button" class="mood-scheme-btn" data-scheme="light" aria-pressed="false">Light</button>', "chip Light switch");
once('<button type="button" class="mood-scheme-btn" data-scheme="dark" aria-pressed="false">Dark</button>', "chip Dark switch");
if (!/sessionStorage\.getItem\("sc\.theme"\)/.test(html.slice(0, html.indexOf("</head>")))) fail("the head script must re-apply the remembered Light / Dark choice");

// ---- phone mockups: every design option shows a light and a dark phone
const LOOK_PAL = { riso: "riso", "night-walk": "night", "field-kit": "field", "kingdom-glass": "glass" };
let phonePairs = 0;
for (const s of plan.sections) for (const b of s.blocks) {
  if (b.type !== "design") continue;
  const cardStart = html.indexOf(`<aside class="design" id="${b.id}"`);
  const cardEnd = html.indexOf("</aside>", cardStart);
  const opts = html.slice(cardStart, cardEnd).split('<div class="design-opt">').slice(1);
  if (opts.length !== b.options.length) { fail(`design call "${b.id}" renders ${opts.length} options (want ${b.options.length})`); continue; }
  b.options.forEach((o, i) => {
    const chunk = opts[i];
    const pairAt = chunk.indexOf('<div class="phone-pair" role="img" aria-label="');
    if (pairAt < 0 || pairAt > chunk.indexOf('<div class="design-opt-text"')) { fail(`design option "${o.id}" has no phone pair before its text`); return; }
    phonePairs++;
    const phones = [...chunk.matchAll(/<svg class="ph ph-(light|dark) ([a-z-]+)"/g)].map((m) => [m[1], m[2]]);
    if (phones.length !== 2 || phones[0][0] !== "light" || phones[1][0] !== "dark") fail(`design option "${o.id}" needs a light phone then a dark phone, has ${phones.map((p) => p[0]).join(", ") || "none"}`);
    const caps = [...chunk.matchAll(/<span class="phone-cap">([^<]*)<\/span>/g)].map((m) => m[1]);
    if (caps.join("|") !== "Light|Dark") fail(`design option "${o.id}" phone captions are "${caps.join("|")}" (want Light|Dark)`);
    const want = b.call === "look" ? (sch) => `ph-pal-${LOOK_PAL[o.key]}-${sch[0]}` : () => "ph-follow";
    for (const [sch, cls] of phones) if (cls !== want(sch)) fail(`design option "${o.id}" ${sch} phone has class ${cls} (want ${want(sch)})`);
  });
}
if (html.includes("phone-gallery")) fail("the published page must not link to dev/phone-gallery.html");
if (!existsSync(path.join(root, "dev", "phone-gallery.html"))) fail("dev/phone-gallery.html is missing (run node dev/build-page.mjs)");

// ---- diagrams: viewBox + width=100%
for (const m of html.matchAll(/<svg\b([^>]*)>/g)) {
  const attrs = m[1];
  if (/class="(defs|rings-orn|tl-line|tl-pin)"/.test(attrs) || /<use href="#rings-sym"/.test(html.slice(m.index, m.index + 120)) && !/viewBox/.test(attrs)) continue;
  if (!/viewBox="/.test(attrs)) fail(`an <svg> lacks a viewBox: ${attrs.slice(0, 60)}`);
  if (/role="img"/.test(attrs) && !/width="100%"/.test(attrs)) fail(`a diagram <svg> lacks width="100%": ${attrs.slice(0, 60)}`);
}
// every symbol referenced exists
const symbols = new Set([...html.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));
for (const m of html.matchAll(/href="#(g-[a-z]+|rings-sym)"/g)) if (!symbols.has(m[1])) fail(`<use> references missing symbol #${m[1]}`);
for (const m of html.matchAll(/url\(#([^)]+)\)/g)) if (!new RegExp(`id="${m[1]}"`).test(html)) fail(`url(#${m[1]}) has no target`);

// ---- z-index under 50 in site.css
const css = readFileSync(path.join(root, "assets", "site.css"), "utf8");
for (const m of css.matchAll(/z-index:\s*(-?\d+)/g)) if (Number(m[1]) >= 50) fail(`site.css z-index ${m[1]} is not under 50`);
// every mood a button offers (riso is the base palette) has a light token set,
// a dark set for the dark system theme, and a dark set for the Light / Dark switch
const MOOD_TOKENS = ["color-scheme", "--paper", "--paper-2", "--ink", "--ink-soft", "--line", "--riso-blue", "--riso-pink", "--sunflower", "--moss", "--mark", "--mark-hot", "--shadow"];
const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
for (const k of moodKeys) {
  if (k === "riso") continue;
  const variants = [
    ["light", `:root[data-mood="${k}"] {`, "light"],
    ["dark (system)", `:root[data-mood="${k}"]:not([data-theme="light"]) {`, "dark"],
    ["dark (switch)", `:root[data-mood="${k}"][data-theme="dark"] {`, "dark"],
  ];
  for (const [label, sel, scheme] of variants) {
    const block = (css.match(new RegExp(`${reEsc(sel)}([^}]*)\\}`)) || [])[1];
    if (!block) { fail(`site.css has no ${label} token set for mood "${k}" (${sel})`); continue; }
    for (const tok of MOOD_TOKENS) if (!new RegExp(`(^|[\\s;])${tok}:`).test(block)) fail(`mood "${k}" ${label} does not set ${tok}`);
    if (!new RegExp(`color-scheme:\\s*${scheme}`).test(block)) fail(`mood "${k}" ${label} must set color-scheme: ${scheme}`);
  }
  const media = css.indexOf(`:root[data-mood="${k}"]:not([data-theme="light"]) {`);
  if (media > -1 && css.lastIndexOf("@media (prefers-color-scheme: dark)", media) < css.lastIndexOf("}\n}", media)) fail(`mood "${k}" system-dark set is not inside @media (prefers-color-scheme: dark)`);
}

// ---- the eight palettes: tokens present, phone classes present, contrast
const PALS = ["riso", "night", "field", "glass"];
const PAL_KEYS = ["bg", "surface", "ink", "soft", "line", "accent", "accent2", "hi", "moss"];
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255].map((c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; })
    .reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
};
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const contrastRows = [];
for (const p of PALS) for (const sch of ["l", "d"]) {
  const v = {};
  for (const k of PAL_KEYS) {
    const m = css.match(new RegExp(`--pal-${p}-${sch}-${k}:\\s*(#[0-9A-Fa-f]{6});`));
    if (!m) fail(`palette token --pal-${p}-${sch}-${k} missing or not a 6-digit hex`);
    else v[k] = m[1];
  }
  if (!css.includes(`.ph-pal-${p}-${sch},`)) fail(`site.css lacks the phone palette class .ph-pal-${p}-${sch}`);
  if (Object.keys(v).length !== PAL_KEYS.length) continue;
  const row = [`${p}-${sch === "l" ? "light" : "dark"}`];
  for (const k of ["ink", "soft", "accent"]) {
    const onBg = ratio(v[k], v.bg), onSurface = ratio(v[k], v.surface);
    row.push(`${k} ${onBg.toFixed(2)}/${onSurface.toFixed(2)}`);
    if (Math.min(onBg, onSurface) < 4.5) fail(`palette ${p}-${sch}: ${k} on bg/surface is ${onBg.toFixed(2)}/${onSurface.toFixed(2)} (want 4.5 or more)`);
  }
  contrastRows.push(row.join("  "));
}

for (const tok of ["--paper", "--paper-2", "--ink", "--ink-soft", "--line", "--riso-blue", "--riso-pink", "--sunflower", "--moss", "--mark", "--mark-hot", "--shadow", "--font-display", "--font-body", "--font-mono"]) {
  const n = (css.match(new RegExp(`${tok.replace(/-/g, "\\-")}:`, "g")) || []).length;
  const want = tok.startsWith("--font") ? 1 : 3;
  if (n < want) fail(`token ${tok} declared ${n} times in site.css (want ${want}: root + two dark blocks)`);
}

// ---- report
notes.push(`${blockIds.length} block ids in plan.json, ${foundBlocks.size} distinct data-block ids on the page`);
notes.push(`${stances.length} stance ids in plan.json, ${foundStances.size} distinct data-stance ids on the page`);
notes.push(`${plan.sections.length} sections, ${copyChecked} copy fields checked verbatim, ${levels.length} headings in order`);
notes.push(`${stances.filter((s) => s.design).length} design stances across ${plan.sections.flatMap((s) => s.blocks).filter((b) => b.type === "design").length} design calls, moods: ${[...moodKeys].join(", ")}`);
notes.push(`${phonePairs} phone pairs (light and dark) on the design options`);
notes.push(`contents nav: ${pnavLinks.length} links (${plan.sections.length} sections, ${pnavLinks.length - plan.sections.length} subsections), every one lands`);
notes.push(`contrast on bg/surface, text needs 4.5:\n      ${contrastRows.join("\n      ")}`);
notes.push(`build ${metaBuild} (sources hash to ${BUILD_NOW}, version.json says ${fileBuild})`);
for (const n of notes) console.log("  " + n);
if (failures.length) {
  console.error(`\nFAIL (${failures.length}):`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("\nOK: index.html matches plan.json and the review-layer page contract.");
