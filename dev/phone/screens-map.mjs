// dev/phone/screens-map.mjs
// Phone screens for two design calls, drawn in the page's CURRENT mood:
//   drop  (how a drop shows on the map): rings, glow, hidden, inked
//   first (the first thing you see):     ring, map, words, dark
// Each export takes ctx (see CONTRACT.md) and returns the screen's inner SVG.
// Colours come only from the palette classes (sf-*, ss-*, sg-*).
//
// The four drop screens share one park, drawn here once (park()): a creek
// with a footbridge, a gravel path, a spur to a bench, a little hill with a
// stone on top, and a few stands of trees. The same three drops sit in the
// same places on every drop screen, so the only thing that changes between
// them is how a drop is drawn.

import { CX, text, rings, icon, pill } from "./kit.mjs";

// ------------------------------------------------------------- the park

const CREEK = "M-8 116 C26 120 46 142 70 156 S118 174 132 204 S148 258 190 280";
const PATH = "M50 400 C56 356 64 322 84 294 S120 250 117 214 S126 150 148 118 S172 82 192 70";
const SPUR = "M84 294 C66 286 48 276 32 266";

// drops: A by the hackberry at the creek, B out in the east meadow, C the stone on the hill
const A = { x: 94, y: 176 };
const B = { x: 150, y: 246 };
const C = { x: 38, y: 92 };
const YOU = { x: 79, y: 302 };

const TREES = [
  // west woods
  [14, 186, 9], [30, 198, 8], [18, 214, 7], [44, 184, 6], [10, 236, 6], [34, 222, 5],
  // north woods, left of the path
  [112, 106, 8], [126, 88, 9], [100, 90, 6], [142, 66, 7], [116, 72, 5],
  // east, past the path
  [168, 140, 7], [172, 160, 5],
  // south east
  [150, 322, 8], [166, 340, 9], [138, 346, 6], [170, 306, 5],
  // single trees in the meadow
  [58, 248, 5], [130, 274, 4],
];

// a canopy: three overlapping lobes drawn as one flat shape, with a soft shadow
function tree(x, y, r, o = 1) {
  const lobes = [[0, 0, 1], [r * 0.55, r * 0.3, 0.72], [-r * 0.5, r * 0.35, 0.66]];
  const shape = (dx, dy) => lobes.map(([lx, ly, k]) => `<circle cx="${(x + lx + dx).toFixed(1)}" cy="${(y + ly + dy).toFixed(1)}" r="${(r * k).toFixed(1)}"/>`).join("");
  return `<g class="sf-ink" opacity="${(0.07 * o).toFixed(2)}">${shape(1.2, 1.6)}</g>` +
    `<g class="sf-moss" opacity="${(0.42 * o).toFixed(2)}">${shape(0, 0)}</g>`;
}

function bench(x, y) {
  return `<g transform="translate(${x} ${y}) rotate(-28)">` +
    `<rect x="-6" y="-1.6" width="12" height="3.2" rx=".8" class="sf-soft" opacity=".85"/>` +
    `<path d="M-5 -3.6 H5" class="ss-soft" stroke-width="1" stroke-linecap="round" opacity=".7"/></g>`;
}

function stone(x, y) {
  return `<ellipse cx="${x}" cy="${y}" rx="3.6" ry="2.6" class="sf-soft" opacity=".75"/>`;
}

