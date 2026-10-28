#!/usr/bin/env node
// dev/build-page.mjs
// Renders content/plan.json into index.html. Every word of copy comes from the
// JSON; this file holds only structure, microcopy (labels, captions) and the
// hand-drawn diagrams. Run: node dev/build-page.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { phone, resetIds } from "./phone/frame.mjs";
import { listening, MOOD_PALETTE } from "./phone/screens-look.mjs";
import { SCREENS as MAP_SCREENS } from "./phone/screens-map.mjs";
import { SCREENS as SOCIAL_SCREENS } from "./phone/screens-social.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plan = JSON.parse(readFileSync(path.join(root, "content", "plan.json"), "utf8"));

// ---------------------------------------------------------------- build stamp
// BUILD is the first 10 hex chars of sha256 over these files, concatenated in
// this order. It goes in <meta name="sc-build">, on every asset URL as ?v=, and
// in version.json, which open pages poll so they reload after a deploy.
// dev/render-check.mjs recomputes it the same way and fails on a stale build.
const STAMP_FILES = [
  "content/plan.json",
  "dev/build-page.mjs",
  "assets/site.css",
  "assets/review.css",
  "assets/review.js",
  "assets/config.js",
  "dev/phone/kit.mjs",
  "dev/phone/frame.mjs",
  "dev/phone/screens-look.mjs",
  "dev/phone/screens-map.mjs",
  "dev/phone/screens-social.mjs",
];
const BUILD = createHash("sha256")
  .update(Buffer.concat(STAMP_FILES.map((f) => readFileSync(path.join(root, f)))))
  .digest("hex")
  .slice(0, 10);
const v = (url) => `${url}?v=${BUILD}`;

// ---------------------------------------------------------------- helpers

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const strip = (html) => String(html).replace(/<[^>]+>/g, "");
// Attribute text: tags removed and entities decoded, so esc() escapes once.
const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
const plain = (html) => strip(html).replace(/&(?:amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m]);

// Eyebrows that really are stamps (per the brief's list).
const STAMP_EYEBROWS = new Set(["RABBIT TRAIL", "RABBIT TRAILS", "GROUNDED", "EASTER EGG", "DROP 001"]);

// The one h3 after which trail ideas are h4 (the leave-alone group).
const LEAVE_HEADING_ID = "trails-leave-h3";

function longDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  });
}

// A display heading with its pink misregistration layer. The pink copy is a
// real duplicate (not ::before/attr()) so <em> inside the heading lines up.
function misreg(tag, inner, attrs = "") {
  return `<${tag}${attrs} class="display misreg">` +
    `<span class="misreg-pink" aria-hidden="true">${inner}</span>` +
    `<span class="misreg-ink">${inner}</span></${tag}>`;
}

function stance(id, title, labels) {
  const lab = labels ? ` data-stance-labels="${esc(labels)}"` : "";
  return `<div class="stance" data-stance="${esc(id)}" data-stance-title="${esc(title)}"${lab}></div>`;
}

// Design calls vote with their own words; the stored values stay yes|maybe|cut.
const DESIGN_LABELS = "Love it|Maybe|Not this";

// The moods a look option can try on. Each has a light and a dark set in
// site.css and follows the system theme until the chip's Light / Dark switch
// pins one. "riso" is the original palette worn on purpose.
const MOODS = ["riso", "night-walk", "field-kit", "kingdom-glass"];

const SIZE_WORD = { S: "days", M: "weeks", L: "a season" };

// ---------------------------------------------------------------- diagrams

