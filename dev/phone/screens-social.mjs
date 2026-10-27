// dev/phone/screens-social.mjs
// Phone screens for two design calls, drawn in the page's CURRENT mood:
//   invite (what a secret-show invite looks like): stub, note, black, photo
//   mark   (the mark on the home screen):          rings, rabbit, keyhole, wordmark
// Each export takes ctx (see CONTRACT.md) and returns the screen's inner SVG.
// Colours come only from the palette classes (sf-*, ss-*, sg-*).
//
// invite: the screen you land on after scanning a show's code. A thin top bar
// (close, "AN INVITATION"), the card itself in its style, then one line about
// directions and one button. The four share that frame so the card is what
// you compare.
//
// mark: a home screen. The same grid of blank tiles on every option, the mark
// shown large (a two-by-two icon with its label) and small (in the dock).
// Light uses coloured tiles; dark uses dark tiles with a bright glyph, the way
// a phone's dark home screen tints its icons.

import { CX, W, H, text, qr, pill } from "./kit.mjs";

// ------------------------------------------------------------ invite parts

const TURN = "Turn-by-turn opens an hour before";

function topBar(ctx, label = "AN INVITATION") {
  const x = `<path d="M15 41 L23 49 M23 41 L15 49" class="ss-soft" stroke-width="1.4" stroke-linecap="round"/>`;
  return x + (label ? text(CX, 48, label, { font: "mono", size: 8, cls: "sf-soft", spacing: 1.6 }) : "");
}

function footer(y, button) {
  return text(CX, y, TURN, { font: "body", size: 10, cls: "sf-soft", italic: true }) +
    pill(CX, y + 24, button, { fill: "sf-accent", textCls: "sf-bg", size: 9.5, h: 24, pad: 12 });
}

// the riso pink layer: the same markup again, nudged, overprinted
const misreg = (markup, dx = 1.3, dy = 1) =>
  `<g class="s-blend" transform="translate(${dx} ${dy})" opacity=".85">${markup}</g>`;

// ---- invite: the screen you land on after scanning a show's code

// A ticket stub: admit-one band, the show, four fields, a perforation with
// notches, and a tear-off where the seat would be, holding the code.
export function stub(ctx) {
  const x0 = 24, x1 = 156, top = 64, perf = 236, bot = 306, w = x1 - x0;
  const title = (cls) =>
    text(34, 124, "A secret", { font: "display", size: 21, cls, weight: 500, anchor: "start" }) +
    text(34, 146, "show.", { font: "display", size: 21, cls, weight: 500, italic: true, anchor: "start" });
  const field = (x, y, k, v) =>
    text(x, y, k, { font: "mono", size: 8, cls: "sf-soft", anchor: "start", spacing: 1.2 }) +
    text(x, y + 14, v, { font: "body", size: 11, cls: "sf-ink", anchor: "start" });
  const tear = `<g transform="rotate(3 ${x0} ${perf})">
<path d="M${x0} ${perf + 2} H${x1} V${bot} H${x0} Z" class="sf-surface ss-line" stroke-width="1"/>
${text(34, perf + 20, "SEAT", { font: "mono", size: 8, cls: "sf-soft", anchor: "start", spacing: 1.4 })}
${text(34, perf + 38, "No. 0417", { font: "mono", size: 10.5, cls: "sf-ink", anchor: "start", weight: 500 })}
${text(34, perf + 56, "keep this half", { font: "body", size: 10, cls: "sf-soft", anchor: "start", italic: true })}
${qr(x1 - 52, perf + 12, 42, "sf-ink")}
</g>`;
  return `${topBar(ctx)}
<rect x="${x0 + 2}" y="${top + 3}" width="${w}" height="${perf - top}" rx="4" class="sf-ink" opacity=".07"/>
${tear}
<path d="M${x0 + 4} ${top} H${x1 - 4} A4 4 0 0 1 ${x1} ${top + 4} V${perf} H${x0} V${top + 4} A4 4 0 0 1 ${x0 + 4} ${top} Z" class="sf-surface ss-line" stroke-width="1"/>
<path d="M${x0 + 4} ${top} H${x1 - 4} A4 4 0 0 1 ${x1} ${top + 4} V${top + 26} H${x0} V${top + 4} A4 4 0 0 1 ${x0 + 4} ${top} Z" class="sf-accent"/>
${text(34, top + 17, "ADMIT ONE", { font: "mono", size: 9, cls: "sf-bg", anchor: "start", spacing: 2, weight: 500 })}
${text(x1 - 10, top + 17, "0417", { font: "mono", size: 9, cls: "sf-bg", anchor: "end", spacing: 1 })}
${misreg(title("sf-accent2"))}
${title("sf-ink")}
<path d="M34 160 H146" class="ss-line" stroke-width="1"/>
${field(34, 176, "DATE", "Sat, Oct 31")}
${field(94, 176, "DOORS", "After dark")}
${field(34, 206, "WHERE", "Guthrie")}
${field(94, 206, "BRING", "A blanket")}
<path d="M${x0 + 8} ${perf} H${x1 - 8}" class="ss-soft" stroke-width="1.2" stroke-dasharray="1.2 3.2" stroke-linecap="round"/>
<circle cx="${x0}" cy="${perf}" r="5" class="sf-bg"/>
<circle cx="${x1}" cy="${perf}" r="5" class="sf-bg"/>
<g transform="rotate(-8 126 138)"><rect x="104" y="130" width="44" height="16" rx="2" fill="none" class="ss-accent" stroke-width="1.3"/>
${text(126, 141.5, "LIVE", { font: "mono", size: 9, cls: "sf-accent", spacing: 2, weight: 500 })}</g>
${footer(332, "KEEP THE STUB")}`;
}

