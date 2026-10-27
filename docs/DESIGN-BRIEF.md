# Design brief — the plan site

**One line:** a risograph-printed zine for a secret listening club. Not a tech landing page, not a SaaS site. It should feel hand-made, printed, a little mis-registered, and warm, like a gig poster someone stapled to a pole in Guthrie.

## Tokens (every color and font on the page comes from these)

Declare these in `assets/site.css` on bare `:root`, redefine them in both dark blocks (`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {...} }` and `:root[data-theme="dark"] {...}`, each with `color-scheme: dark`). `assets/review.css` only consumes them with fallbacks (`var(--ink, #1c1b2e)`).

| token | light | dark | use |
|---|---|---|---|
| `--paper` | `#EDEBE3` | `#15141F` | page background (body must set it) |
| `--paper-2` | `#E3E0D5` | `#1E1C2B` | cards, drawers, popovers |
| `--ink` | `#1C1B2E` | `#EDE9DE` | text |
| `--ink-soft` | `#55536A` | `#B3AFC2` | secondary text, captions |
| `--line` | `#C8C5B8` | `#36344C` | rules, borders |
| `--riso-blue` | `#2D4FD8` | `#8AA0FF` | primary accent, links, buttons |
| `--riso-pink` | `#FF4FA3` | `#FF7CC0` | misregistration layer, the one loud accent |
| `--sunflower` | `#F2C230` | `#F7D35A` | highlighter, stamps |
| `--moss` | `#2F8B73` | `#5FC9AC` | "grounded" sections, success |
| `--mark` | `rgba(242,194,48,.45)` | `rgba(247,211,90,.30)` | highlight marks behind commented text |
| `--mark-hot` | `rgba(255,79,163,.35)` | `rgba(255,124,192,.35)` | the active/selected mark |
| `--shadow` | `0 10px 30px rgba(28,27,46,.14)` | `0 10px 30px rgba(0,0,0,.5)` | floating UI |
| `--font-display` | `'Fraunces', 'Iowan Old Style', Georgia, serif` | | headings |
| `--font-body` | `'Newsreader', 'Iowan Old Style', Georgia, serif` | | running text |
| `--font-mono` | `'DM Mono', ui-monospace, 'SF Mono', Menlo, monospace` | | eyebrows, labels, names, times, data |

Google Fonts link (put in `index.html` head, `display=swap`): Fraunces (opsz 9..144, wght 300..900, italic, with SOFT and WONK axes), Newsreader (opsz, wght 400..600, italic), DM Mono (400, 500).

## Type

- Display headings in Fraunces, `font-variation-settings: "SOFT" 70, "WONK" 1`, tight leading (1.0 to 1.05), `text-wrap: balance`. Hero headline fluid: `clamp(2.8rem, 9vw, 7rem)`. Section headings `clamp(2rem, 5vw, 3.4rem)`.
- Body in Newsreader, 1.125rem to 1.2rem, line-height 1.6, measure about 66ch.
- Eyebrows/labels in DM Mono, 0.72rem to 0.8rem, uppercase, letter-spacing .12em.
- Italic Fraunces for emphasis inside headings ("a sound you can *walk into*").

## Motifs (use them, do not decorate randomly)

- **Rings.** Concentric circles are the whole product: a drop has an outer ring and an inner ring with a dB level at each. Use rings in the hero (slowly breathing, 6 to 8 s cycle, paused under reduced motion), as the section-opener ornament, and in the soundscape diagram.
- **Misregistration.** Big headlines get a pink duplicate offset by 2 to 3 px (a `::before` with `color: var(--riso-pink)` and `mix-blend-mode: multiply` in light, `screen` in dark). Only on display headings, never on body text.
- **Grain.** One SVG `feTurbulence` noise filter in a fixed, pointer-events-none overlay at 0.06 to 0.08 opacity. Keep it subtle.
- **Hand-cut edges.** A few callouts get uneven corners (`border-radius: 255px 15px 225px 15px / 15px 225px 15px 255px`) and a 1.5px ink border. Not every box.
- **Stamps.** Small rotated mono labels with a 1.5px border and the accent color ("DROP 001", "EASTER EGG", "GROUNDED", "RABBIT TRAIL"). Use them as section eyebrows where the content really is one of those things.
- **Dotted paths.** Dashed SVG lines with a small pin at the end, for the "how it feels" walk and the phase timeline.
- **Map pins and instrument glyphs** in the soundscape diagram (violin, pad, voice, stone) drawn as simple inline SVG.

## Layout

- Single reading column, ~68ch, with full-bleed "spreads" for: the hero, the soundscape rings diagram, the two-sides diagram, the phase timeline, and the "Leave your marks" tutorial.
- A slim sticky top bar: wordmark left (DM Mono "THE SECRET CLOUD"), section links middle (collapse to a horizontal scroll row on phones), and an empty slot `<div id="review-identity"></div>` right for the review layer's "Reviewing as" chip. `top: env(safe-area-inset-top, 0px)`.
- Section openers: stamp or mono eyebrow, big Fraunces heading, one-line dek in italic Newsreader. The rings ornament sits small and left-aligned above the eyebrow.
- Generous space. Rules (1px `--line`) between sections, not cards.
- Rabbit trails render as a numbered-by-letter list of ideas (A, B, C...) because they are a set the reader votes on, each with a short title, a paragraph, a "why it fits" line, and a stance row mount.
- The grounded plan phases render as a vertical timeline with a dotted path.
- Hero: sized to content (not 100vh). Headline, dek, the breathing rings, and a short "what this page is" note with who wrote it and how to leave notes.

## Both themes, phone width

- Light is the default print look (paper). Dark is "the park at night": same inks inverted, accents brightened as in the table, grain blends with `screen`.
- Must work at 390px: no horizontal scroll, gutters `padding-left: max(16px, env(safe-area-inset-left, 0px))` and `padding-right: max(16px, env(safe-area-inset-right, 0px))` set once on the outer wrapper, `padding-block` for vertical. Diagrams scale with `max-width: 100%`, wide ones in their own `overflow-x: auto` box.
- Visible focus states. `prefers-reduced-motion` stops the rings and the tutorial animation (show the static 3-step version).

## Don't

- No emoji as section markers. No purple-to-blue gradients. No rounded card grids everywhere. No everything-centered. No lorem ipsum. No 100vh hero. No Inter/Space Grotesk. No "worth noting"/"honest caveat" copy. No em-dashes in copy.