const DIAGRAMS = {
  rings: () => `
<svg viewBox="0 0 640 420" width="100%" role="img" aria-labelledby="dg-rings-t dg-rings-d">
  <title id="dg-rings-t">A drop seen from above</title>
  <desc id="dg-rings-d">Three concentric rings around one point. The outer ring, thirty feet out, is quiet. The inner ring is loud. A dashed walking path comes in from the lower left to the center. Off to the right, a small stone sits inside a much tighter ring, labeled easter egg.</desc>
  <!-- the drop -->
  <circle cx="280" cy="220" r="160" class="d-fill-blue d-blue" stroke-width="2"/>
  <circle cx="280" cy="220" r="76" class="d-fill-pink d-pink" stroke-width="2"/>
  <circle cx="280" cy="220" r="14" fill="none" class="d-ink" stroke-width="1.5"/>
  <circle cx="280" cy="220" r="5" fill="currentColor"/>
  <!-- labels with leaders -->
  <path d="M402 117 L430 86" fill="none" class="d-soft" stroke-width="1" stroke-dasharray="2 3"/>
  <text x="436" y="82" class="d-label">outer ring, 30 ft, quiet</text>
  <path d="M342 264 L378 300" fill="none" class="d-soft" stroke-width="1" stroke-dasharray="2 3"/>
  <text x="384" y="304" class="d-label">inner ring, loud</text>
  <!-- the walk in -->
  <path d="M36 392 C110 392 150 330 200 290 S262 236 280 220" fill="none" class="d-blue" stroke-width="2" stroke-dasharray="5 7" stroke-linecap="round"/>
  <use href="#g-walker" x="24" y="366" width="20" height="26" class="d-c-ink"/>
  <!-- the easter egg -->
  <circle cx="556" cy="318" r="28" class="d-fill-moss d-moss" stroke-width="1.5" stroke-dasharray="3 4"/>
  <use href="#g-stone" x="541" y="309" width="30" height="18" class="d-c-ink"/>
  <text x="556" y="372" class="d-label" text-anchor="middle">easter egg,</text>
  <text x="556" y="388" class="d-label" text-anchor="middle">tight radius</text>
</svg>`,

  "two-sides": () => `
<svg viewBox="0 0 720 400" width="100%" role="img" aria-labelledby="dg-two-t dg-two-d">
  <title id="dg-two-t">Two sides of one thing</title>
  <desc id="dg-two-d">Two overlapping circles. The left one is walk-in soundscapes, with drops, easter eggs and monthly drops around it. The right one is secret shows, with band account, QR invite and reward around it. Where they overlap is the archive.</desc>
  <circle cx="275" cy="200" r="135" class="d-fill-blue d-blue" stroke-width="2"/>
  <circle cx="445" cy="200" r="135" class="d-fill-pink d-pink" stroke-width="2"/>
  <text x="251" y="124" class="d-label d-label-lg" text-anchor="middle">walk-in soundscapes</text>
  <text x="469" y="124" class="d-label d-label-lg" text-anchor="middle">secret shows</text>
  <text x="360" y="204" class="d-label d-label-lg" text-anchor="middle">the archive</text>
  <!-- left side labels -->
  <path d="M134 160 L144 160 M134 200 L138 200 M134 240 L144 240" fill="none" class="d-soft" stroke-width="1"/>
  <text x="128" y="164" class="d-label" text-anchor="end">drops</text>
  <text x="128" y="204" class="d-label" text-anchor="end">easter eggs</text>
  <text x="128" y="244" class="d-label" text-anchor="end">monthly drops</text>
  <!-- right side labels -->
  <path d="M576 160 L586 160 M582 200 L586 200 M576 240 L586 240" fill="none" class="d-soft" stroke-width="1"/>
  <text x="592" y="164" class="d-label">band account</text>
  <text x="592" y="204" class="d-label">QR invite</text>
  <text x="592" y="244" class="d-label">reward</text>
  <!-- a small mark in each circle: rings for the walks, a pin for the shows -->
  <use href="#rings-sym" x="236" y="214" width="30" height="30" class="d-c-blue"/>
  <use href="#g-pin" x="447" y="212" width="16" height="22" class="d-c-pink"/>
</svg>`,

  walk: () => `
<svg viewBox="0 0 760 460" width="100%" role="img" aria-labelledby="dg-walk-t dg-walk-d">
  <title id="dg-walk-t">The walk through the park</title>
  <desc id="dg-walk-d">A simple map of a park. A dashed route leaves the gravel path at a trailhead sign, passes a pad and a hackberry tree, climbs a rise to a star marked the perfect spot, where a violin plays at the rock, and ends at a stone on top of the hill, marked with a pin.</desc>
  <!-- park boundary -->
  <path d="M60 150 C90 70 230 40 350 62 S590 40 660 110 S740 230 700 320 S560 440 400 420 S170 440 90 370 S30 230 60 150 Z" fill="none" class="d-line" stroke-width="1.5" stroke-dasharray="6 6"/>
  <!-- the gravel path -->
  <path d="M40 300 C160 330 260 300 360 330 S560 350 720 290" fill="none" class="d-line" stroke-width="7" stroke-linecap="round"/>
  <!-- the hill -->
  <path d="M440 200 C480 120 640 110 690 200" class="d-fill-moss d-moss" stroke-width="1.5"/>
  <!-- trees -->
  <g class="d-fill-moss-2">
    <circle cx="170" cy="200" r="18"/><circle cx="195" cy="190" r="14"/><circle cx="188" cy="215" r="13"/>
    <circle cx="320" cy="228" r="22"/><circle cx="300" cy="240" r="16"/><circle cx="340" cy="242" r="15"/>
    <circle cx="262" cy="304" r="16"/><circle cx="336" cy="312" r="16"/>
    <circle cx="540" cy="350" r="16"/><circle cx="566" cy="338" r="20"/><circle cx="590" cy="356" r="14"/>
    <circle cx="690" cy="160" r="16"/><circle cx="712" cy="176" r="12"/>
    <circle cx="120" cy="110" r="14"/><circle cx="100" cy="128" r="11"/>
  </g>
  <path d="M320 250 L320 268" fill="none" class="d-moss" stroke-width="2"/>
  <text x="346" y="214" class="d-label">hackberry</text>
  <!-- the pavilion -->
  <path d="M150 120 L170 106 L190 120 Z" class="d-fill-paper d-ink" stroke-width="1.5"/>
  <rect x="154" y="120" width="32" height="16" class="d-fill-paper d-ink" stroke-width="1.5"/>
  <text x="170" y="154" class="d-label" text-anchor="middle">pavilion</text>
  <!-- trailhead sign -->
  <path d="M90 300 L90 318" fill="none" class="d-ink" stroke-width="2"/>
  <rect x="82" y="284" width="16" height="16" class="d-fill-paper d-ink" stroke-width="1.5"/>
  <path d="M86 289.5 H94 M86 293 H94 M86 296.5 H91" fill="none" class="d-ink" stroke-width="1.2" stroke-linecap="round"/>
  <text x="104" y="282" class="d-label">trailhead sign</text>
  <!-- the walk -->
  <path d="M128 318 C190 324 240 318 262 308 S300 268 322 250 S400 212 470 176 S540 134 556 126" fill="none" class="d-blue" stroke-width="2" stroke-dasharray="5 7" stroke-linecap="round"/>
  <use href="#g-walker" x="112" y="296" width="18" height="24" class="d-c-ink"/>
  <use href="#g-walker" x="290" y="282" width="18" height="24" class="d-c-soft d-dim"/>
  <!-- instruments -->
  <use href="#g-pad" x="226" y="252" width="26" height="20" class="d-c-pink"/>
  <text x="258" y="268" class="d-label">pad</text>
  <use href="#g-voice" x="346" y="142" width="28" height="22" class="d-c-pink"/>
  <text x="380" y="158" class="d-label">voice</text>
  <use href="#g-violin" x="624" y="166" width="14" height="24" class="d-c-pink"/>
  <use href="#g-stone" x="616" y="190" width="30" height="18" class="d-c-soft"/>
  <text x="600" y="226" class="d-label">violin, at the rock</text>
  <!-- the perfect spot -->
  <use href="#g-star" x="461" y="167" width="18" height="18" class="d-c-sun"/>
  <text x="470" y="208" class="d-label" text-anchor="middle">the perfect spot</text>
  <!-- the stone, with the pin -->
  <use href="#g-stone" x="547" y="120" width="26" height="16" class="d-c-ink"/>
  <use href="#g-pin" x="547" y="100" width="18" height="25" class="d-c-blue"/>
  <text x="560" y="92" class="d-label" text-anchor="middle">the stone</text>
</svg>`,
};

// Diagrams that start scrolled to their middle when a phone has to scroll them.
const CENTER_START = new Set(["rings", "walk"]);

const CAPTIONS = {
  rings: "A drop seen from above: quiet at the outer ring, loud at the inner, and off to one side an easter egg on a radius tight enough that you have to walk up to it.",
  "two-sides": "Two sides, one thing underneath. Both feed the same regional archive.",
  walk: "The walk as I imagined it: off the gravel path toward the pad, under the hackberry, up the rise to where the mix lines up, then to the stone.",
};

// ---------------------------------------------------------------- design call phones
// Every design option shows the app on a phone, light and dark side by side.
// The look call pins each mood's own palettes so the four compare directly;
// the other calls paint with whatever mood the page is wearing (ph-follow).
// The drawings live in dev/phone/ (see dev/phone/CONTRACT.md).

const SCREENS = { ...MAP_SCREENS, ...SOCIAL_SCREENS };

function screenFor(call, key) {
  if (call === "look") return { screen: listening(key), palette: MOOD_PALETTE[key] };
  const fn = SCREENS[call] && SCREENS[call][key];
  if (typeof fn !== "function") throw new Error(`No phone screen for design option ${call}/${key} (dev/phone/screens-*.mjs)`);
  return { screen: fn, palette: null };
}

function phonePair(call, key, label) {
  const { screen, palette } = screenFor(call, key);
  const one = (scheme) => `<div class="phone-fig">${phone({ scheme, palette, screen })}` +
    `<span class="phone-cap">${scheme === "light" ? "Light" : "Dark"}</span></div>`;
  return `<div class="phone-pair" role="img" aria-label="${esc(label)}">
${one("light")}
${one("dark")}
</div>`;
}

// The little pencil beside every design call's eyebrow.
const PENCIL = `<svg class="design-pencil" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2.5 13.5 L3.4 10.2 L10.9 2.7 A1.3 1.3 0 0 1 12.7 2.7 L13.3 3.3 A1.3 1.3 0 0 1 13.3 5.1 L5.8 12.6 Z M9.8 3.8 L12.2 6.2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`;

