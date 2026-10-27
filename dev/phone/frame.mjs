// dev/phone/frame.mjs
// A generic modern phone, drawn in SVG: about 19.5:9 screen, rounded corners,
// a pill-shaped camera cut-out, a status bar (9:41, signal, wifi, battery),
// a home indicator, subtle side buttons and a thin bezel in page ink.
// No logos, no real app icons, no brand marks.
//
// The screen is 180 by 390 units with its own origin (see kit.mjs and
// CONTRACT.md). A screen function gets a ctx and returns the inner markup;
// this file draws the background under it and the status bar and home
// indicator over it, then clips everything to the rounded screen.

import { W, H, SAFE } from "./kit.mjs";

const BEZEL = 4;
const BODY_W = W + BEZEL * 2;   // 188
const BODY_H = H + BEZEL * 2;   // 398
const SCREEN_R = 25;
const BODY_R = SCREEN_R + BEZEL;

// Ids must be unique per document (clip paths, gradients). build-page.mjs calls
// resetIds() before each document so the output is stable from build to build.
let counter = 0;
export function resetIds() { counter = 0; }

function statusBar(fill = "sf-ink") {
  const stroke = fill.replace("sf-", "ss-");
  // signal: four bars; wifi: three arcs and a dot; battery: body, level, nub.
  const bars = [0, 1, 2, 3].map((i) => {
    const h = 3 + i * 1.6;
    return `<rect x="${125.5 + i * 3.2}" y="${19 - h}" width="2.2" height="${h}" rx=".6"/>`;
  }).join("");
  const wifi = `<path d="M140.6 13.4 A8 8 0 0 1 151.4 13.4 M142.6 15.5 A5 5 0 0 1 149.4 15.5" fill="none" class="${stroke}" stroke-width="1.4" stroke-linecap="round"/><circle cx="146" cy="17.9" r="1.2"/>`;
  const battery = `<rect x="155" y="12.3" width="14" height="7" rx="2.1" fill="none" class="${stroke}" stroke-width=".9" opacity=".55"/>` +
    `<rect x="156.4" y="13.7" width="9.6" height="4.2" rx="1.1"/>` +
    `<path d="M170.2 14.6 V17" class="${stroke}" stroke-width="1.2" stroke-linecap="round" opacity=".55"/>`;
  return `<g class="ph-status ${fill}">` +
    `<text x="31" y="19.2" class="t-mono ${fill}" font-size="9" font-weight="500" text-anchor="middle">9:41</text>` +
    bars + wifi + battery + `</g>`;
}

/**
 * phone({ scheme, palette, screen, title })
 *   scheme  "light" | "dark"
 *   palette a fixed palette key ("riso" | "night" | "field" | "glass"), or
 *           null to follow the page's current mood (class ph-follow)
 *   screen  (ctx) => inner SVG markup in screen coordinates; a screen may set
 *           ctx.chromeCls (default "sf-ink") to recolour the status bar and
 *           home indicator, for a screen whose background is the ink colour
 * Returns one <svg class="ph ..."> element.
 */
export function phone({ scheme, palette = null, screen }) {
  if (scheme !== "light" && scheme !== "dark") throw new Error(`phone(): scheme must be light or dark, got ${scheme}`);
  const pid = `ph${++counter}`;
  const ctx = {
    W, H, SAFE, scheme, palette, dark: scheme === "dark",
    id: (name) => `${pid}-${name}`,
    chromeCls: "sf-ink",
  };
  const pal = palette ? `ph-pal-${palette}-${scheme[0]}` : "ph-follow";
  const inner = screen(ctx);
  const clip = ctx.id("screen");
  return `<svg class="ph ph-${scheme} ${pal}" viewBox="-2 0 ${BODY_W + 4} ${BODY_H}" width="${BODY_W + 4}" height="${BODY_H}" aria-hidden="true" focusable="false">
<defs><clipPath id="${clip}"><rect x="${BEZEL}" y="${BEZEL}" width="${W}" height="${H}" rx="${SCREEN_R}"/></clipPath></defs>
<g class="ph-btn"><rect x="-1.4" y="70" width="2.2" height="15" rx="1"/><rect x="-1.4" y="96" width="2.2" height="27" rx="1"/><rect x="-1.4" y="129" width="2.2" height="27" rx="1"/><rect x="${BODY_W - 0.8}" y="112" width="2.2" height="42" rx="1"/></g>
<rect class="ph-body" x="0" y="0" width="${BODY_W}" height="${BODY_H}" rx="${BODY_R}"/>
<g clip-path="url(#${clip})"><g transform="translate(${BEZEL} ${BEZEL})">
<rect class="sf-bg" x="0" y="0" width="${W}" height="${H}"/>
${inner}
${statusBar(ctx.chromeCls)}
<rect x="61" y="6.5" width="58" height="17" rx="8.5" class="ph-island"/>
<rect x="60" y="${H - 8.6}" width="60" height="2.4" rx="1.2" class="${ctx.chromeCls} ph-home"/>
</g></g>
<rect class="ph-rim" x="${BEZEL - 0.5}" y="${BEZEL - 0.5}" width="${W + 1}" height="${H + 1}" rx="${SCREEN_R + 0.5}" fill="none" stroke-width="1"/>
</svg>`;
}

export { W, H, SAFE };
