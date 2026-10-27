#!/usr/bin/env node
// dev/build-page.mjs
// Renders content/plan.json into index.html. Every word of copy comes from the
// JSON; this file holds only structure, microcopy (labels, captions) and the
// hand-drawn diagrams. Run: node dev/build-page.mjs

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plan = JSON.parse(readFileSync(path.join(root, "content", "plan.json"), "utf8"));

// ---------------------------------------------------------------- helpers

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const strip = (html) => String(html).replace(/<[^>]+>/g, "");

// Eyebrows that really are stamps (per the brief's list).
const STAMP_EYEBROWS = new Set(["RABBIT TRAIL", "GROUNDED", "EASTER EGG", "DROP 001"]);

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

function stance(id, title) {
  return `<div class="stance" data-stance="${esc(id)}" data-stance-title="${esc(title)}"></div>`;
}

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
  <!-- small ring marks in each circle: the map and the engine they share -->
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
  <rect x="86" y="288" width="8" height="8" class="d-fill-ink"/>
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

const CAPTIONS = {
  rings: "A drop seen from above: quiet at the outer ring, loud at the inner, and off to one side an easter egg on a radius tight enough that you have to walk up to it.",
  "two-sides": "Two sides, one thing underneath. The map, the audio engine and the archive are shared; the product keeps them apart.",
  walk: "The walk as I imagined it: off the gravel path toward the pad, under the hackberry, up the rise to where the mix lines up, then to the stone.",
};

// ---------------------------------------------------------------- blocks

function renderBlock(b, ctx) {
  switch (b.type) {
    case "p":
      return `<p data-block="${b.id}">${b.html}</p>`;

    case "h3": {
      let out = `<h3 data-block="${b.id}">${esc(b.text)}</h3>`;
      if (b.stance) out += `\n${stance(b.stance, b.stanceTitle || b.text)}`;
      if (ctx.section.id === "trails") ctx.afterLeaveHeading = true;
      return out;
    }

    case "ul":
      return `<ul class="list" data-block="${b.id}">\n` +
        b.items.map((it) => `  <li data-block="${it.id}">${it.html}</li>`).join("\n") +
        `\n</ul>`;

    case "quote":
      return `<blockquote data-block="${b.id}"><p>${b.html}</p><cite>${esc(b.cite)}</cite></blockquote>`;

    case "callout":
      return `<aside class="callout" data-block="${b.id}"><span class="stamp">${esc(b.stamp)}</span><p>${b.html}</p></aside>`;

    case "diagram":
      return `<figure class="spread diagram" data-block="${b.id}">` +
        `<div class="diagram-inner">${DIAGRAMS[b.name]()}\n</div>` +
        `<figcaption>${esc(CAPTIONS[b.name])}</figcaption></figure>`;

    case "formula":
      return `<figure class="formula" data-block="${b.id}"><pre>${esc(b.text)}</pre><figcaption>${esc(b.caption)}</figcaption></figure>`;

    case "idea": {
      const H = ctx.afterLeaveHeading ? "h4" : "h3";
      const leave = b.leaveAlone;
      const sizeWord = SIZE_WORD[b.size] || "";
      return `<article class="idea${leave ? " idea-leave" : ""}" data-block="${b.id}">
  <span class="idea-letter">${esc(b.letter)}</span>
  <div class="idea-main">
    <div class="idea-head">
      <${H} class="idea-title">${esc(b.title)}</${H}>
      <span class="size" title="${esc(b.size)} is ${esc(sizeWord)}"><span class="vh">size </span>${esc(b.size)}</span>${leave ? `\n      <span class="stamp stamp-pink">Leave it</span>` : ""}
    </div>
    <div class="idea-body"><p>${b.html}</p></div>
    <p class="fit"><span class="fit-label">Why it fits</span>${esc(b.fit)}</p>${leave ? "" : `\n    ${stance(b.stance, `Trail ${b.letter}: ${b.title}`)}`}
  </div>
</article>`;
    }

    case "phase":
      return `<article class="phase" data-block="${b.id}">
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

    case "question":
      return `<li class="q" data-block="${b.id}">
  <span class="q-n">${String(b.n).padStart(2, "0")}</span>
  <div class="q-main">
    <p class="q-text">${b.html}</p>
    ${stance(b.stance, `Q${b.n}: ${strip(b.html)}`)}
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
  const plainTitle = strip(s.title);
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
  <link rel="stylesheet" href="assets/site.css">
  <link rel="stylesheet" href="assets/review.css">
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

  <main id="main">
    <div class="hero">
      <div class="hero-text">
        <p class="hero-wordmark">${esc(meta.title)}</p>
        ${misreg("h1", esc(meta.tagline), ` id="hero-title"`)}
        <p class="dek">${esc(meta.dek)}</p>
        <aside class="about" aria-label="About this page">
          <p>${esc(meta.about)}</p>
          <p class="about-meta">Written by ${esc(meta.writtenBy)} · ${esc(longDate(meta.date))} · <a href="#marks">How to leave notes</a></p>
        </aside>
      </div>
      ${heroRings}
    </div>

${plan.sections.map(renderSection).join("\n\n")}
  </main>

  <footer class="foot">
    <p>${esc(meta.title)} · a plan, not a promise · notes are read before anything is built</p>
    <p><a href="https://github.com/nocodeuser1/secret-cloud">Source and schema on GitHub</a></p>
  </footer>
</div>

<script defer src="assets/config.js"></script>
<script defer src="assets/review.js"></script>
</body>
</html>
`;

const outPath = path.join(root, "index.html");
writeFileSync(outPath, html);
console.log(`wrote ${path.relative(root, outPath)} (${html.length.toLocaleString()} chars, ${plan.sections.length} sections)`);