// The park seen from above. { quiet } fades it back a little more.
function park(ctx, { quiet = 1 } = {}) {
  const q = (o) => (o * quiet).toFixed(2);
  let out = `<rect x="0" y="0" width="180" height="390" class="sf-surface"/>`;
  // the little hill: contour lines around the stone
  out += [30, 22, 14, 7].map((r, i) =>
    `<ellipse cx="${C.x + 2}" cy="${C.y + 1}" rx="${r * 1.25}" ry="${r}" fill="none" class="ss-line" stroke-width=".8" opacity="${q(0.9 - i * 0.05)}" transform="rotate(-12 ${C.x} ${C.y})"/>`).join("");
  // meadow contours, very faint
  out += `<path d="M96 380 C120 360 150 362 186 340" fill="none" class="ss-line" stroke-width=".7" opacity="${q(0.7)}"/>`;
  out += `<path d="M-4 340 C20 330 30 350 46 360" fill="none" class="ss-line" stroke-width=".7" opacity="${q(0.7)}"/>`;
  // the creek: a soft bed and a bright thread
  out += `<path d="${CREEK}" fill="none" class="ss-accent" stroke-width="10" opacity="${q(0.16)}" stroke-linecap="round"/>`;
  out += `<path d="${CREEK}" fill="none" class="ss-accent" stroke-width="4" opacity="${q(0.22)}" stroke-linecap="round"/>`;
  out += `<path d="${CREEK}" fill="none" class="ss-accent" stroke-width="1" opacity="${q(0.55)}" stroke-linecap="round"/>`;
  // the path, the spur to the bench, and the footbridge where the path crosses the creek
  out += `<path d="${SPUR}" fill="none" class="ss-line" stroke-width="3.2" stroke-linecap="round" opacity="${q(1)}"/>`;
  out += `<path d="${PATH}" fill="none" class="ss-line" stroke-width="6" stroke-linecap="round" opacity="${q(1)}"/>`;
  out += `<path d="${PATH}" fill="none" class="ss-surface" stroke-width="1" stroke-dasharray="1.5 3.5" opacity="${q(0.9)}"/>`;
  out += `<g transform="translate(119 190) rotate(-8)" opacity="${q(1)}"><rect x="-6" y="-5" width="12" height="10" class="sf-line"/>` +
    `<path d="M-7 -5 H7 M-7 5 H7" class="ss-soft" stroke-width="1" opacity=".7"/></g>`;
  out += TREES.map(([x, y, r]) => tree(x, y, r, quiet)).join("");
  // the hackberry, by the creek, where drop A sits
  out += tree(A.x + 6, A.y - 8, 7, quiet);
  out += bench(30, 262);
  out += stone(C.x, C.y);
  return out;
}

// ------------------------------------------------------------- map chrome

// a small label on the map, haloed in the map's own colour so it reads over paths
function mapLabel(x, y, str, { font = "mono", size = 8, cls = "sf-soft", anchor = "middle", italic = false } = {}) {
  return text(x, y, str, { font, size, cls: `${cls} ss-surface`, anchor, italic, extra: 'stroke-width="3" stroke-linejoin="round" paint-order="stroke"' });
}

// the floating bar at the top of every map screen
function topBar() {
  return `<rect x="10" y="33" width="160" height="25" rx="12.5" class="sf-bg ss-line" stroke-width=".8" opacity=".96"/>` +
    icon.ringsMark(24, 45.5, 4.6, "ss-accent", "sf-accent") +
    text(34, 48.6, "THE SECRET CLOUD", { font: "mono", size: 8, cls: "sf-ink", anchor: "start", spacing: 1.1 }) +
    // a small north arrow
    `<path d="M157 51 L161 40 L165 51 L161 48.4 Z" class="sf-soft"/>`;
}

// you, on the path, with a soft cone for the way the phone is facing
function you(ctx, { heading = -30, cone = true, x = YOU.x, y = YOU.y } = {}) {
  const g = ctx.id("cone");
  return (cone
    ? `<defs><radialGradient id="${g}" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(${x} ${y}) scale(34)">` +
      `<stop offset="0" class="sg-accent" stop-opacity=".45"/><stop offset="1" class="sg-accent" stop-opacity="0"/></radialGradient></defs>` +
      `<path d="M${x} ${y} L${x - 13} ${y - 31} A34 34 0 0 1 ${x + 13} ${y - 31} Z" fill="url(#${g})" transform="rotate(${heading} ${x} ${y})"/>`
    : "") +
    `<circle cx="${x}" cy="${y}" r="9" class="sf-accent" opacity=".16"/>` +
    `<circle cx="${x}" cy="${y}" r="4.8" class="sf-accent ss-bg" stroke-width="2"/>`;
}

