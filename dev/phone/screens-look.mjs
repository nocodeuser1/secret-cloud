// dev/phone/screens-look.mjs
// The look call: one main app screen, drawn four ways. It is the listening
// screen while you walk toward a drop: the app name small at the top, rings
// with you on your way in, a warmer hint, the drop's title, a live level,
// play and pause, and a small way to leave a reply.
//
// Each mood is drawn with a fixed palette (ph-pal-<palette>-l / -d), so all
// four sit side by side whatever the page is wearing. The layout is shared, so
// the four compare directly; each mood adds its own touches.

import { CX, text, rings, icon } from "./kit.mjs";

const TITLE = "Hackberry,";
const SUB = "by the creek";
const RC = { x: CX, y: 142 };          // ring centre
const YOU = { x: 52, y: 182 };         // you, between the outer and middle ring
const TRAIL = `M8 236 C22 226 30 214 36 204 S46 188 ${YOU.x} ${YOU.y}`;

// ------------------------------------------------------------- shared parts

function appName(cls = "sf-soft") {
  return icon.ringsMark(CX - 57, 47.2, 4.2, cls.replace("sf-", "ss-"), cls) +
    text(CX + 6, 50, "THE SECRET CLOUD", { font: "mono", size: 8, cls, spacing: 1.2 });
}

function you(fill = "sf-hi", ring = "ss-ink") {
  return `<path d="${TRAIL}" fill="none" class="ss-soft" stroke-width="1.4" stroke-dasharray="1.5 4" stroke-linecap="round" opacity=".8"/>` +
    `<circle cx="${YOU.x}" cy="${YOU.y}" r="9" class="${fill}" opacity=".3"/>` +
    `<circle cx="${YOU.x}" cy="${YOU.y}" r="4.6" class="${fill} ${ring}" stroke-width="1.6"/>` +
    text(YOU.x - 14, YOU.y + 4, "you", { font: "mono", size: 8, cls: "sf-soft", anchor: "end" });
}

// the live level: a row of bars, the ones you have earned lit
function level(y, { lit = "sf-accent", dim = "sf-soft", shape = "round", n = 15, on = 10 } = {}) {
  const x0 = 34, step = 8.1, w = 4.4;
  let out = "";
  for (let i = 0; i < n; i++) {
    const h = 4 + Math.round(13 * Math.sin((i / (n - 1)) * Math.PI * 0.92 + 0.15) * (0.55 + 0.45 * (i / n)));
    const x = x0 + i * step;
    const rx = shape === "square" ? 0 : w / 2;
    out += `<rect x="${x.toFixed(1)}" y="${y - h}" width="${w}" height="${h}" rx="${rx}" class="${i < on ? lit : dim}"${i < on ? "" : ' opacity=".28"'}/>`;
  }
  return out;
}

function player(y, { btn = "sf-accent", glyph = "sf-bg", square = false } = {}) {
  const r = 16;
  const shape = square
    ? `<rect x="${CX - r}" y="${y - r}" width="${r * 2}" height="${r * 2}" rx="3" class="${btn}"/>`
    : `<circle cx="${CX}" cy="${y}" r="${r}" class="${btn}"/>`;
  return text(CX - 34, y + 3, "0:42", { font: "mono", size: 8.5, cls: "sf-soft", anchor: "end" }) +
    shape + icon.pause(CX - 6, y - 6, 12, glyph) +
    text(CX + 34, y + 3, "3:10", { font: "mono", size: 8.5, cls: "sf-soft", anchor: "start" });
}

function reply(y, cls = "sf-accent") {
  const label = "Leave a reply";
  return icon.pen(CX - 38, y - 8, 9, cls.replace("sf-", "ss-")) +
    text(CX + 6, y, label, { font: "body", size: 10.5, cls, italic: true }) +
    `<path d="M${CX - 24} ${y + 3.5} H${CX + 36}" class="${cls.replace("sf-", "ss-")}" stroke-width=".7" opacity=".6"/>`;
}