function renderDesign(b) {
  const opts = b.options.map((o) => {
    if (o.mood && !MOODS.includes(o.mood)) throw new Error(`Unknown mood "${o.mood}" on ${o.id}`);
    const tryIt = o.mood ? `\n    <button type="button" class="design-try" data-mood="${esc(o.mood)}">Try it on the page</button>` : "";
    return `  <div class="design-opt">
    ${phonePair(b.call, o.key, `${o.name}: the app on a phone, in light and in dark`)}
    <div class="design-opt-text" data-block="${o.id}">
      <h4 class="design-opt-name">${esc(o.name)}</h4>
      <p>${o.html}</p>
    </div>${tryIt}
    ${stance(o.stance, `${b.short}: ${o.name}`, DESIGN_LABELS)}
  </div>`;
  });
  return `<aside class="design" id="${b.id}" data-block="${b.id}" aria-labelledby="${b.id}-title">
  <p class="design-eyebrow">${PENCIL}${esc(b.eyebrow)}</p>
  <h3 class="design-title" id="${b.id}-title">${esc(b.title)}</h3>
  <p class="design-intro">${b.html}</p>
  <div class="design-opts">
${opts.join("\n")}
  </div>
</aside>`;
}

// ---------------------------------------------------------------- blocks

function renderBlock(b, ctx) {
  switch (b.type) {
    case "p":
      return `<p data-block="${b.id}">${b.html}</p>`;

    case "h3": {
      let out = `<h3 id="${b.id}" data-block="${b.id}">${esc(b.text)}</h3>`;
      if (b.stance) out += `\n${stance(b.stance, b.stanceTitle || b.text)}`;
      if (b.id === LEAVE_HEADING_ID) ctx.afterLeaveHeading = true;
      return out;
    }

    case "ul":
      return `<ul class="list${b.style === "jump" ? " list-jump" : ""}" data-block="${b.id}">\n` +
        b.items.map((it) => `  <li data-block="${it.id}">${it.html}</li>`).join("\n") +
        `\n</ul>`;

    case "quote":
      return `<blockquote data-block="${b.id}"><p>${b.html}</p><cite>${esc(b.cite)}</cite></blockquote>`;

    case "callout":
      return `<aside class="callout" data-block="${b.id}"><span class="stamp">${esc(b.stamp)}</span><p>${b.html}</p></aside>`;

    case "diagram":
      return `<figure class="spread diagram" data-block="${b.id}">` +
        `<div class="diagram-inner"${CENTER_START.has(b.name) ? ' data-start="center"' : ""}>${DIAGRAMS[b.name]()}\n</div>` +
        `<figcaption>${esc(CAPTIONS[b.name])}</figcaption></figure>`;

    case "formula":
      return `<figure class="formula" data-block="${b.id}"><pre>${esc(b.text)}</pre><figcaption>${esc(b.caption)}</figcaption></figure>`;

    case "idea": {
      const H = ctx.afterLeaveHeading ? "h4" : "h3";
      const leave = b.leaveAlone;
      const sizeWord = SIZE_WORD[b.size] || "";
      return `<article class="idea${leave ? " idea-leave" : ""}" id="${b.id}" data-block="${b.id}">
  <span class="idea-letter">${esc(b.letter)}</span>
  <div class="idea-main">
    <div class="idea-head">
      <${H} class="idea-title">${esc(b.title)}</${H}>
      <span class="size" title="${esc(b.size)} is ${esc(sizeWord)}"><span class="vh">size </span>${esc(b.size)}</span>${leave ? `\n      <span class="stamp stamp-pink">Leave it</span>` : ""}
    </div>
    <div class="idea-body"><p>${b.html}</p></div>
    <p class="fit"><span class="fit-label">${leave ? "Why I'd leave it" : "Why it fits"}</span>${esc(b.fit)}</p>${leave ? "" : `\n    ${stance(b.stance, `Trail ${b.letter}: ${b.title}`)}`}
  </div>
</article>`;
    }

    case "phase":
      return `<article class="phase" id="${b.id}" data-block="${b.id}">
  <span class="phase-n">${b.n}</span>
  <div class="phase-main">
    <div class="phase-head">
      <h3 class="phase-title">${esc(b.title)}</h3>
      <span class="when">${esc(b.when)}</span>
    </div>
    <div class="phase-body">
      <p>${b.html}</p>
      <dl class="phase-meta">
        <div class="deliverable"><dt>Deliverable</dt><dd>${esc(b.deliverable)}</dd></div>
        <div class="risk"><dt>Risk</dt><dd>${esc(b.risk)}</dd></div>
      </dl>
    </div>
    ${stance(b.stance, `Phase ${b.n}: ${b.title}`)}
  </div>
</article>`;

    case "design":
      return renderDesign(b);

    case "question":
      return `<li class="q" id="${b.id}" data-block="${b.id}">
  <span class="q-n">${String(b.n).padStart(2, "0")}</span>
  <div class="q-main">
    <p class="q-text">${b.html}</p>
    ${stance(b.stance, `Q${b.n}: ${plain(b.html)}`)}
  </div>
</li>`;

    default:
      throw new Error(`Unknown block type "${b.type}" (${b.id})`);
  }
}

// Consecutive ideas, phases and questions get one wrapper each.
const WRAP = {
  idea: ['<div class="ideas">', "</div>"],
  phase: [
    '<div class="phases spread">\n<svg class="tl-line" aria-hidden="true" focusable="false"><line x1="1" y1="0" x2="1" y2="100%" stroke="currentColor" stroke-width="2" stroke-dasharray="1 7" stroke-linecap="round"/></svg>\n<svg class="tl-pin" viewBox="0 0 20 28" aria-hidden="true" focusable="false"><use href="#g-pin"/></svg>',
    "</div>",
  ],
  question: ['<ol class="questions">', "</ol>"],
};

function renderBlocks(section) {
  const ctx = { section, afterLeaveHeading: false };
  const out = [];
  let open = null;
  for (const b of section.blocks) {
    const wrapKind = WRAP[b.type] ? b.type : null;
    if (open && open !== wrapKind) { out.push(WRAP[open][1]); open = null; }
    if (wrapKind && !open) { out.push(WRAP[wrapKind][0]); open = wrapKind; }
    out.push(renderBlock(b, ctx));
  }
  if (open) out.push(WRAP[open][1]);
  return out.join("\n");
}

// ---------------------------------------------------------------- sections

function renderSection(s) {
  const plainTitle = plain(s.title);
  const eyebrow = STAMP_EYEBROWS.has(s.eyebrow)
    ? `<p class="eyebrow"><span class="stamp">${esc(s.eyebrow)}</span></p>`
    : `<p class="eyebrow">${esc(s.eyebrow)}</p>`;
  let out = `<section id="${s.id}" data-section-title="${esc(plainTitle)}" class="sec sec-${s.kind}" aria-labelledby="${s.id}-title">
<header class="opener">
  <svg class="rings-orn" aria-hidden="true" focusable="false"><use href="#rings-sym"/></svg>
  ${eyebrow}
  ${misreg("h2", s.title, ` id="${s.id}-title"`)}
  <p class="dek">${esc(s.dek)}</p>
</header>
${renderBlocks(s)}`;
  if (s.id === "marks") {
    out += `
<div id="review-reviewers"></div>
<div id="review-tutorial" class="spread"></div>
<div id="review-general"></div>`;
  }
  out += `\n</section>`;
  return out;
}

// ---------------------------------------------------------------- page

const meta = plan.meta;
const navItems = plan.nav.map((n) => `<li><a href="#${n.id}">${esc(n.label)}</a></li>`).join("\n        ");

// ---------------------------------------------------------------- plan contents
// The floating contents nav: a rail with a scroll timeline on wide screens, a
// hanging "Contents" tab and a sheet on phones. It is drawn from plan.sections,
// so a new section or subsection shows up on the next build. Subsections are the
// h3 headings, the design calls, the phases, and the trail ideas and questions
// (those two as compact lettered and numbered chips). Every target carries an id
// equal to its data-block id; dev/render-check.mjs checks each link lands.

