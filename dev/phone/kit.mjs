// dev/phone/kit.mjs
// Small drawing helpers shared by every phone screen. Everything returns SVG
// markup as a string, in screen coordinates (see CONTRACT.md: 180 by 390, the
// status bar and home indicator are drawn by frame.mjs). Colours come only from
// the palette classes in assets/site.css (sf-*, ss-*, sg-*), never from hex.

export const W = 180;
export const H = 390;
// Content stays inside these lines; the frame draws over the rest.
export const SAFE = { top: 32, bottom: 372, left: 10, right: 170 };
export const CX = W / 2;

export const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const attrs = (o = {}) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => ` ${k}="${esc(v)}"`)
    .join("");

// Text. font: "display" | "body" | "mono"; size in screen units (min 8, see CONTRACT.md).
export function text(x, y, str, { font = "body", size = 12, cls = "sf-ink", anchor = "middle", weight, italic, spacing, extra } = {}) {
  const c = [`t-${font}`, cls, italic ? "t-italic" : ""].filter(Boolean).join(" ");
  return `<text${attrs({
    x, y, class: c, "font-size": size, "text-anchor": anchor === "start" ? undefined : anchor,
    "font-weight": weight, "letter-spacing": spacing,
  })}${extra ? " " + extra : ""}>${esc(str)}</text>`;
}

// Concentric rings. radii: [r1, r2, ...]; cls is applied to each (use an ss-* class).
export function rings(cx, cy, radii, cls = "ss-ink", width = 1.5, extra = "") {
  return radii.map((r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" class="${cls}" stroke-width="${width}"${extra ? " " + extra : ""}/>`).join("");
}

// Icons, drawn in a box of `s` units with its top left at (x, y).
export const icon = {
  play: (x, y, s = 12, cls = "sf-ink") =>
    `<path d="M${x + s * 0.22} ${y + s * 0.1} L${x + s * 0.92} ${y + s / 2} L${x + s * 0.22} ${y + s * 0.9} Z" class="${cls}" stroke-linejoin="round"/>`,
  pause: (x, y, s = 12, cls = "sf-ink") =>
    `<rect x="${x + s * 0.18}" y="${y + s * 0.1}" width="${s * 0.22}" height="${s * 0.8}" rx="${s * 0.05}" class="${cls}"/>` +
    `<rect x="${x + s * 0.6}" y="${y + s * 0.1}" width="${s * 0.22}" height="${s * 0.8}" rx="${s * 0.05}" class="${cls}"/>`,
  pen: (x, y, s = 10, cls = "ss-ink") =>
    `<path d="M${x + s * 0.12} ${y + s * 0.88} L${x + s * 0.2} ${y + s * 0.62} L${x + s * 0.7} ${y + s * 0.12} L${x + s * 0.88} ${y + s * 0.3} L${x + s * 0.38} ${y + s * 0.8} Z" fill="none" class="${cls}" stroke-width="${Math.max(1, s * 0.11)}" stroke-linejoin="round"/>`,
  pin: (x, y, s = 14, cls = "sf-accent", hole = "sf-bg") =>
    `<path d="M${x + s * 0.5} ${y + s} C${x + s * 0.2} ${y + s * 0.64} ${x + s * 0.05} ${y + s * 0.5} ${x + s * 0.05} ${y + s * 0.34} A${s * 0.45} ${s * 0.45} 0 0 1 ${x + s * 0.95} ${y + s * 0.34} C${x + s * 0.95} ${y + s * 0.5} ${x + s * 0.8} ${y + s * 0.64} ${x + s * 0.5} ${y + s} Z" class="${cls}"/>` +
    `<circle cx="${x + s * 0.5}" cy="${y + s * 0.34}" r="${s * 0.14}" class="${hole}"/>`,
  walker: (x, y, s = 14, cls = "sf-ink") =>
    `<g transform="translate(${x} ${y}) scale(${s / 32})"><circle cx="12" cy="5" r="4" class="${cls}"/>` +
    `<path d="M12 9 V19 M12 12 L6 17 M12 12 L18 16 M12 19 L7 30 M12 19 L17 30" fill="none" class="${cls.replace(/^sf-/, "ss-")}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></g>`,
  chevronUp: (x, y, s = 8, cls = "ss-ink", w = 1.4) =>
    `<path d="M${x} ${y + s * 0.7} L${x + s / 2} ${y + s * 0.2} L${x + s} ${y + s * 0.7}" fill="none" class="${cls}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`,
  ringsMark: (cx, cy, r = 6, cls = "ss-accent", dot = "sf-accent") =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" class="${cls}" stroke-width="${Math.max(0.9, r * 0.16)}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r * 0.55}" fill="none" class="${cls}" stroke-width="${Math.max(0.9, r * 0.16)}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r * 0.16}" class="${dot}"/>`,
};