// the bottom sheet: a card that rises over the map, with a grabber
function sheet(y = 308, h = 72) {
  return `<rect x="6" y="${y}" width="168" height="${h + 20}" rx="18" class="sf-bg ss-line" stroke-width=".8"/>` +
    `<rect x="78" y="${y + 6}" width="24" height="3" rx="1.5" class="sf-line"/>`;
}

// a short row of level bars, lit up to `on`
function bars(x0, base, { n = 9, on = 5, step = 5.4, w = 3, lit = "sf-accent", amp = 9 } = {}) {
  let out = "";
  for (let i = 0; i < n; i++) {
    const h = 3 + Math.round(amp * Math.abs(Math.sin(i * 1.7 + 0.6)) * (0.5 + 0.5 * Math.sin((i / (n - 1)) * Math.PI)));
    out += `<rect x="${(x0 + i * step).toFixed(1)}" y="${base - h}" width="${w}" height="${h}" rx="${w / 2}" class="${i < on ? lit : "sf-soft"}"${i < on ? "" : ' opacity=".3"'}/>`;
  }
  return out;
}

// ------------------------------------------------------------- drop: rings

export function rings_(ctx) {
  const riso = `<g class="s-blend" transform="translate(1.8 1.4)" opacity=".9">${rings(A.x, A.y, [44, 17], "ss-accent2", 1.4)}</g>`;
  return `
${park(ctx)}
<circle cx="${A.x}" cy="${A.y}" r="44" class="sf-accent" opacity=".07"/>
<circle cx="${A.x}" cy="${A.y}" r="17" class="sf-accent" opacity=".14"/>
${riso}
${rings(A.x, A.y, [44], "ss-accent", 1.3, 'stroke-dasharray="3 3"')}
${rings(A.x, A.y, [17], "ss-accent", 1.8)}
<circle cx="${A.x}" cy="${A.y}" r="3.2" class="sf-accent"/>
${rings(B.x, B.y, [24], "ss-accent", 1.1, 'stroke-dasharray="3 3" opacity=".8"')}
${rings(B.x, B.y, [9], "ss-accent", 1.5, 'opacity=".8"')}
<circle cx="${B.x}" cy="${B.y}" r="2.4" class="sf-accent" opacity=".8"/>
${rings(C.x, C.y, [8], "ss-accent", 1, 'stroke-dasharray="2 2"')}
${rings(C.x, C.y, [3.4], "ss-accent", 1.3)}
<path d="M${A.x} ${A.y + 45} V${A.y + 50}" class="ss-soft" stroke-width=".8"/>
${mapLabel(A.x, A.y + 58, "starts here")}
<path d="M${A.x - 10} ${A.y - 14} L${A.x - 24} ${A.y - 34}" class="ss-soft" stroke-width=".8"/>
${mapLabel(A.x - 26, A.y - 37, "loudest", { anchor: "end" })}
${you(ctx, { heading: 8 })}
${topBar()}
${sheet()}
${icon.ringsMark(29, 334, 8, "ss-accent", "sf-accent")}
${text(46, 332, "Hackberry,", { font: "display", size: 15, cls: "sf-ink", anchor: "start", weight: 500 })}
${text(46, 345, "by the creek", { font: "body", size: 10.5, cls: "sf-soft", anchor: "start", italic: true })}
${text(46, 362, "120 FT TO THE EDGE", { font: "mono", size: 8, cls: "sf-accent", anchor: "start", spacing: 0.5 })}`;
}

// ------------------------------------------------------------- drop: glow