const NAV_LABEL = Object.fromEntries(plan.nav.map((n) => [n.id, n.label]));
const pad2 = (n) => String(n).padStart(2, "0");
// a question's accessible name: "Question 3: Should a show's reward be ..."
const clip = (text, max) => {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ")) + "…";
};

function navSubs(s) {
  const subs = [];
  for (const b of s.blocks) {
    if (b.type === "h3") subs.push({ id: b.id, kind: "h3", label: b.text, now: b.text });
    else if (b.type === "design") subs.push({ id: b.id, kind: "design", label: b.short, now: `Call: ${b.short}` });
    else if (b.type === "phase") subs.push({ id: b.id, kind: "phase", key: String(b.n), label: b.title, now: `Phase ${b.n}: ${b.title}` });
    else if (b.type === "idea") subs.push({ id: b.id, kind: "chip", leave: !!b.leaveAlone, key: b.letter, label: `Trail ${b.letter}: ${b.title}`, tip: b.title, now: `Trail ${b.letter}: ${b.title}` });
    else if (b.type === "question") {
      const q = plain(b.html);
      subs.push({ id: b.id, kind: "chip", key: pad2(b.n), label: `Question ${b.n}: ${clip(q, 70)}`, tip: q, now: `Question ${b.n}` });
    }
  }
  return subs;
}

const NAV = plan.sections.map((s, i) => ({
  id: s.id,
  n: pad2(i + 1),
  label: NAV_LABEL[s.id] || plain(s.title),
  subs: navSubs(s),
}));

function navSubList(subs) {
  const out = [];
  let chips = null;
  const flush = () => {
    if (!chips) return;
    out.push(`<li class="pnav-chips"><ul class="pnav-chiprow">${chips.join("")}</ul><p class="pnav-chipnow" aria-hidden="true"></p></li>`);
    chips = null;
  };
  for (const x of subs) {
    const now = ` data-now="${esc(x.now)}"`;
    if (x.kind === "chip") {
      chips = chips || [];
      chips.push(`<li><a class="pnav-link pnav-chip${x.leave ? " pnav-chip-leave" : ""}" href="#${x.id}"${now} title="${esc(x.tip)}"><span class="pnav-key" aria-hidden="true">${esc(x.key)}</span><span class="vh">${esc(x.label)}</span></a></li>`);
      continue;
    }
    flush();
    const key = x.kind === "phase" ? `<span class="pnav-key">${esc(x.key)}</span>`
      : x.kind === "design" ? `<span class="pnav-tag">Call</span>` : "";
    out.push(`<li><a class="pnav-link pnav-link-sub pnav-${x.kind}" href="#${x.id}"${now}>${key}<span class="pnav-label">${esc(x.label)}</span></a></li>`);
  }
  flush();
  return out.length ? `\n        <ul class="pnav-subs">\n          ${out.join("\n          ")}\n        </ul>` : "";
}

const CHEVRON = `<svg class="pnav-chev" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2.5 4.5 L6 8 L9.5 4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const PLAN_NAV = `<nav class="pnav" id="pnav" aria-label="Plan contents">
  <div class="pnav-scrim" id="pnav-scrim" hidden></div>
  <button type="button" class="pnav-toggle" id="pnav-toggle" aria-expanded="false" aria-controls="pnav-panel">
    <span class="pnav-toggle-n" aria-hidden="true">00</span>
    <span class="pnav-toggle-text"><span class="pnav-toggle-k">Contents</span><span class="pnav-now"><span class="pnav-now-sec">Start</span><span class="pnav-now-sub"></span></span></span>
    ${CHEVRON}
  </button>
  <div class="pnav-track" aria-hidden="true">
    <span class="pnav-line"></span>
    <span class="pnav-fill"></span>
    ${NAV.flatMap((s) => [`<span class="pnav-tick pnav-tick-sec" data-for="${s.id}"></span>`,
      ...s.subs.map((x) => `<span class="pnav-tick pnav-tick-sub" data-for="${x.id}"></span>`)]).join("\n    ")}
    <span class="pnav-dot"></span>
  </div>
  <div class="pnav-panel" id="pnav-panel">
    <div class="pnav-card">
      <p class="pnav-head"><span>Contents</span><span class="pnav-pct"><span class="pnav-pct-n">0</span>% read</span></p>
      <ol class="pnav-list">
${NAV.map((s) => `        <li class="pnav-sec" data-pnav-sec="${s.id}"><a class="pnav-link pnav-link-sec" href="#${s.id}" data-now="${esc(s.label)}"><span class="pnav-key" aria-hidden="true">${s.n}</span><span class="pnav-label">${esc(s.label)}</span></a>${navSubList(s.subs)}</li>`).join("\n")}
      </ol>
    </div>
  </div>
</nav>`;

const symbols = `<svg class="defs" aria-hidden="true" focusable="false">
  <symbol id="rings-sym" viewBox="0 0 48 48">
    <circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="24" cy="24" r="13" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="24" cy="24" r="3" fill="currentColor"/>
  </symbol>
  <symbol id="g-walker" viewBox="0 0 24 32">
    <circle cx="12" cy="5" r="4" fill="currentColor"/>
    <path d="M12 9 V19 M12 12 L6 17 M12 12 L18 16 M12 19 L7 30 M12 19 L17 30" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  </symbol>
  <symbol id="g-violin" viewBox="0 0 24 40">
    <path d="M12 2 V14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M12 14 C6 14 4 19 7 22 C2 25 3 34 12 36 C21 34 22 25 17 22 C20 19 18 14 12 14 Z" fill="currentColor"/>
  </symbol>
  <symbol id="g-pad" viewBox="0 0 32 24">
    <rect x="1" y="1" width="30" height="22" rx="4" fill="none" stroke="currentColor" stroke-width="2"/>
    <path d="M6 12 Q9 6 12 12 T18 12 T24 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </symbol>
  <symbol id="g-voice" viewBox="0 0 32 24">
    <circle cx="9" cy="12" r="5" fill="currentColor"/>
    <path d="M17 7 A7 7 0 0 1 17 17 M22 3 A12 12 0 0 1 22 21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </symbol>
  <symbol id="g-stone" viewBox="0 0 32 20">
    <path d="M4 16 C1 10 8 3 16 3 C24 3 30 8 28 14 C27 17 22 18 16 18 C10 18 5 18 4 16 Z" fill="currentColor"/>
  </symbol>
  <symbol id="g-star" viewBox="0 0 24 24">
    <path d="M12 1.5 L15.1 8.3 L22.5 9.1 L17 14.1 L18.5 21.4 L12 17.7 L5.5 21.4 L7 14.1 L1.5 9.1 L8.9 8.3 Z" fill="currentColor" class="d-ink" stroke-width="1" stroke-linejoin="round"/>
  </symbol>
  <symbol id="g-pin" viewBox="0 0 20 28">
    <path d="M10 27 C4 18 1 14 1 9.5 A9 9 0 0 1 19 9.5 C19 14 16 18 10 27 Z" fill="currentColor"/>
    <circle cx="10" cy="9.5" r="3.5" class="d-fill-paper"/>
  </symbol>