function warmer(y, cls = "sf-accent", { chevrons = true } = {}) {
  return (chevrons ? icon.chevronUp(CX - 33, y - 7, 7, cls.replace("sf-", "ss-"), 1.4) : "") +
    text(CX + 3, y, "WARMER", { font: "mono", size: 9, cls, spacing: 1.6, weight: 500 }) +
    (chevrons ? icon.chevronUp(CX + 32, y - 7, 7, cls.replace("sf-", "ss-"), 1.4) : "");
}

// ------------------------------------------------------------- riso zine

function riso(ctx) {
  const blend = "s-blend";
  return `
${appName("sf-soft")}
<g class="${blend}" transform="translate(2.2 1.6)">${rings(RC.x, RC.y, [58, 38, 19], "ss-accent2", 1.6)}</g>
${rings(RC.x, RC.y, [58], "ss-ink", 1.3, 'stroke-dasharray="2 4" stroke-linecap="round"')}
${rings(RC.x, RC.y, [38], "ss-accent", 1.8)}
<circle cx="${RC.x}" cy="${RC.y}" r="19" class="sf-accent2" opacity=".2"/>
${rings(RC.x, RC.y, [19], "ss-accent", 1.8)}
<circle cx="${RC.x}" cy="${RC.y}" r="3.4" class="sf-ink"/>
${you("sf-hi", "ss-ink")}
<g transform="rotate(-3 ${CX} 218)">
  <rect x="${CX - 40}" y="207" width="80" height="18" rx="2" class="sf-bg ss-accent" stroke-width="1.4"/>
  ${warmer(219.5, "sf-accent", { chevrons: false })}
</g>
<g class="${blend}" transform="translate(1.8 1.4)">${text(CX, 260, TITLE, { font: "display", size: 21, cls: "sf-accent2", weight: 500 })}</g>
${text(CX, 260, TITLE, { font: "display", size: 21, cls: "sf-ink", weight: 500 })}
${text(CX, 278, SUB, { font: "display", size: 13, cls: "sf-soft", italic: true })}
${level(306, { lit: "sf-accent" })}
${player(336, { btn: "sf-accent" })}
${reply(366, "sf-accent")}`;
}

// ------------------------------------------------------------- night walk

function night(ctx) {
  const g = ctx.id("lantern");
  const strength = ctx.dark ? 0.55 : 0.4;
  const flies = [[30, 96], [148, 84], [160, 176], [24, 140], [122, 218], [140, 62], [44, 66]];
  // two stands of pines at the edges of the clearing
  const trees = (y, cls) =>
    `<path d="M-2 ${y} V${y - 18} L7 ${y - 40} L13 ${y - 24} L20 ${y - 36} L28 ${y - 14} L34 ${y} Z` +
    ` M182 ${y} V${y - 22} L173 ${y - 44} L166 ${y - 26} L159 ${y - 36} L151 ${y - 12} L146 ${y} Z" class="${cls}" opacity="${ctx.dark ? 0.5 : 0.3}"/>`;
  return `
<defs><radialGradient id="${g}" cx=".5" cy=".5" r=".5">
  <stop offset="0" class="sg-accent" stop-opacity="${strength}"/>
  <stop offset=".55" class="sg-accent" stop-opacity="${strength * 0.32}"/>
  <stop offset="1" class="sg-accent" stop-opacity="0"/>
</radialGradient></defs>
<circle cx="${RC.x}" cy="${RC.y}" r="92" fill="url(#${g})"/>
${trees(248, "sf-moss")}
${appName("sf-soft")}
${rings(RC.x, RC.y, [58], "ss-soft", 1.1, 'stroke-dasharray="1 5" stroke-linecap="round"')}
${rings(RC.x, RC.y, [38], "ss-accent", 1.4, 'opacity=".75"')}
<circle cx="${RC.x}" cy="${RC.y}" r="19" class="sf-accent" opacity=".3"/>
<circle cx="${RC.x}" cy="${RC.y}" r="8" class="sf-hi"/>
${flies.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 3 ? 1.1 : 1.6}" class="sf-hi" opacity="${i % 2 ? 0.6 : 0.95}"/>`).join("")}
${you("sf-ink", "ss-bg")}
${warmer(221, "sf-accent")}
${text(CX, 262, TITLE, { font: "display", size: 21, cls: "sf-ink", weight: 400, italic: true })}
${text(CX, 280, SUB, { font: "body", size: 12.5, cls: "sf-soft", italic: true })}
${level(306, { lit: "sf-accent" })}
${player(336, { btn: "sf-accent" })}
${reply(366, "sf-accent")}`;
}

// ------------------------------------------------------------- field kit

function field(ctx) {
  const ticks = [];
  for (let a = 0; a < 360; a += 15) {
    const r1 = 58, r2 = a % 90 === 0 ? 66 : a % 45 === 0 ? 63 : 61;
    const rad = (a * Math.PI) / 180;
    ticks.push(`M${(RC.x + r1 * Math.cos(rad)).toFixed(1)} ${(RC.y + r1 * Math.sin(rad)).toFixed(1)} L${(RC.x + r2 * Math.cos(rad)).toFixed(1)} ${(RC.y + r2 * Math.sin(rad)).toFixed(1)}`);
  }
  return `