export function glow(ctx) {
  const g = ctx.id("glow");
  const blooms = [[A, 54, 1], [B, 32, 0.75], [C, 16, 0.85]];
  const defs = `<defs><radialGradient id="${g}" cx=".5" cy=".5" r=".5">` +
    `<stop offset="0" class="sg-hi" stop-opacity=".95"/>` +
    `<stop offset=".22" class="sg-hi" stop-opacity=".62"/>` +
    `<stop offset=".5" class="sg-accent2" stop-opacity=".26"/>` +
    `<stop offset="1" class="sg-accent2" stop-opacity="0"/></radialGradient></defs>`;
  const draw = blooms.map(([p, r, o]) =>
    `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="url(#${g})" opacity="${o}"/>` +
    `<circle cx="${p.x}" cy="${p.y}" r="${Math.max(1.6, r * 0.05).toFixed(1)}" class="sf-hi" opacity="${o}"/>`).join("");
  return `
${park(ctx, { quiet: ctx.dark ? 0.8 : 0.9 })}
${defs}
<g class="s-blend">${draw}</g>
${you(ctx, { heading: 8 })}
${topBar()}
${sheet()}
<circle cx="31" cy="342" r="11" fill="url(#${g})"/>
<circle cx="31" cy="342" r="2" class="sf-hi"/>
${text(48, 338, "A little warmer", { font: "display", size: 14, cls: "sf-ink", anchor: "start", weight: 500 })}
${text(48, 352, "toward the creek", { font: "body", size: 10.5, cls: "sf-soft", anchor: "start", italic: true })}`;
}

// ------------------------------------------------------------- drop: hidden

export function hidden(ctx) {
  // you, further up the path; the drop by the hackberry is not drawn at all.
  // Sound reaches you from the north west: arcs on that side of the dot only.
  const me = { x: 110, y: 246 };
  const arcs = [15, 23, 31].map((r, i) => {
    const a0 = (-150 * Math.PI) / 180, a1 = (-95 * Math.PI) / 180;
    const p = (a) => `${(me.x + r * Math.cos(a)).toFixed(1)} ${(me.y + r * Math.sin(a)).toFixed(1)}`;
    return `<path d="M${p(a0)} A${r} ${r} 0 0 1 ${p(a1)}" fill="none" class="ss-accent" stroke-width="1.6" stroke-linecap="round" opacity="${(0.9 - i * 0.28).toFixed(2)}"/>`;
  }).join("");
  return `
${park(ctx)}
${rings(C.x, C.y, [9], "ss-soft", 1, 'stroke-dasharray="2 2"')}
<circle cx="${C.x}" cy="${C.y}" r="2.2" class="sf-soft"/>
${mapLabel(C.x + 13, C.y + 3, "HEARD", { anchor: "start" })}
<path d="M${YOU.x} ${YOU.y + 30} C${YOU.x - 2} ${YOU.y} ${me.x - 20} ${me.y + 30} ${me.x} ${me.y}" fill="none" class="ss-soft" stroke-width="1.3" stroke-dasharray="1.5 3.5" stroke-linecap="round"/>
${arcs}
${you(ctx, { cone: false, x: me.x, y: me.y })}
${topBar()}
${sheet(290, 82)}
<circle cx="31" cy="319" r="11" class="sf-accent" opacity=".14"/>
${headphones(25, 312.6, 12, "ss-accent")}
${text(48, 316, "SOMETHING IS PLAYING", { font: "mono", size: 8, cls: "sf-accent", anchor: "start", spacing: 0.9 })}
${text(48, 327, "NEARBY", { font: "mono", size: 8, cls: "sf-accent", anchor: "start", spacing: 0.9 })}
${text(20, 349, "Put your earbuds in.", { font: "display", size: 13, cls: "sf-ink", anchor: "start", weight: 500 })}
${text(20, 364, "You will find it by ear.", { font: "body", size: 10.5, cls: "sf-soft", anchor: "start", italic: true })}
${bars(140, 366, { n: 6, on: 4, step: 5.6, w: 3, amp: 11 })}`;
}

function headphones(x, y, s, cls) {
  const k = s / 12;
  return `<g transform="translate(${x} ${y}) scale(${k})">` +
    `<path d="M1 9 V6.5 A5 5 0 0 1 11 6.5 V9" fill="none" class="${cls}" stroke-width="1.5" stroke-linecap="round"/>` +
    `<rect x="0" y="7.4" width="3" height="4.6" rx="1.2" class="${cls.replace("ss-", "sf-")}"/>` +
    `<rect x="9" y="7.4" width="3" height="4.6" rx="1.2" class="${cls.replace("ss-", "sf-")}"/></g>`;
}

// ------------------------------------------------------------- drop: inked