</svg>`;

const heroRings = `<svg class="hero-rings" viewBox="0 0 320 320" width="100%" role="img" aria-label="Three concentric rings, slowly breathing: a drop seen from above">
  <g class="rings-pink" aria-hidden="true" transform="translate(3 2)">
    <circle class="ring ring-1" cx="160" cy="160" r="150" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <circle class="ring ring-2" cx="160" cy="160" r="100" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <circle class="ring ring-3" cx="160" cy="160" r="52" fill="none" stroke="currentColor" stroke-width="1.5"/>
  </g>
  <g class="rings-ink">
    <circle class="ring ring-1" cx="160" cy="160" r="150" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <circle class="ring ring-2" cx="160" cy="160" r="100" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <circle class="ring ring-3" cx="160" cy="160" r="52" fill="none" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="160" cy="160" r="6" fill="currentColor"/>
  </g>
</svg>`;

// A small page script, inline at the end of body (before config.js). It marks
// which edge of each sideways scroller still has more to show (site.css fades
// that edge), opens the rings and the walk centred on phones, and makes the
// section links glide only for short hops. No dependencies, no innerHTML.
const PAGE_SCRIPT = `(function () {
  "use strict";
  var scrollers = Array.prototype.slice.call(document.querySelectorAll(".bar-nav, .diagram-inner"));
  function edges(el) {
    var max = el.scrollWidth - el.clientWidth;
    var x = el.scrollLeft;
    el.classList.toggle("fits", max <= 1);
    el.classList.toggle("more-l", max > 1 && x > 1);
    el.classList.toggle("more-r", max > 1 && x < max - 1);
  }
  function update() { scrollers.forEach(edges); }
  scrollers.forEach(function (el) {
    if (el.getAttribute("data-start") === "center") el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
    el.addEventListener("scroll", function () { edges(el); }, { passive: true });
  });
  update();
  window.addEventListener("resize", update);
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(update);
    scrollers.forEach(function (el) {
      ro.observe(el);
      if (el.firstElementChild) ro.observe(el.firstElementChild);
    });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(update);

  // One jump for the top bar links and the contents nav: short hops glide,
  // long ones are instant, and the hash changes without a second jump.
  function reduced() { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
  function jumpTo(id) {
    var target = id ? document.getElementById(id) : null;
    if (!target) return false;
    var near = Math.abs(target.getBoundingClientRect().top) < 3 * window.innerHeight;
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    try { target.focus({ preventScroll: true }); } catch (err) { /* focus is a courtesy */ }
    // "auto" is an instant jump: the page sets no scroll-behavior
    target.scrollIntoView({ behavior: near && !reduced() ? "smooth" : "auto", block: "start" });
    if (location.hash !== "#" + id) history.pushState(null, "", location.href.split("#")[0] + "#" + id);
    return true;
  }
  function hashLink(e, box) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
    var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
    return a && box.contains(a) ? a : null;
  }

  var barNav = document.querySelector(".bar-nav");
  if (barNav) {
    barNav.addEventListener("click", function (e) {
      var a = hashLink(e, barNav);
      if (a && jumpTo(a.getAttribute("href").slice(1))) e.preventDefault();
    });
  }

  // ------------------------------------------------------------ plan contents
  // Tracks where the reader is (a requestAnimationFrame-throttled scroll
  // handler over cached positions), fills the timeline, marks the current
  // section and subsection with aria-current here and in the top bar, and runs
  // the rail (hover or focus opens it) and the phone sheet (tap opens it,
  // Escape, the scrim or a jump closes it, page scroll locked meanwhile).
  var pnav = document.getElementById("pnav");
  if (!pnav) return;
  var root = document.documentElement;
  var bar = document.querySelector(".bar");
  var toggle = document.getElementById("pnav-toggle");
  var panel = document.getElementById("pnav-panel");
  var scrim = document.getElementById("pnav-scrim");
  var nowN = pnav.querySelector(".pnav-toggle-n");
  var nowSec = pnav.querySelector(".pnav-now-sec");
  var nowSub = pnav.querySelector(".pnav-now-sub");
  var pct = pnav.querySelector(".pnav-pct-n");
  var wide = window.matchMedia ? window.matchMedia("(min-width: 900px)") : { matches: true };
  var barLinks = {};
  Array.prototype.forEach.call(document.querySelectorAll('.bar-nav a[href^="#"]'), function (a) {
    barLinks[a.getAttribute("href").slice(1)] = a;
  });

  var sections = [];
  var items = [];
  Array.prototype.forEach.call(panel.querySelectorAll(".pnav-sec"), function (li, i) {
    var link = li.querySelector(".pnav-link-sec");
    var id = li.getAttribute("data-pnav-sec");
    var sec = { id: id, n: link.querySelector(".pnav-key").textContent, label: link.getAttribute("data-now"), li: li, link: link, el: document.getElementById(id), subs: [], top: 0 };
    sec.tick = pnav.querySelector('.pnav-tick[data-for="' + id + '"]');
    Array.prototype.forEach.call(li.querySelectorAll(".pnav-subs a.pnav-link"), function (a) {
      var sid = a.getAttribute("href").slice(1);
      var group = a.closest(".pnav-chips");
      sec.subs.push({ id: sid, link: a, now: a.getAttribute("data-now"), el: document.getElementById(sid), top: 0,
        tick: pnav.querySelector('.pnav-tick[data-for="' + sid + '"]'),
        chipNow: group ? group.querySelector(".pnav-chipnow") : null,
        key: (a.querySelector(".pnav-key") || a).textContent,
        tip: a.getAttribute("title") || "" });
    });
    sections.push(sec);
    items.push(sec);
    items = items.concat(sec.subs);
  });
  items = items.filter(function (it) { return !!it.el; });

  var line = 120;
  var maxScroll = 1;
  var cur = { sec: null, sub: null, pct: -1, y: 0, compact: false };

  function measure() {
    var barBottom = bar ? Math.max(0, Math.round(bar.getBoundingClientRect().bottom)) : 0;
    root.style.setProperty("--pnav-top", barBottom + "px");
    var y = window.scrollY || window.pageYOffset || 0;
    items.forEach(function (it) { it.top = it.el.getBoundingClientRect().top + y; });
    maxScroll = Math.max(1, root.scrollHeight - window.innerHeight);
    // the reading line sits a little under where a jump lands a target
    var first = sections.length && sections[0].el;
    var margin = first ? parseFloat(getComputedStyle(first).scrollMarginTop) || 0 : 0;
    // a jump lands a target above this line, and a heading in the top third
    // of the window already counts as here; ticks sit on the same line so the
    // marker crosses each one as it lights up
    line = Math.max(Math.max(barBottom, margin) + 48, Math.round(window.innerHeight * 0.33));
    items.forEach(function (it) {
      if (!it.tick) return;
      var f = Math.min(1, Math.max(0, (it.top - line) / maxScroll));
      it.tick.style.setProperty("--at", f.toFixed(4));
    });
  }

  function mark(link, on) {
    if (on) link.setAttribute("aria-current", "location");
    else link.removeAttribute("aria-current");
  }

  function keepInBar(a) {
    var box = a.closest(".bar-nav");
    if (!box || box.scrollWidth <= box.clientWidth + 1) return;
    var b = box.getBoundingClientRect();
    var r = a.getBoundingClientRect();
    if (r.left < b.left + 24) box.scrollLeft += r.left - b.left - 24;
    else if (r.right > b.right - 24) box.scrollLeft += r.right - b.right + 24;
  }

  function locate() {
    var y = window.scrollY || window.pageYOffset || 0;
    var vh = window.innerHeight;
    var p = Math.min(1, Math.max(0, y / maxScroll));
    var atBottom = y >= maxScroll - 2;
    var probe = y + line;
    var sec = null;
    var sub = null;
    sections.forEach(function (s) {
      if (!s.el) return;
      // at the very bottom a short last section still gets its turn
      if (s.top <= probe || (atBottom && s.top < y + vh - 40)) sec = s;
    });
    if (sec) sec.subs.forEach(function (x) { if (x.el && x.top <= probe) sub = x; });

    pnav.style.setProperty("--p", p.toFixed(4));
    // phones: fold the tab while reading downward past the opening, unfold on the way up
    var compact = cur.compact;
    if (wide.matches || y < (sections[0] && sections[0].top ? sections[0].top - line : vh)) compact = false;
    else if (y > cur.y + 6) compact = true;
    else if (y < cur.y - 6) compact = false;
    if (Math.abs(y - cur.y) > 6 || !compact) cur.y = y;
    if (compact !== cur.compact) { cur.compact = compact; pnav.classList.toggle("is-compact", compact); }
    var whole = Math.round(p * 100);
    if (whole !== cur.pct) { cur.pct = whole; pct.textContent = String(whole); }
    items.forEach(function (it) {
      if (it.tick) it.tick.classList.toggle("is-past", it.top <= probe || (atBottom && it === sec));
    });
    if (sec === cur.sec && sub === cur.sub) return;

    if (cur.sec !== sec) {
      sections.forEach(function (s) {
        var on = s === sec;
        s.li.classList.toggle("is-current", on);
        mark(s.link, on);
        if (s.tick) s.tick.classList.toggle("is-current", on);
        if (barLinks[s.id]) mark(barLinks[s.id], on);
      });
      if (sec && barLinks[sec.id]) keepInBar(barLinks[sec.id]);
      nowN.textContent = sec ? sec.n : "00";
      nowSec.textContent = sec ? sec.label : "Start";
    }
    sections.forEach(function (s) {
      s.subs.forEach(function (x) {
        mark(x.link, x === sub);
        if (x.tick) x.tick.classList.toggle("is-current", x === sub);
        if (x.chipNow && x === sub) x.chipNow.textContent = x.key + " · " + x.tip;
      });
    });
    Array.prototype.forEach.call(panel.querySelectorAll(".pnav-chipnow"), function (el) {
      if (!sub || sub.chipNow !== el) el.textContent = "";
    });
    nowSub.textContent = sub ? sub.now : "";
    cur.sec = sec;
    cur.sub = sub;
  }

  var raf = 0;
  var dirty = true;
  function frame() {
    raf = 0;
    if (dirty) { dirty = false; measure(); }
    locate();
  }
  function schedule(remeasure) {
    if (remeasure) dirty = true;
    if (!raf) raf = window.requestAnimationFrame(frame);
  }
  window.addEventListener("scroll", function () { schedule(false); }, { passive: true });
  window.addEventListener("resize", function () { schedule(true); });
  window.addEventListener("load", function () { schedule(true); });
  if (window.ResizeObserver) {
    var watch = new ResizeObserver(function () { schedule(true); });
    var main = document.getElementById("main");
    if (main) watch.observe(main);
    if (bar) watch.observe(bar);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { schedule(true); });

  // open and closed: hover or focus opens the rail, a press pins or shuts it;
  // on phones only a press opens the sheet
  var st = { hover: false, focus: false, pinned: false, shut: false, left: false };
  var leaveTimer = 0;
  var locked = false;
  function isOpen() {
    if (!wide.matches) return st.pinned;
    return !st.shut && (st.pinned || st.hover || st.focus);
  }
  function lock(on) {
    if (on === locked) return;
    locked = on;
    root.classList.toggle("pnav-lock", on);
  }
  function render() {
    var open = isOpen();
    pnav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    var sheet = open && !wide.matches;
    scrim.hidden = !sheet;
    lock(sheet);
  }
  function close() {
    st.pinned = false;
    st.shut = true;
    render();
  }
  pnav.classList.add("pnav-js");
  toggle.addEventListener("click", function () {
    if (isOpen()) { close(); return; }
    st.pinned = true;
    st.shut = false;
    render();
    if (!wide.matches) {
      var here = panel.querySelector('.pnav-subs a[aria-current]') || panel.querySelector('a[aria-current]');
      var first = here || panel.querySelector("a.pnav-link");
      if (here && here.scrollIntoView) here.scrollIntoView({ block: "center" });
      if (first) { try { first.focus({ preventScroll: true }); } catch (err) { first.focus(); } }
    }
  });
  pnav.addEventListener("mouseenter", function () {
    window.clearTimeout(leaveTimer);
    // back on the rail after leaving it: a press that shut it no longer holds
    if (st.left && !st.focus) st.shut = false;
    st.left = false;
    st.hover = true;
    render();
  });
  pnav.addEventListener("mouseleave", function () {
    window.clearTimeout(leaveTimer);
    st.left = true;
    leaveTimer = window.setTimeout(function () {
      st.hover = false;
      if (!st.focus) st.shut = false;
      render();
    }, 240);
  });
  pnav.addEventListener("focusin", function () {
    // arriving from outside opens it again, even after a press shut it
    if (!st.focus) st.shut = false;
    st.focus = true;
    render();
  });
  pnav.addEventListener("focusout", function () {
    window.setTimeout(function () {
      if (pnav.contains(document.activeElement)) return;
      st.focus = false;
      if (!st.hover) st.shut = false;
      // a phone sheet closes when focus leaves it
      if (!wide.matches) st.pinned = false;
      render();
    }, 0);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || !isOpen()) return;
    var inside = pnav.contains(document.activeElement);
    close();
    if (inside || !wide.matches) toggle.focus();
  });
  scrim.addEventListener("click", close);
  scrim.addEventListener("touchmove", function (e) { e.preventDefault(); }, { passive: false });
  panel.addEventListener("click", function (e) {
    var a = hashLink(e, panel);
    if (!a) return;
    close();
    if (jumpTo(a.getAttribute("href").slice(1))) e.preventDefault();
  });
  function onMode() {
    st.pinned = false;
    st.shut = false;
    st.hover = false;
    render();
    schedule(true);
  }
  if (wide.addEventListener) wide.addEventListener("change", onMode);
  else if (wide.addListener) wide.addListener(onMode);
  render();
  measure();
  locate();
})();`;

// ---------------------------------------------------------------- mood preview
// "Try it on the page" re-themes the whole plan with one of the look options.
// site.css holds a light and a dark token set per mood under html[data-mood];
// this script flips the attribute, shows the chip, and remembers the choice
// for the tab. The chip's Light / Dark switch pins html[data-theme]; until it
// is used, a mood follows the system theme like the original page.

const MOOD_NAMES = {};
for (const s of plan.sections) for (const b of s.blocks) {
  if (b.type === "design") for (const o of b.options) if (o.mood) MOOD_NAMES[o.mood] = o.name;
}
const MOOD_JSON = JSON.stringify({ moods: MOODS, names: MOOD_NAMES });

// In <head>, before first paint, so a remembered mood never flashes the original.
const MOOD_HEAD_SCRIPT = `(function () {
  try {
    var m = sessionStorage.getItem("sc.mood");
    var t = sessionStorage.getItem("sc.theme");
    if (m && ${JSON.stringify(MOODS)}.indexOf(m) > -1) {
      document.documentElement.setAttribute("data-mood", m);
      if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
    }
  } catch (err) { /* no storage: start on the original */ }
})();`;

const MOOD_CHIP = `<div class="mood-chip" id="mood-chip" hidden>
  <span class="mood-chip-now">Previewing <strong id="mood-chip-name"></strong></span>
  <span class="mood-chip-sep" aria-hidden="true">·</span>
  <span class="mood-scheme" role="group" aria-label="Light or dark">
    <button type="button" class="mood-scheme-btn" data-scheme="light" aria-pressed="false">Light</button>
    <span class="mood-chip-sep" aria-hidden="true">·</span>
    <button type="button" class="mood-scheme-btn" data-scheme="dark" aria-pressed="false">Dark</button>
  </span>
  <span class="mood-chip-sep" aria-hidden="true">·</span>
  <button type="button" class="mood-back" id="mood-back">Back to the original</button>