<g transform="rotate(-1.5 ${CX} 48)">
  <rect x="${CX - 52}" y="40" width="104" height="14" class="sf-ink"/>
  ${text(CX, 50, "THE SECRET CLOUD", { font: "mono", size: 8, cls: "sf-bg", spacing: 1.4, weight: 500 })}
</g>
<path d="M${RC.x - 72} ${RC.y} H${RC.x + 72} M${RC.x} ${RC.y - 72} V${RC.y + 72}" class="ss-line" stroke-width=".9"/>
<path d="${ticks.join(" ")}" class="ss-ink" stroke-width="1"/>
${rings(RC.x, RC.y, [58], "ss-ink", 1.2)}
${rings(RC.x, RC.y, [38], "ss-accent2", 2.6)}
<circle cx="${RC.x}" cy="${RC.y}" r="19" class="sf-hi"/>
${rings(RC.x, RC.y, [19], "ss-ink", 1.2)}
<circle cx="${RC.x}" cy="${RC.y}" r="3" class="sf-ink"/>
${text(RC.x, RC.y - 70, "N", { font: "mono", size: 8, cls: "sf-soft", weight: 500 })}
${text(RC.x + 47, RC.y + 66, "18 FT", { font: "mono", size: 8, cls: "sf-soft", anchor: "start", weight: 500 })}
${you("sf-accent2", "ss-ink")}
<g transform="rotate(-1.2 ${CX} 220)">
  <rect x="${CX - 39}" y="211" width="78" height="17" class="sf-ink"/>
  <rect x="${CX - 39}" y="211" width="6" height="17" class="sf-accent2"/>
  ${text(CX + 3, 223, "WARMER", { font: "mono", size: 9, cls: "sf-bg", spacing: 1.6, weight: 500 })}