// A handwritten note: a card pinned with tape, ruled lines, a few lines in a
// loose italic hand, a wavy underline, and the code drawn small in a corner.
export function note(ctx) {
  const x0 = 22, y0 = 72, w = 136, h = 226;
  let rules = "";
  for (let y = y0 + 52; y < y0 + h - 14; y += 20) rules += `<path d="M${x0 + 10} ${y} H${x0 + w - 10}" class="ss-line" stroke-width=".8"/>`;
  const hand = (x, y, s, size = 12.5) => text(x, y, s, { font: "body", size, cls: "sf-ink", anchor: "start", italic: true });
  const card = `<g transform="rotate(-3 ${CX} ${y0 + h / 2})">
<rect x="${x0 + 3}" y="${y0 + 4}" width="${w}" height="${h}" rx="3" class="sf-ink" opacity=".08"/>
<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="3" class="sf-surface ss-line" stroke-width="1"/>
<path d="M${x0} ${y0 + h * 0.5} H${x0 + w}" class="ss-line" stroke-width="1.4" opacity=".7"/>
${rules}
${text(x0 + 12, y0 + 38, "Come find us,", { font: "display", size: 19, cls: "sf-accent", anchor: "start", italic: true, weight: 400 })}
${hand(x0 + 12, y0 + 70, "Saturday, after dark.")}
<path d="M${x0 + 64} ${y0 + 74} q6 -3 12 0 t12 0 t12 0 t12 0" fill="none" class="ss-accent2" stroke-width="1.4" stroke-linecap="round"/>
${hand(x0 + 12, y0 + 90, "Bring a blanket and")}
${hand(x0 + 12, y0 + 110, "someone you love.")}
${hand(x0 + 12, y0 + 130, "Walk in from the creek.")}
${text(x0 + w - 14, y0 + 160, "x, the band", { font: "body", size: 13, cls: "sf-ink", anchor: "end", italic: true })}
${qr(x0 + 12, y0 + h - 44, 30, "sf-accent")}
${text(x0 + 48, y0 + h - 20, "scan me", { font: "body", size: 10, cls: "sf-soft", anchor: "start", italic: true })}
<path d="M${x0 + 47} ${y0 + h - 30} q-2 -6 -4 -2" fill="none" class="ss-soft" stroke-width="1" stroke-linecap="round"/>
</g>
<rect x="${CX - 22}" y="${y0 - 8}" width="44" height="15" class="sf-hi" opacity=".6" transform="rotate(4 ${CX} ${y0})"/>`;
  return `${topBar(ctx)}${card}${footer(332, "SAVE THE NOTE")}`;
}