</div>
<p class="vh" id="mood-live" role="status" aria-live="polite"></p>`;

const MOOD_SCRIPT = `(function () {
  "use strict";
  var cfg = ${MOOD_JSON};
  var root = document.documentElement;
  var KEY = "sc.mood";
  var THEME_KEY = "sc.theme";
  var chip = document.getElementById("mood-chip");
  var chipName = document.getElementById("mood-chip-name");
  var back = document.getElementById("mood-back");
  var live = document.getElementById("mood-live");
  var buttons = Array.prototype.slice.call(document.querySelectorAll(".design-try[data-mood]"));
  var schemeButtons = Array.prototype.slice.call(document.querySelectorAll(".mood-scheme-btn[data-scheme]"));
  var metas = Array.prototype.slice.call(document.querySelectorAll('meta[name="theme-color"]'));
  var darkQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  metas.forEach(function (m) { m.setAttribute("data-original", m.getAttribute("content") || ""); });

  function known(m) { return cfg.moods.indexOf(m) > -1; }
  function current() {
    var m = root.getAttribute("data-mood");
    return m && known(m) ? m : "";
  }
  function scheme() {
    var t = root.getAttribute("data-theme");
    if (t === "light" || t === "dark") return t;
    return darkQuery && darkQuery.matches ? "dark" : "light";
  }
  function remember(key, value) {
    try {
      if (value) sessionStorage.setItem(key, value);
      else sessionStorage.removeItem(key);
    } catch (err) { /* the preview still works, it just is not remembered */ }
  }
  function paint() {
    var m = current();
    var s = scheme();
    buttons.forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-mood") === m ? "true" : "false"); });
    schemeButtons.forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-scheme") === s ? "true" : "false"); });
    if (chip) {
      chip.hidden = !m;
      if (chipName) chipName.textContent = m ? (cfg.names[m] || m) : "";
    }
    var paper = m ? getComputedStyle(root).getPropertyValue("--paper").trim() : "";
    metas.forEach(function (meta) { meta.setAttribute("content", paper || meta.getAttribute("data-original")); });
  }
  function set(m) {
    if (!known(m)) m = "";
    if (m) {
      root.setAttribute("data-mood", m);
    } else {
      root.removeAttribute("data-mood");
      root.removeAttribute("data-theme");
      remember(THEME_KEY, "");
    }
    remember(KEY, m);
    paint();
    if (live) live.textContent = m ? "Previewing " + (cfg.names[m] || m) + " on the whole page, " + scheme() : "Back to the original look";
  }
  function setScheme(s) {
    if (s !== "light" && s !== "dark") return;
    root.setAttribute("data-theme", s);
    remember(THEME_KEY, s);
    paint();
    var m = current();
    if (live) live.textContent = (m ? (cfg.names[m] || m) + " in " : "") + s;
  }

  buttons.forEach(function (b) {
    b.addEventListener("click", function () {
      var m = b.getAttribute("data-mood");
      // a second press on the mood you are wearing takes it off again
      set(m === current() ? "" : m);
    });
  });
  schemeButtons.forEach(function (b) {
    b.addEventListener("click", function () { setScheme(b.getAttribute("data-scheme")); });
  });
  if (back) {
    back.addEventListener("click", function () {
      set("");
      if (document.activeElement === back) back.blur();
    });
  }
  if (darkQuery) {
    var onChange = function () { paint(); };
    if (darkQuery.addEventListener) darkQuery.addEventListener("change", onChange);
    else if (darkQuery.addListener) darkQuery.addListener(onChange);
  }
  paint();
})();`;

resetIds();
const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex, nofollow">
  <title>${esc(meta.title)}</title>
  <meta name="description" content="${esc(meta.dek)}">
  <meta name="theme-color" content="#EDEBE3" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#15141F" media="(prefers-color-scheme: dark)">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Fraunces:ital,opsz,wght,SOFT,WONK@0,9..144,300..900,0..100,0..1;1,9..144,300..900,0..100,0..1&family=Newsreader:ital,opsz,wght@0,6..72,400..600;1,6..72,400..600&display=swap" rel="stylesheet">
  <meta name="sc-build" content="${BUILD}">
  <link rel="stylesheet" href="${v("assets/site.css")}">
  <link rel="stylesheet" href="${v("assets/review.css")}">
  <script>
${MOOD_HEAD_SCRIPT}
  </script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${symbols}
<div class="grain" aria-hidden="true"></div>

<div class="wrap">
  <div class="bar">
    <a class="wordmark" href="#main"><svg aria-hidden="true" focusable="false"><use href="#rings-sym"/></svg>The Secret Cloud</a>
    <nav class="bar-nav" aria-label="Sections">
      <ul>
        ${navItems}
      </ul>
    </nav>
    <div id="review-identity"></div>
  </div>
  ${PLAN_NAV.split("\n").join("\n  ")}

  <main id="main">
    <div class="hero">
      <div class="hero-text">
        <h1 class="hero-wordmark">${esc(meta.title)}</h1>
        ${misreg("p", esc(meta.tagline), ` id="hero-title"`)}
        <p class="dek">${esc(meta.dek)}</p>
        <aside class="about" aria-label="About this page">
          <p>${esc(meta.about)}</p>
          <p class="about-meta">${meta.writtenBy ? `Written by ${esc(meta.writtenBy)} · ` : "Drafted "}${esc(longDate(meta.date))} · <a href="#marks">How to leave notes</a></p>
        </aside>
      </div>
      ${heroRings}
    </div>

${plan.sections.map(renderSection).join("\n\n")}
  </main>

  <footer class="foot">
    <p>${esc(meta.title)} · a plan before the build · notes are read before anything is built</p>
    <p><a href="https://github.com/nocodeuser1/secret-cloud">Source and schema on GitHub</a></p>
  </footer>
</div>

${MOOD_CHIP}

<script>
${PAGE_SCRIPT}
</script>
<script>
${MOOD_SCRIPT}
</script>
<script defer src="${v("assets/config.js")}"></script>
<script defer src="${v("assets/review.js")}"></script>
</body>
</html>
`;