// A QR-shaped glyph (three finder squares and a scatter of modules, no data),
// `size` units square with its top left at (x, y).
const QR_MODULES = [
  [8, 0], [10, 0], [12, 1], [9, 2], [11, 3], [8, 4], [10, 5], [12, 6], [9, 8], [0, 8], [2, 8], [4, 9], [6, 8],
  [1, 10], [3, 11], [5, 12], [8, 10], [10, 10], [12, 9], [14, 8], [16, 9], [18, 8], [20, 10], [15, 11], [17, 12],
  [19, 13], [9, 14], [11, 15], [8, 16], [12, 17], [10, 18], [9, 20], [11, 19], [13, 20], [14, 14], [16, 15],
  [18, 16], [20, 14], [15, 17], [17, 18], [19, 19], [14, 20], [16, 20], [20, 20], [8, 12], [10, 12], [12, 12],
  [13, 10], [6, 10], [7, 12], [18, 10], [13, 15], [15, 13], [11, 11], [17, 15],
];
export const QR_FINDERS = [[0, 0], [14, 0], [0, 14]]
  .map(([x, y]) => `M${x} ${y}h7v7h-7z M${x + 1} ${y + 1}v5h5v-5z M${x + 2} ${y + 2}h3v3h-3z`).join(" ");
export const QR_DOTS = QR_MODULES.map(([x, y]) => `M${x} ${y}h1v1h-1z`).join("");
export function qr(x, y, size = 42, cls = "sf-ink") {
  return `<g transform="translate(${x} ${y}) scale(${size / 21})"><path d="${QR_FINDERS}" class="${cls}" fill-rule="evenodd"/><path d="${QR_DOTS}" class="${cls}"/></g>`;
}

// A simple park seen from above: the surface colour as grass, a gravel path, a
// creek, a few round trees. Pass { creek: false } etc. to leave parts out.
// Returns markup that fills the whole screen; draw your marks on top.
export function parkMap(ctx, { creek = true, path = true, trees = true, top = 0, bottom = H } = {}) {
  const h = bottom - top;
  const y = (f) => (top + h * f).toFixed(1);
  let out = `<rect x="0" y="${top}" width="${W}" height="${h}" class="sf-surface"/>`;
  // faint survey grid
  for (let gx = 30; gx < W; gx += 30) out += `<path d="M${gx} ${top} V${bottom}" class="ss-line" stroke-width=".5" opacity=".55"/>`;
  if (creek) {
    out += `<path d="M-6 ${y(0.18)} C40 ${y(0.24)} 30 ${y(0.4)} 78 ${y(0.46)} S150 ${y(0.52)} 140 ${y(0.7)} S120 ${y(0.9)} 186 ${y(0.96)}" fill="none" class="ss-accent" stroke-width="7" opacity=".22" stroke-linecap="round"/>`;
    out += `<path d="M-6 ${y(0.18)} C40 ${y(0.24)} 30 ${y(0.4)} 78 ${y(0.46)} S150 ${y(0.52)} 140 ${y(0.7)} S120 ${y(0.9)} 186 ${y(0.96)}" fill="none" class="ss-accent" stroke-width="1.2" opacity=".55" stroke-linecap="round"/>`;
  }
  if (path) {
    out += `<path d="M-6 ${y(0.82)} C50 ${y(0.76)} 70 ${y(0.62)} 110 ${y(0.58)} S170 ${y(0.4)} 186 ${y(0.3)}" fill="none" class="ss-line" stroke-width="6" stroke-linecap="round"/>`;
    out += `<path d="M-6 ${y(0.82)} C50 ${y(0.76)} 70 ${y(0.62)} 110 ${y(0.58)} S170 ${y(0.4)} 186 ${y(0.3)}" fill="none" class="ss-bg" stroke-width="1" stroke-dasharray="2 3" opacity=".7"/>`;
  }
  if (trees) {
    const T = [[28, 0.32, 9], [40, 0.36, 7], [150, 0.16, 10], [138, 0.2, 7], [60, 0.66, 8], [120, 0.8, 9], [132, 0.84, 6], [24, 0.9, 7], [156, 0.6, 8]];
    out += T.map(([tx, f, r]) => `<circle cx="${tx}" cy="${y(f)}" r="${r}" class="sf-moss" opacity=".38"/>`).join("");
  }
  return out;
}

// A rounded pill with centred mono text. Returns markup; width is estimated.
export function pill(cx, cy, label, { fill = "sf-ink", textCls = "sf-bg", size = 8, pad = 8, h = 16, stroke } = {}) {
  const w = Math.round(label.length * size * 0.62 + pad * 2);
  const rect = `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${h / 2}" class="${fill}"${stroke ? ` stroke-width="1.2"` : ""}/>`;
  return rect + text(cx, cy + size * 0.36, label, { font: "mono", size, cls: textCls, spacing: 0.8 });
}