// A plain black card: one dark card, one light code, nothing else on it.
// On a dark phone the screen goes one step lighter so the card stays the
// darkest thing there.
export function black(ctx) {
  const d = ctx.dark;
  const x0 = 38, y0 = 84, w = 104, h = 166;
  const ground = d ? `<rect x="0" y="0" width="${W}" height="${H}" class="sf-surface"/>` : "";
  const card = d
    ? `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="6" class="sf-bg ss-line" stroke-width=".8"/>`
    : `<rect x="${x0 + 2}" y="${y0 + 5}" width="${w}" height="${h}" rx="6" class="sf-ink" opacity=".12"/>` +
      `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="6" class="sf-ink"/>`;
  return `${ground}${topBar(ctx, "")}
${card}
${qr(CX - 25, y0 + h / 2 - 25, 50, d ? "sf-ink" : "sf-bg")}
${text(CX, 286, "SAT · AFTER DARK", { font: "mono", size: 10, cls: "sf-ink", spacing: 1.6, weight: 500 })}
${text(CX, 304, TURN, { font: "body", size: 10, cls: "sf-soft", italic: true })}
${pill(CX, 334, "I'LL BE THERE", { fill: "sf-accent", textCls: "sf-bg", size: 9.5, h: 24, pad: 12 })}
${text(CX, 362, "or keep walking", { font: "body", size: 10, cls: "sf-soft", italic: true })}`;
}