// a hand-drawn loop: a wobbly circle that does not quite close and overshoots
function penLoop(cx, cy, r, seed = 1) {
  const pts = [];
  const n = 14;
  for (let i = 0; i <= n + 2; i++) {
    const a = -1.9 + (i / n) * Math.PI * 2.12;
    const wob = 1 + 0.07 * Math.sin(i * 2.3 + seed) + 0.04 * Math.cos(i * 3.7 + seed * 2);
    const rr = r * wob * (1 - i * 0.004);
    pts.push([cx + rr * Math.cos(a) * 1.08, cy + rr * Math.sin(a) * 0.94]);
  }
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    d += ` Q${x1.toFixed(1)} ${y1.toFixed(1)} ${((x1 + x2) / 2).toFixed(1)} ${((y1 + y2) / 2).toFixed(1)}`;
  }
  return d;
}

function penX(x, y, s) {
  return `M${x - s} ${y - s * 0.8} Q${x} ${y + 0.6} ${x + s * 1.05} ${y + s * 0.9} M${x + s * 0.85} ${y - s} Q${x + 0.8} ${y - 0.4} ${x - s * 0.9} ${y + s * 0.95}`;
}

export function inked(ctx) {
  const stroke = (d, w = 1.6, cls = "ss-accent") => `<path d="${d}" fill="none" class="${cls}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const marks = (cls) =>
    stroke(penLoop(A.x, A.y, 21, 1), 1.7, cls) +
    stroke(penX(A.x, A.y, 4), 1.6, cls) +
    stroke(penLoop(B.x, B.y, 12, 4), 1.4, cls) +
    stroke(penX(B.x, B.y, 3), 1.4, cls) +
    stroke(penX(C.x + 1, C.y - 7, 3), 1.4, cls) +
    // a scribbled arrow from the stone's label
    stroke(`M${C.x + 30} ${C.y - 22} Q${C.x + 16} ${C.y - 22} ${C.x + 6} ${C.y - 12} M${C.x + 6} ${C.y - 12} l1.2 -4.6 M${C.x + 6} ${C.y - 12} l4.6 -0.4`, 1.1, cls);
  return `
${park(ctx)}
<g class="s-blend" transform="translate(1.6 1.2)" opacity=".75">${marks("ss-accent2")}</g>
${marks("ss-accent")}
${mapLabel(C.x + 32, C.y - 19, "the stone", { font: "body", size: 11, cls: "sf-accent", anchor: "start", italic: true })}
${mapLabel(A.x - 26, A.y + 36, "violin here", { font: "body", size: 11, cls: "sf-accent", anchor: "start", italic: true })}
${you(ctx, { heading: 8 })}
${topBar()}
${sheet()}
${stroke(penX(30, 340, 5), 1.7)}
${text(46, 336, "Hackberry,", { font: "body", size: 15, cls: "sf-ink", anchor: "start", italic: true, weight: 500 })}
${text(46, 350, "by the creek", { font: "body", size: 10.5, cls: "sf-soft", anchor: "start", italic: true })}
<path d="M45 354.5 C70 353 96 356 118 354" fill="none" class="ss-accent" stroke-width=".9" stroke-linecap="round" opacity=".7"/>`;
}

// the rings mark at the top of the first-screen options, sized to read as the
// brand mark at page size (outer ring 7, a solid centre dot 2.5)
const brandMark = (y) =>
  icon.ringsMark(CX, y, 7, "ss-accent", "sf-accent") +
  `<circle cx="${CX}" cy="${y}" r="2.5" class="sf-accent"/>`;

// ------------------------------------------------------------- first: ring

export function ring(ctx) {
  const c = { x: CX, y: 182 };
  const g = ctx.id("pulse");
  const level = 0.64;   // how much of the ring's level arc is lit
  const R = 58;
  const circ = 2 * Math.PI * R;
  // the live level: a tall meter of bars, rising toward the right
  let meter = "";
  const n = 17, x0 = 30, step = 7.5, w = 4.2;
  for (let i = 0; i < n; i++) {
    const h = 5 + Math.round(30 * Math.pow(Math.abs(Math.sin(i * 0.9 + 0.4)), 0.8) * (0.35 + 0.65 * (i / n)));
    const on = i < 11;
    meter += `<rect x="${(x0 + i * step).toFixed(1)}" y="${336 - h}" width="${w}" height="${h}" rx="${w / 2}" class="${on ? "sf-accent" : "sf-soft"}"${on ? "" : ' opacity=".25"'}/>`;
  }
  return `
<defs><radialGradient id="${g}" cx=".5" cy=".5" r=".5">
  <stop offset="0" class="sg-accent" stop-opacity=".22"/>
  <stop offset=".6" class="sg-accent" stop-opacity=".08"/>
  <stop offset="1" class="sg-accent" stop-opacity="0"/></radialGradient></defs>
<circle cx="${c.x}" cy="${c.y}" r="110" fill="url(#${g})"/>
${rings(c.x, c.y, [96, 80], "ss-accent", 0.8, 'opacity=".25"')}
${rings(c.x, c.y, [70], "ss-accent", 0.9, 'opacity=".45"')}
<g class="s-blend" transform="translate(1.8 1.4)">${rings(c.x, c.y, [R], "ss-accent2", 2)}</g>
${rings(c.x, c.y, [R], "ss-line", 7)}
<circle cx="${c.x}" cy="${c.y}" r="${R}" fill="none" class="ss-accent" stroke-width="7" stroke-linecap="round" stroke-dasharray="${(circ * level).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 ${c.x} ${c.y})"/>
<circle cx="${c.x}" cy="${c.y}" r="34" class="sf-accent" opacity=".1"/>
<circle cx="${c.x}" cy="${c.y}" r="9" class="sf-accent"/>
<circle cx="${c.x}" cy="${c.y}" r="15" fill="none" class="ss-accent" stroke-width="1" opacity=".5"/>
${brandMark(50)}
${meter}
<path d="M30 343 H158" class="ss-line" stroke-width="1"/>`;
}

// ------------------------------------------------------------- first: map

// the whole park, small, as an island of green in the town grid
export function map(ctx) {
  const clip = ctx.id("park");
  const s = 0.6, ox = 36, oy = 70;     // park drawn at 60%, top left at (36, 70)
  const P = (p) => ({ x: ox + p.x * s, y: oy + p.y * s });
  const boundary = `M${ox + 4} ${oy + 6} L${ox + 104} ${oy} L${ox + 110} ${oy + 120} L${ox + 102} ${oy + 236} L${ox + 2} ${oy + 230} Z`;
  const you2 = { x: ox + 50, y: oy + 236 };      // at the gate, by the sign
  const hint = ctx.id("hint");
  const a = P(A), b = P(B), c = P(C);
  let streets = "";
  for (const y of [oy - 4, 196, oy + 248, 372]) streets += `<path d="M-4 ${y} H184" class="ss-line" stroke-width="${y === oy + 248 ? 7 : 4}"/>`;
  for (const x of [22, ox + 122, 172]) streets += `<path d="M${x} ${oy - 4} V394" class="ss-line" stroke-width="4"/>`;
  const blocks = [[0, 200, 20, 100], [160, 200, 30, 100], [0, 330, 20, 40], [160, 76, 30, 116]]
    .map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="sf-line" opacity=".25"/>`).join("");
  return `
<rect x="0" y="0" width="180" height="390" class="sf-bg"/>
${blocks}
${streets}
<defs><clipPath id="${clip}"><path d="${boundary}"/></clipPath>
<linearGradient id="${hint}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" class="sg-accent" stop-opacity=".5"/><stop offset="1" class="sg-accent" stop-opacity="0"/></linearGradient></defs>
<g clip-path="url(#${clip})"><g transform="translate(${ox} ${oy}) scale(${s})">${park(ctx)}</g></g>
<path d="${boundary}" fill="none" class="ss-moss" stroke-width="1.2" opacity=".6"/>
<path d="M${you2.x} ${you2.y} L${you2.x - 20} ${you2.y - 92} Q${you2.x + 6} ${you2.y - 104} ${you2.x + 32} ${you2.y - 92} Z" fill="url(#${hint})" opacity=".8"/>
${[a, b, c].map((p, i) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${i === 0 ? 3.4 : 2.6}" class="sf-accent" opacity="${i === 0 ? 1 : 0.7}"/>` +
    `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${i === 0 ? 7 : 5}" fill="none" class="ss-accent" stroke-width=".8" opacity=".5"/>`).join("")}