const outPath = path.join(root, "index.html");
writeFileSync(outPath, html);
writeFileSync(path.join(root, "version.json"), JSON.stringify({ build: BUILD }) + "\n");
console.log(`wrote ${path.relative(root, outPath)} (${html.length.toLocaleString()} chars, ${plan.sections.length} sections) and version.json (build ${BUILD})`);

// ---------------------------------------------------------------- phone gallery (dev aid)
// dev/phone-gallery.html shows every option's phone pair for all five calls,
// with a mood, theme and size switcher, so whoever draws the screens can look
// and screenshot fast. Query parameters set the switches before first paint:
// ?mood=night-walk&theme=dark&size=l&call=drop. The published page never
// links to it.

resetIds();
const galleryCalls = plan.sections.flatMap((s) => s.blocks).filter((b) => b.type === "design");
const galleryControls = [
  ["mood", "Mood", [["", "Original"], ...MOODS.map((m) => [m, MOOD_NAMES[m] || m])]],
  ["theme", "Theme", [["", "System"], ["light", "Light"], ["dark", "Dark"]]],
  ["size", "Size", [["", "Page size"], ["l", "Large"]]],
  ["call", "Show", [["", "All calls"], ...galleryCalls.map((b) => [b.call, b.short])]],
];
const gallerySection = (b) => {
  const pinned = b.call === "look";
  return `<section class="gal-call" data-call="${esc(b.call)}" id="call-${esc(b.call)}">
  <h2>${esc(b.short)} <span class="gal-key">${esc(b.call)} · ${pinned ? "each mood pins its own palettes" : "follows the page's mood"}</span></h2>
  <p class="gal-src">${pinned ? "dev/phone/screens-look.mjs" : b.call === "drop" || b.call === "first" ? "dev/phone/screens-map.mjs" : "dev/phone/screens-social.mjs"} · ${esc(b.title)}</p>
  <div class="gal-grid">
${b.options.map((o) => `  <figure class="gal-opt" id="opt-${esc(b.call)}-${esc(o.key)}">
    ${phonePair(b.call, o.key, `${o.name}: the app on a phone, in light and in dark`)}
    <figcaption><strong>${esc(o.name)}</strong> <span class="gal-key">${esc(o.key)}</span></figcaption>
  </figure>`).join("\n")}
  </div>
</section>`;
};
const gallery = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex, nofollow">
  <title>Phone gallery</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Fraunces:ital,opsz,wght,SOFT,WONK@0,9..144,300..900,0..100,0..1;1,9..144,300..900,0..100,0..1&family=Newsreader:ital,opsz,wght@0,6..72,400..600;1,6..72,400..600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../assets/site.css?v=${BUILD}">
  <script>