// A photo print of the place: a small print with the picture as the clue, a
// caption on the border, and the back of the print (with the code) behind it.
export function photo(ctx) {
  const d = ctx.dark;
  const border = d ? "sf-ink" : "sf-bg";
  const capCls = d ? "sf-bg" : "sf-ink";
  const px = 24, py = 72, pw = 116, ph = 174;      // the print
  const ix = px + 8, iy = py + 8, iw = pw - 16, ih = 124; // the picture
  const clip = ctx.id("pic"), sky = ctx.id("sky");
  const pic = `<defs><clipPath id="${clip}"><rect x="${ix}" y="${iy}" width="${iw}" height="${ih}"/></clipPath>
<linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="sg-surface"/><stop offset=".75" class="sg-hi" stop-opacity=".55"/></linearGradient></defs>
<g clip-path="url(#${clip})">
<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" class="sf-surface"/>
<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" fill="url(#${sky})"/>
<circle cx="${ix + 80}" cy="${iy + 30}" r="8" class="sf-hi"/>
<path d="M${ix} ${iy + 88} q8 -10 16 -4 q6 -12 16 -4 q8 -8 16 0 q8 -12 18 -2 q8 -8 16 0 q8 -10 22 -2 V${iy + ih} H${ix} Z" class="sf-moss" opacity=".55"/>
<rect x="${ix}" y="${iy + 92}" width="${iw}" height="${ih - 92}" class="sf-moss" opacity=".7"/>
<path d="M${ix + 60} ${iy + ih} C${ix + 70} ${iy + 112} ${ix + 92} ${iy + 108} ${ix + iw + 4} ${iy + 100}" fill="none" class="ss-accent" stroke-width="4" opacity=".7" stroke-linecap="round"/>
<path d="M${ix + 30} ${iy + 98} C${ix + 30} ${iy + 80} ${ix + 28} ${iy + 64} ${ix + 30} ${iy + 54} M${ix + 30} ${iy + 72} L${ix + 18} ${iy + 58} M${ix + 30} ${iy + 66} L${ix + 42} ${iy + 52}" fill="none" class="ss-ink" stroke-width="2.6" stroke-linecap="round" opacity=".8"/>
<g class="sf-moss"><circle cx="${ix + 18}" cy="${iy + 50}" r="13"/><circle cx="${ix + 32}" cy="${iy + 40}" r="16"/><circle cx="${ix + 46}" cy="${iy + 50}" r="12"/><circle cx="${ix + 28}" cy="${iy + 58}" r="10"/></g>
<path d="M${ix + 38} ${iy + 102} L${ix + 60} ${iy + 100} L${ix + 64} ${iy + 107} L${ix + 40} ${iy + 109} Z" class="sf-accent2" opacity=".9"/>
<g class="sf-hi"><circle cx="${ix + 16}" cy="${iy + 70}" r="1.4"/><circle cx="${ix + 24}" cy="${iy + 73}" r="1.4"/><circle cx="${ix + 34}" cy="${iy + 74}" r="1.4"/><circle cx="${ix + 44}" cy="${iy + 71}" r="1.4"/></g>
</g>
<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" fill="none" class="ss-ink" stroke-width=".6" opacity=".25"/>`;
  const back = `<g transform="rotate(6 ${px + pw + 14} ${py + ph / 2})">
<rect x="${px + 32}" y="${py - 4}" width="${pw}" height="${ph}" rx="2" class="${border} ss-line" stroke-width="1"/>
${qr(px + pw + 2, py + 52, 24, capCls)}
</g>`;
  const front = `<g transform="rotate(-3 ${CX} ${py + ph / 2})">
<rect x="${px + 2}" y="${py + 4}" width="${pw}" height="${ph}" rx="2" class="sf-ink" opacity=".14"/>
<rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="2" class="${border} ss-line" stroke-width="1"/>
${pic}
${text(px + 10, py + ph - 26, "Under the hackberry.", { font: "body", size: 11, cls: capCls, anchor: "start", italic: true })}
${text(px + 10, py + ph - 11, "Saturday, after dark.", { font: "body", size: 11, cls: capCls, anchor: "start", italic: true })}
</g>`;
  const ground = d ? "" : `<rect x="0" y="0" width="${W}" height="${H}" class="sf-surface"/>`;
  return `${ground}${topBar(ctx)}${back}${front}
${text(CX, 284, "Find this spot.", { font: "display", size: 18, cls: "sf-ink", weight: 500 })}
${text(CX, 300, "The code is on the back.", { font: "body", size: 10, cls: "sf-soft", italic: true })}
${footer(326, "KEEP THE PRINT")}`;
}

// ------------------------------------------------------------- mark parts

