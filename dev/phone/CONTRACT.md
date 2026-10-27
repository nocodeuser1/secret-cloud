# Phone screens: the contract

Every design option on the plan page shows the app on a phone, light and dark side by side. `dev/build-page.mjs` builds these phones from the files in this folder. The two artists each replace one screens file, and you own only your own file:

| file | owner | what it draws |
|---|---|---|
| `kit.mjs` | page (do not edit) | shared helpers: text, rings, icons, QR glyph, park map, pill |
| `frame.mjs` | page (do not edit) | the device: bezel, side buttons, camera cut-out, status bar, home indicator, clip |
| `screens-look.mjs` | page (do not edit) | the look call: the listening screen in the four moods |
| `screens-map.mjs` | artist A | `drop`: `rings`, `glow`, `hidden`, `inked`; `first`: `ring`, `map`, `words`, `dark` |
| `screens-social.mjs` | artist B | `invite`: `stub`, `note`, `black`, `photo`; `mark`: `rings`, `rabbit`, `keyhole`, `wordmark` |

If you need a helper that isn't in `kit.mjs`, write it inside your own file.

## The export signature

Each option key is a named export that takes `ctx` and returns a string of SVG markup (no `<svg>` wrapper):

```js
export function glow(ctx) { return `<circle .../>`; }
export const SCREENS = { drop: { rings, glow, hidden, inked }, first: { ring, map, words, dark } };
```

- Keep the function names and the `SCREENS` export exactly as they are. The build looks screens up as `SCREENS[call][key]` and fails loudly if one is missing.
- Each function is called twice per option, once with `ctx.scheme === "light"` and once with `"dark"`. Don't hard-code a scheme. The palette classes already switch, and `ctx.dark` is there if a drawing needs a different structure in the dark.
- `ctx` contains:
  - `W` (180) and `H` (390)
  - `SAFE` (`{ top: 32, bottom: 372, left: 10, right: 170 }`)
  - `scheme` and `dark`
  - `palette`, which is always `null` for your calls because they follow the page's mood
  - `id(name)`, which returns an id unique to this phone. Use it for every `id=` you create (gradients, clip paths, masks, patterns), for example `id="${ctx.id("glow")}"` and `fill="url(#${ctx.id("glow")})"`. The page has 40 phones, so fixed ids collide.
- Pure ES2020 string building. No DOM, no dependencies, no `<script>`, no `<foreignObject>`, no `<image>`, no external hrefs, and no `<use href="#...">` to the page's symbols (the gallery does not have them).

## Coordinates and safe area

- The screen is **180 by 390 units**, origin at the top left. That is about 19.5:9, like a modern phone.
- The frame paints the background (`sf-bg`) under your markup before you draw. Paint over it freely, for example with a full-screen `parkMap`.
- The frame draws on top of your markup:
  - the status bar, from y 0 to about 26 (9:41, signal, wifi, battery)
  - the camera pill, x 61 to 119, y 6.5 to 23.5
  - the home indicator, x 60 to 120, at y 381.4
- Everything is clipped to a rounded rectangle with a 25-unit corner radius.
- Backgrounds and maps may run under all of that, edge to edge. Keep text and controls inside `SAFE`: y from 32 to 372, x from 10 to 170.
- Rendered size: on the page each phone is about **124 px wide**, so 1 unit is about 0.64 px. At 375 px wide the size is the same; in the gallery's Large view it is 240 px.

## Palette classes (the only colours you may use)

Each phone carries `--s-*` custom properties from one of eight palettes. That is the light or dark set of whatever mood the page is wearing: riso, night walk, field kit or kingdom glass. So "Try it on the page" re-skins your screens.

| role | fill | stroke | gradient stop |
|---|---|---|---|
| background | `sf-bg` | `ss-bg` | `sg-bg` |
| surface (cards, map land) | `sf-surface` | `ss-surface` | `sg-surface` |
| ink (main text) | `sf-ink` | `ss-ink` | `sg-ink` |
| soft ink (secondary text) | `sf-soft` | `ss-soft` | |
| line (rules, borders, paths) | `sf-line` | `ss-line` | |
| accent (links, buttons, the main ink colour) | `sf-accent` | `ss-accent` | `sg-accent` |
| second accent (the pink layer, warm highlights) | `sf-accent2` | `ss-accent2` | `sg-accent2` |
| highlight (sunflower, lantern glow, tape) | `sf-hi` | `ss-hi` | `sg-hi` |
| moss (trees, grass, "grounded") | `sf-moss` | `ss-moss` | `sg-moss` |