(function () {
  var q = new URLSearchParams(location.search);
  var r = document.documentElement;
  var m = q.get("mood"), t = q.get("theme"), s = q.get("size"), c = q.get("call");
  if (m && ${JSON.stringify(MOODS)}.indexOf(m) > -1) r.setAttribute("data-mood", m);
  if (t === "light" || t === "dark") r.setAttribute("data-theme", t);
  if (s === "l") r.setAttribute("data-size", "l");
  if (c) r.setAttribute("data-call", c);
})();
  </script>
  <style>
    .gal { max-width: 84rem; margin: 0 auto; padding: 1.5rem max(16px, env(safe-area-inset-left, 0px)) 4rem; }
    .gal h1 { margin: 0 0 .4rem; font-family: var(--font-display); font-weight: 500; font-size: 1.8rem; }
    .gal-intro { margin: 0 0 1rem; color: var(--ink-soft); font-size: 1rem; max-width: 70ch; }
    .gal-intro code, .gal-src { font-family: var(--font-mono); font-size: .78rem; }
    .gal-controls { display: flex; flex-wrap: wrap; gap: .6rem 1.4rem; margin: 0 0 1.5rem; padding: .7rem 0; border-block: 1px dashed var(--line); font-family: var(--font-mono); font-size: .72rem; letter-spacing: .06em; }
    .gal-controls fieldset { display: flex; flex-wrap: wrap; align-items: center; gap: .3rem; margin: 0; padding: 0; border: 0; }
    .gal-controls legend { float: left; margin-right: .4rem; color: var(--ink-soft); text-transform: uppercase; letter-spacing: .12em; }
    .gal-controls button { min-height: 30px; padding: .2rem .65rem; border: 1px solid var(--line); border-radius: 999px; background: none; color: var(--ink); font: inherit; cursor: pointer; }
    .gal-controls button[aria-pressed="true"] { background: var(--ink); border-color: var(--ink); color: var(--paper); }
    .gal-call { margin: 0 0 2.5rem; }
    .gal-call h2 { margin: 0; font-family: var(--font-display); font-weight: 500; font-size: 1.35rem; }
    .gal-key { font-family: var(--font-mono); font-size: .68rem; font-weight: 400; letter-spacing: .08em; color: var(--ink-soft); }
    .gal-src { margin: .2rem 0 .9rem; color: var(--ink-soft); }
    .gal-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 17rem), 1fr)); gap: 1.25rem; }
    .gal-opt { margin: 0; }
    .gal-opt figcaption { margin-top: .45rem; font-size: .95rem; }
    :root[data-size="l"] .gal-grid { grid-template-columns: repeat(auto-fill, minmax(min(100%, 32rem), 1fr)); }
    :root[data-size="l"] .phone-fig { --phone-w: 15rem; }
    :root[data-call] .gal-call { display: none; }
    ${galleryCalls.map((b) => `:root[data-call="${b.call}"] .gal-call[data-call="${b.call}"]`).join(",\n    ")} { display: block; }
  </style>
</head>
<body>
<div class="gal">
  <h1>Phone gallery</h1>
  <p class="gal-intro">Every design option's phone pair, light and dark, for all five calls. A dev aid built by <code>node dev/build-page.mjs</code>; the plan page never links here. The look call pins each mood's own palettes; the other four calls follow whichever mood is chosen below. The switches also read the address: <code>?mood=night-walk&amp;theme=dark&amp;size=l&amp;call=drop</code>.</p>
  <div class="gal-controls">
${galleryControls.map(([k, label, opts]) => `    <fieldset data-key="${k}"><legend>${label}</legend>${opts.map(([v, t]) => `<button type="button" data-value="${esc(v)}">${esc(t)}</button>`).join("")}</fieldset>`).join("\n")}
  </div>
${galleryCalls.map(gallerySection).join("\n")}
</div>
<script>
(function () {
  "use strict";
  var r = document.documentElement;
  var ATTR = { mood: "data-mood", theme: "data-theme", size: "data-size", call: "data-call" };
  var sets = Array.prototype.slice.call(document.querySelectorAll(".gal-controls fieldset"));
  function paint() {
    var q = new URLSearchParams();
    sets.forEach(function (fs) {
      var key = fs.getAttribute("data-key");
      var val = r.getAttribute(ATTR[key]) || "";
      if (val) q.set(key, val);
      Array.prototype.forEach.call(fs.querySelectorAll("button"), function (b) {
        b.setAttribute("aria-pressed", b.getAttribute("data-value") === val ? "true" : "false");
      });
    });
    var qs = q.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
  }
  sets.forEach(function (fs) {
    var key = fs.getAttribute("data-key");
    fs.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("button") : null;
      if (!b) return;
      var val = b.getAttribute("data-value");
      if (val) r.setAttribute(ATTR[key], val);
      else r.removeAttribute(ATTR[key]);
      paint();
    });
  });
  paint();
})();
</script>
</body>
</html>
`;
writeFileSync(path.join(root, "dev", "phone-gallery.html"), gallery);
console.log(`wrote dev/phone-gallery.html (${gallery.length.toLocaleString()} chars, ${galleryCalls.reduce((n, b) => n + b.options.length, 0)} phone pairs)`);