<rect x="${you2.x + 8}" y="${you2.y - 4}" width="5" height="7" rx="1" class="sf-soft"/>
<circle cx="${you2.x}" cy="${you2.y}" r="10" class="sf-accent" opacity=".16"/>
<circle cx="${you2.x}" cy="${you2.y}" r="5" class="sf-accent ss-bg" stroke-width="2"/>
${text(you2.x - 12, you2.y + 3, "you", { font: "mono", size: 8, cls: "sf-soft", anchor: "end" })}
${text(CX, 48, "The park", { font: "display", size: 18, cls: "sf-ink", weight: 500 })}
${text(CX, 61, "GUTHRIE", { font: "mono", size: 8, cls: "sf-soft", spacing: 1.6 })}
<rect x="12" y="334" width="156" height="28" rx="14" class="sf-bg ss-line" stroke-width=".8"/>
${icon.chevronUp(24, 343, 8, "ss-accent", 1.5)}
${text(37, 351.6, "Head in toward the creek", { font: "body", size: 10.5, cls: "sf-ink", anchor: "start", italic: true })}`;
}

// ------------------------------------------------------------- first: words

export function words(ctx) {
  return `
<rect x="0" y="0" width="180" height="390" class="sf-bg"/>
${brandMark(92)}
${text(CX, 178, "Something is playing", { font: "display", size: 17, cls: "sf-ink", weight: 400 })}
${text(CX, 199, "to the north.", { font: "display", size: 17, cls: "sf-ink", weight: 400 })}
${text(CX, 228, "Walk toward it.", { font: "body", size: 12, cls: "sf-soft", italic: true })}
<path d="M${CX} 258 V284" class="ss-accent" stroke-width="1" stroke-linecap="round"/>
${icon.chevronUp(CX - 4.5, 252, 9, "ss-accent", 1.2)}
${text(CX, 298, "N", { font: "mono", size: 8, cls: "sf-accent", spacing: 1 })}`;
}

// ------------------------------------------------------------- first: dark

export function dark(ctx) {
  // the app keeps this screen near-black in either theme; in the light theme
  // the ink colour is the dark one, in the dark theme the background is
  const base = ctx.dark ? "sf-bg" : "sf-ink";
  const faint = ctx.dark ? "sf-soft" : "sf-bg";
  // on the black, the status bar and home indicator draw in paper colour
  if (!ctx.dark) ctx.chromeCls = "sf-bg";
  const halo = ctx.dark ? 1 : 1.5;   // a little more ambient light by day
  const g = ctx.id("point");
  const p = { x: 112, y: 150 };
  return `
<rect x="0" y="0" width="180" height="390" class="${base}"/>
<defs><radialGradient id="${g}" cx=".5" cy=".5" r=".5">
  <stop offset="0" class="sg-hi" stop-opacity=".9"/>
  <stop offset=".25" class="sg-hi" stop-opacity="${(0.35 * halo).toFixed(3)}"/>
  <stop offset="1" class="sg-hi" stop-opacity="0"/></radialGradient></defs>
<circle cx="${p.x}" cy="${p.y}" r="30" fill="url(#${g})"/>
<circle cx="${p.x}" cy="${p.y}" r="14" fill="none" class="ss-hi" stroke-width=".6" opacity="${(0.3 * halo).toFixed(2)}"/>
<circle cx="${p.x}" cy="${p.y}" r="2.6" class="sf-hi"/>
${text(CX, 352, "LISTENING", { font: "mono", size: 8, cls: faint, spacing: 2.4, extra: `opacity="${ctx.dark ? ".55" : ".7"}"` })}`;
}

// rings is also kit's helper name; the export keeps the option key
export { rings_ as rings };

export const SCREENS = {
  drop: { rings: rings_, glow, hidden, inked },
  first: { ring, map, words, dark },
};
