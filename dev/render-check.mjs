#!/usr/bin/env node
// dev/render-check.mjs
// Checks index.html against content/plan.json: every block id appears exactly
// once as data-block, every stance id exactly once as data-stance, nothing
// extra, and the page contract the review layer relies on is present.
// Run: node dev/render-check.mjs   (exit code 1 on any failure)

import { readFileSync } from "node:fs";
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
// every mount is empty and carries a title
for (const m of html.matchAll(/<div class="stance" data-stance="([^"]+)" data-stance-title="([^"]*)"><\/div>/g)) {
  if (!m[2].trim()) fail(`stance "${m[1]}" has an empty data-stance-title`);
}
const mountCount = (html.match(/<div class="stance"/g) || []).length;
const wellFormed = (html.match(/<div class="stance" data-stance="[^"]+" data-stance-title="[^"]*"><\/div>/g) || []).length;
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
    const ids = b.type === "ul" ? b.items.map((i) => i.id) : [b.id];
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
once('<script defer src="assets/config.js"></script>', "config.js script tag");
once('<script defer src="assets/review.js"></script>', "review.js script tag");
if (!/assets\/config\.js"><\/script>\s*<script defer src="assets\/review\.js"/.test(html)) fail("config.js must load before review.js");
if (!/<\/script>\s*<\/body>\s*<\/html>\s*$/.test(html)) fail("scripts are not at the end of body");
once('<link rel="stylesheet" href="assets/site.css">', "site.css link");
once('<link rel="stylesheet" href="assets/review.css">', "review.css link");
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
    const items = b.type === "ul" ? b.items.map((i) => i.html) : [b.html, b.text, b.fit, b.deliverable, b.risk, b.when, b.title, b.caption, b.cite].filter(Boolean);
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

// ---- z-index under 50 in site.css
const css = readFileSync(path.join(root, "assets", "site.css"), "utf8");
for (const m of css.matchAll(/z-index:\s*(-?\d+)/g)) if (Number(m[1]) >= 50) fail(`site.css z-index ${m[1]} is not under 50`);
for (const tok of ["--paper", "--paper-2", "--ink", "--ink-soft", "--line", "--riso-blue", "--riso-pink", "--sunflower", "--moss", "--mark", "--mark-hot", "--shadow", "--font-display", "--font-body", "--font-mono"]) {
  const n = (css.match(new RegExp(`${tok.replace(/-/g, "\\-")}:`, "g")) || []).length;
  const want = tok.startsWith("--font") ? 1 : 3;
  if (n < want) fail(`token ${tok} declared ${n} times in site.css (want ${want}: root + two dark blocks)`);
}

// ---- report
notes.push(`${blockIds.length} block ids in plan.json, ${foundBlocks.size} distinct data-block ids on the page`);
notes.push(`${stances.length} stance ids in plan.json, ${foundStances.size} distinct data-stance ids on the page`);
notes.push(`${plan.sections.length} sections, ${copyChecked} copy fields checked verbatim, ${levels.length} headings in order`);
for (const n of notes) console.log("  " + n);
if (failures.length) {
  console.error(`\nFAIL (${failures.length}):`);
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("\nOK: index.html matches plan.json and the review-layer page contract.");