// A glyph drawn in a 100 by 100 box. F is a fill class, S its stroke twin,
// T the tile's own colour (for cut-outs such as the rings in the keyhole).
function glyph(kind, F, S, T) {
  if (kind === "rings") {
    return `<circle cx="50" cy="56" r="18" fill="none" class="${S}" stroke-width="5"/>` +
      `<circle cx="50" cy="56" r="8" fill="none" class="${S}" stroke-width="5"/>` +
      `<path d="M22 56 A28 28 0 0 0 78 56 A13 13 0 0 0 68 33 A12.5 12.5 0 0 0 47 24 A11 11 0 0 0 30 32 A13 13 0 0 0 22 56 Z" fill="none" class="${S}" stroke-width="5" stroke-linejoin="round"/>` +
      `<circle cx="50" cy="56" r="2.6" class="${F}"/>`;
  }
  if (kind === "rabbit") {
    return `<path d="M20 82 C12 70 16 50 34 44 C42 41 48 41 52 40 C46 28 42 14 47 10 C53 10 57 24 59 37 C60 24 64 12 70 13 C75 16 70 30 65 40 C74 42 81 48 81 55 C81 61 74 63 67 62 C66 70 70 76 76 80 C78 82 76 84 72 84 L26 84 C16 84 10 78 14 72 C17 68 22 70 20 74" fill="none" class="${S}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<circle cx="71" cy="50" r="2.8" class="${F}"/>`;
  }
  if (kind === "keyhole") {
    return `<circle cx="50" cy="48" r="38" fill="none" class="${S}" stroke-width="2.4" opacity=".45"/>` +
      `<path d="M50 20 A18 18 0 0 1 59 53.6 L64 80 H36 L41 53.6 A18 18 0 0 1 50 20 Z" class="${F}"/>` +
      `<circle cx="50" cy="38" r="11" fill="none" class="${T}" stroke-width="2.6"/>` +
      `<circle cx="50" cy="38" r="5.5" fill="none" class="${T}" stroke-width="2.6"/>` +
      `<circle cx="50" cy="38" r="1.6" class="${T.replace("ss-", "sf-")}"/>`;
  }
  // wordmark: three short lines of mono, set like a label
  const fs = 14.7;
  return `<text x="15" y="40" class="t-mono ${F}" font-size="${fs}" font-weight="500" letter-spacing="1.2">THE</text>` +
    `<text x="15" y="58" class="t-mono ${F}" font-size="${fs}" font-weight="500" letter-spacing="1.2">SECRET</text>` +
    `<text x="15" y="76" class="t-mono ${F}" font-size="${fs}" font-weight="500" letter-spacing="1.2">CLOUD</text>` +
    `<path d="M15 86 H40" class="${S}" stroke-width="2" opacity=".6"/>`;
}

// The app icon at (x, y), s units square. big adds the pink overprint layer.
function appIcon(ctx, kind, x, y, s, big = false) {
  const d = ctx.dark;
  const r = (s * 0.23).toFixed(1);
  const tile = d
    ? `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${r}" class="sf-surface ss-line" stroke-width=".8"/>`
    : `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${r}" class="sf-accent"/>`;
  const F = d ? "sf-accent" : "sf-bg";
  const S = d ? "ss-accent" : "ss-bg";
  const T = d ? "ss-surface" : "ss-accent";
  const k = s / 100;
  const g = (inner) => `<g transform="translate(${x} ${y}) scale(${k})">${inner}</g>`;
  const pink = big && !(d && kind === "wordmark") ? `<g class="s-blend" opacity="${d ? ".55" : ".9"}" transform="translate(${(s * 0.022).toFixed(2)} ${(s * 0.016).toFixed(2)})">${g(glyph(kind, "sf-accent2", "ss-accent2", T))}</g>` : "";
  return tile + pink + g(glyph(kind, F, S, T));
}

// a blank app tile and the short grey bar where its name would be
const TINTS = [["sf-moss", ".45"], ["sf-hi", ".6"], ["sf-soft", ".35"], ["sf-accent2", ".4"], ["sf-line", "1"], ["sf-accent", ".3"], ["sf-soft", ".55"], ["sf-moss", ".25"]];
function blankTile(ctx, i, cx, top, s = 28, label = true) {
  const [cls, op] = TINTS[i % TINTS.length];
  const x = cx - s / 2;
  const r = (s * 0.23).toFixed(1);
  const base = ctx.dark
    ? `<rect x="${x}" y="${top}" width="${s}" height="${s}" rx="${r}" class="sf-surface ss-line" stroke-width=".8"/>` +
      `<rect x="${x}" y="${top}" width="${s}" height="${s}" rx="${r}" class="${cls}" opacity="${(op * 0.4).toFixed(2)}"/>`
    : `<rect x="${x}" y="${top}" width="${s}" height="${s}" rx="${r}" class="sf-bg"/>` +
      `<rect x="${x}" y="${top}" width="${s}" height="${s}" rx="${r}" class="${cls}" opacity="${op}"/>`;
  const lw = 14 + ((i * 7) % 10);
  const bar = label ? `<rect x="${cx - lw / 2}" y="${top + s + 6}" width="${lw}" height="3" rx="1.5" class="sf-soft" opacity=".45"/>` : "";
  return base + bar;
}