- Combine a fill and a stroke class on one element: `class="sf-surface ss-line" stroke-width="1"`.
- Shape fills default to black, so always give a fill class or `fill="none"`.
- Use `opacity` or `fill-opacity` for tints. Never write hex, `rgb()` or named colours.
- Text needs 4.5:1 against what is under it. Ink, soft and accent all reach that on bg and on surface in all eight palettes. `accent2`, `hi` and `moss` are for shapes, not small text.
- Text on an accent or ink fill uses `sf-bg`. That pairing is always readable.
- `s-blend` on a group overprints it: multiply on light, screen on dark. Use it for the riso pink misregistration layer.
- Each palette's hex values are in `assets/site.css` section 1 (`--pal-<look>-<l|d>-<role>`). Section 17 has the class definitions.

## Type

Use the `text()` helper in `kit.mjs`, or put these classes on `<text>`:

| class | face | use |
|---|---|---|
| `t-display` | Fraunces (soft and wonky, crisp in field kit) | titles, the one big line |
| `t-body` | Newsreader | sentences, handwriting-ish lines in italic |
| `t-mono` | DM Mono | labels, times, small caps, uppercase with letter-spacing |
| `t-italic` | italic | combine with any of the above |

Set the size with the `font-size` attribute in screen units, never with CSS.

**Minimum sizes at the page's rendered size:**
- 8 units (about 5 px) for incidental mono labels nobody has to read, like "you" or "0:42"
- 10 units for anything a viewer should be able to read, like a one-line prompt or a button word
- 14 to 21 units for the one line that carries the screen, like the title

The fonts load from Google Fonts. Estimate widths at about 0.6 em per character for mono and 0.5 em for display. Keep a centred line within about 150 units.

## Helpers in `kit.mjs`

- `W`, `H`, `SAFE`, `CX`: the screen size, the safe area and the centre x.
- `text(x, y, str, { font, size, cls, anchor, weight, italic, spacing })`: an escaped `<text>`. `anchor` is `"middle"` by default; also `"start"` or `"end"`.
- `rings(cx, cy, [r1, r2...], "ss-accent", width, extraAttrs)`: concentric circles.
- `icon.play`, `icon.pause`, `icon.pen`, `icon.pin`, `icon.walker` and `icon.chevronUp` each take `(x, y, size, cls)`. `icon.ringsMark` takes `(cx, cy, r, strokeCls, dotCls)` and draws the app's little rings mark.
- `qr(x, y, size, "sf-ink")`: a QR-shaped glyph, with three finders and scattered modules. It carries no data.
- `parkMap(ctx, { creek, path, trees, top, bottom })`: a park seen from above, drawn in surface, line, accent and moss. It has a faint survey grid, a creek, a gravel path and round trees. Draw drops and you-dots on top.
- `pill(cx, cy, label, { fill, textCls, size })`: a rounded label.
- `esc(str)`: escapes text you put into markup yourself.

## What each screen should show

Take the brief from the option text on the page (`content/plan.json`) and from `docs/BRAINSTORM-DIGEST.md`. The phone leads you there, then gets out of the way. Don't show feeds, counts or likes.

- **drop** (map screen in the app, a drop near you): `rings` shows the outer and inner ring as they are. `glow` is a soft bloom with no edge. `hidden` leaves the map blank where a drop sits, with only the one you walked into showing. `inked` is a small hand-drawn uneven mark per drop.
- **first** (what someone meets after the sign): `ring` is one ring and a live level, with no map and no words. `map` is a plain park map, a dot for you and a soft hint of direction. `words` is a single line, like "walk toward the trees". `dark` is a screen almost off, waking only when something is close.
- **invite** (the screen after scanning a show's code): the invitation in the style of its card. `stub` is a ticket stub with perforation, date and code. `note` is a handwritten card. `black` is a plain black card with a light code, and nothing else. `photo` is a print of the place, with the picture as the clue.
- **mark** (the app's mark on a phone's home screen): `rings` is rings softening into a cloud. `rabbit` is a one-line rabbit. `keyhole` is a keyhole with rings. `wordmark` is "THE SECRET CLOUD" in small mono. Show it as an icon among a few blank, generic icon tiles, or large on a launch screen. Use no real app icons and no brand marks.

## Build and look

```bash
node dev/build-page.mjs && node dev/render-check.mjs
```

- The build writes `index.html`, `version.json` and `dev/phone-gallery.html`.
- Your file is part of the build stamp, so render-check fails as a stale build until you rebuild.
- Open `dev/phone-gallery.html` in a browser. The switches set the mood, the theme, a large size and one call, and the address reads them too. For example:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1280,1800 --virtual-time-budget=5000 --screenshot=OUT.png \
  "file:///Users/soundship/Developer/secret-cloud/dev/phone-gallery.html?call=drop&size=l&mood=night-walk&theme=dark"
```

Check every screen in all four moods and both themes. `mood=` takes `riso`, `night-walk`, `field-kit` or `kingdom-glass`. `theme=` takes `light` or `dark`; leave it off to follow the system.

House rules for anything a viewer can read:
- no em-dashes or en-dashes
- no emoji
- no "not X but Y" phrasing
- name the bandmate Kellen if you name him at all
- never mention the assistant that drew this