</g>
${text(CX, 262, TITLE, { font: "display", size: 20, cls: "sf-ink", weight: 600 })}
${text(CX, 279, SUB.toUpperCase(), { font: "mono", size: 8.5, cls: "sf-soft", spacing: 1.4 })}
${level(306, { lit: "sf-accent2", dim: "sf-ink", shape: "square" })}
${player(336, { btn: "sf-ink", glyph: "sf-bg", square: true })}
${reply(366, "sf-accent")}`;
}

// ------------------------------------------------------------- kingdom glass

function glass(ctx) {
  const lead = ctx.dark ? "ss-bg" : "ss-ink";
  const pools = [
    ["a", 150, 70, "sg-accent", 0.42],
    ["b", 20, 200, "sg-accent2", 0.3],
    ["c", 120, 330, "sg-moss", 0.26],
  ];
  const defs = pools.map(([k, , , cls, o]) =>
    `<radialGradient id="${ctx.id("pool-" + k)}" cx=".5" cy=".5" r=".5"><stop offset="0" class="${cls}" stop-opacity="${ctx.dark ? o : o * 0.7}"/><stop offset="1" class="${cls}" stop-opacity="0"/></radialGradient>`).join("");
  // the rose: eight panes inside the middle ring
  const panes = ["sf-accent", "sf-accent2", "sf-moss", "sf-hi", "sf-accent", "sf-accent2", "sf-moss", "sf-hi"];
  const R = 34, r = 13;
  let rose = "";
  panes.forEach((cls, i) => {
    const a0 = (i / 8) * Math.PI * 2 - Math.PI / 2, a1 = ((i + 1) / 8) * Math.PI * 2 - Math.PI / 2;
    const p = (rad, a) => `${(RC.x + rad * Math.cos(a)).toFixed(1)} ${(RC.y + rad * Math.sin(a)).toFixed(1)}`;
    rose += `<path d="M${p(r, a0)} L${p(R, a0)} A${R} ${R} 0 0 1 ${p(R, a1)} L${p(r, a1)} A${r} ${r} 0 0 0 ${p(r, a0)} Z" class="${cls}" opacity="${ctx.dark ? 0.85 : 0.75}"/>`;
  });
  const arch = `M30 214 V128 C30 86 60 66 ${CX} 62 C120 66 150 86 150 128 V214`;
  return `
<defs>${defs}</defs>
${pools.map(([k, x, y]) => `<circle cx="${x}" cy="${y}" r="90" fill="url(#${ctx.id("pool-" + k)})"/>`).join("")}
${appName("sf-accent")}
<path d="${arch}" fill="none" class="ss-accent" stroke-width="1.4"/>
<path d="M36 214 V129 C36 92 63 72 ${CX} 68 C117 72 144 92 144 129 V214" fill="none" class="ss-line" stroke-width="1"/>
${rose}
<g class="${lead}" stroke-width="1.8" fill="none">${panes.map((_, i) => {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    return `<path d="M${(RC.x + r * Math.cos(a)).toFixed(1)} ${(RC.y + r * Math.sin(a)).toFixed(1)} L${(RC.x + R * Math.cos(a)).toFixed(1)} ${(RC.y + R * Math.sin(a)).toFixed(1)}"/>`;
  }).join("")}<circle cx="${RC.x}" cy="${RC.y}" r="${R}"/><circle cx="${RC.x}" cy="${RC.y}" r="${r}"/></g>
<circle cx="${RC.x}" cy="${RC.y}" r="${r - 1}" class="sf-hi"/>
${rings(RC.x, RC.y, [R + 3.5], "ss-accent", 1.6)}
${rings(RC.x, RC.y, [58], "ss-soft", 1, 'stroke-dasharray="1 4" stroke-linecap="round"')}
${you("sf-hi", ctx.dark ? "ss-bg" : "ss-ink")}
${warmer(229, "sf-accent")}
${text(CX, 264, TITLE, { font: "display", size: 21, cls: "sf-ink", weight: 500, italic: true })}
${text(CX, 282, SUB, { font: "display", size: 13, cls: "sf-soft", italic: true })}
${level(308, { lit: "sf-accent" })}
${player(338, { btn: "sf-accent" })}
${reply(366, "sf-accent2")}`;
}

// palette key -> screen
export const LOOK = { riso, night, field, glass };

// The look call's option keys are the page's mood keys.
export const MOOD_PALETTE = { riso: "riso", "night-walk": "night", "field-kit": "field", "kingdom-glass": "glass" };

export function listening(moodKey) {
  const pal = MOOD_PALETTE[moodKey];
  if (!pal) throw new Error(`listening(): unknown mood ${moodKey}`);
  return LOOK[pal];
}