// The home screen: wallpaper, a row of tiles, the mark large (two by two, with
// its label) beside four tiles, two more rows, page dots, and a dock with the
// mark small among three blank tiles.
function homeScreen(ctx, kind) {
  const d = ctx.dark;
  const wall = ctx.id("wall");
  const COLS = [34, 74, 114, 154];
  const ROW = [42, 92, 142, 192, 242];
  let out = `<defs><linearGradient id="${wall}" x1="0" y1="0" x2=".4" y2="1">` +
    (d ? `<stop offset="0" class="sg-bg"/><stop offset="1" class="sg-surface"/>`
       : `<stop offset="0" class="sg-surface"/><stop offset="1" class="sg-bg"/>`) +
    `</linearGradient></defs>` +
    `<rect x="0" y="0" width="${W}" height="${H}" fill="url(#${wall})"/>` +
    `<path d="M0 300 C40 270 80 290 120 268 S170 250 ${W} 262 V${H} H0 Z" class="sf-moss" opacity="${d ? ".14" : ".12"}"/>` +
    `<circle cx="138" cy="96" r="60" class="sf-hi" opacity="${d ? ".05" : ".14"}"/>`;
  let n = 0;
  COLS.forEach((cx) => { out += blankTile(ctx, n++, cx, ROW[0]); });
  // the mark, large: columns one and two, rows two and three
  const bx = COLS[0] - 14, by = ROW[1], bs = COLS[1] + 14 - bx;
  out += `<rect x="${bx - 4}" y="${by - 4}" width="${bs + 8}" height="${bs + 8}" rx="${((bs + 8) * 0.25).toFixed(1)}" class="sf-hi" opacity="${d ? ".08" : ".22"}"/>`;
  out += appIcon(ctx, kind, bx, by, bs, true);
  out += text((bx + bx + bs) / 2, by + bs + 14, "The Secret Cloud", { font: "body", size: 10, cls: "sf-ink", weight: 500 });
  [COLS[2], COLS[3]].forEach((cx) => { out += blankTile(ctx, n++, cx, ROW[1]); out += blankTile(ctx, n++, cx, ROW[2]); });
  COLS.forEach((cx) => { out += blankTile(ctx, n++, cx, ROW[3] + 8); });
  [COLS[0], COLS[1]].forEach((cx) => { out += blankTile(ctx, n++, cx, ROW[4] + 8); });
  // page dots
  out += `<circle cx="${CX - 5}" cy="310" r="2" class="sf-ink" opacity=".7"/><circle cx="${CX + 5}" cy="310" r="2" class="sf-ink" opacity=".25"/>`;
  // dock
  out += `<rect x="10" y="322" width="160" height="46" rx="18" class="sf-surface${d ? " ss-line" : ""}"${d ? ' stroke-width=".8"' : ""} opacity="${d ? ".95" : ".75"}"/>`;
  const DS = 30, dy = 330;
  out += blankTile(ctx, 4, COLS[0], dy, DS, false);
  out += blankTile(ctx, 2, COLS[1], dy, DS, false);
  out += appIcon(ctx, kind, COLS[2] - DS / 2, dy, DS);
  out += blankTile(ctx, 0, COLS[3], dy, DS, false);
  return out;
}

// ---- mark: the app's mark on a home screen
export function rings(ctx) { return homeScreen(ctx, "rings"); }
export function rabbit(ctx) { return homeScreen(ctx, "rabbit"); }
export function keyhole(ctx) { return homeScreen(ctx, "keyhole"); }
export function wordmark(ctx) { return homeScreen(ctx, "wordmark"); }

export const SCREENS = {
  invite: { stub, note, black, photo },
  mark: { rings, rabbit, keyhole, wordmark },
};
