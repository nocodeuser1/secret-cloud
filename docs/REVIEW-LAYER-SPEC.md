# Review layer spec — `assets/review.js` + `assets/review.css`

The review layer turns the static plan page into a reviewable document. It is a self-contained script that mounts onto the page and talks to Supabase over REST with the publishable key. No framework, no build step, no bundler. Plain ES2020, one IIFE, loaded with `<script defer src="assets/config.js"></script><script defer src="assets/review.js"></script>` at the end of `index.html`.

## Page contract the layer relies on

- Every commentable block is an element with `data-block="<stable-kebab-id>"` (paragraphs, list items, callouts, quotes). IDs are unique and never change once published.
- Blocks live inside `<section id="<section-id>" data-section-title="Human title">` elements.
- Stance targets: `<div class="stance" data-stance="<idea-id>" data-stance-title="Human title"></div>` empty mounts. The layer fills them.
- Mounts: `#review-identity` (in the sticky bar, gets the "Reviewing as" chip), `#review-tutorial` (gets the animated how-to), `#review-general` (gets the general notes box and list), `#review-reviewers` (optional; gets "Reviewed so far: names").
- `window.SECRET_CLOUD_CONFIG` from `assets/config.js`: `{ supabaseUrl, supabaseKey, siteVersion, tables: { visits, notes, stances } }`.
- Design tokens from `docs/DESIGN-BRIEF.md`. `review.css` consumes them with fallbacks. Z-index: page uses < 50; the layer uses 100 (marks/pills), 200 (popovers/drawer), 300 (gate), 400 (toasts).

## Identity gate

- On load: read `localStorage["sc.reviewer"]` (JSON `{first,last,clientId}`), wrapped in try/catch. If present, skip the gate and render the chip. If absent, show the gate: a full-screen modal over the page (page still renders behind it, blurred/dimmed), with the wordmark, one line of why ("Your name is stamped on every note and vote you leave, so Claude knows whose it is when the build starts"), First name, Last name (both required, trimmed, 1 to 60 chars, show inline validation), and a "Continue" button. Enter submits.
- On continue: save to localStorage, generate `clientId` (random 16-hex) once, insert a row into `visits` (`reviewer_first, reviewer_last, reviewer_key, client_id, site_version`), then show step two of the gate: the tutorial ("Here's how to leave your marks") with a "Got it, let me read" button. Step two also appears inside `#review-tutorial` permanently.
- `reviewer_key` = lowercase first + single space + lowercase last, whitespace collapsed, diacritics left as typed.
- Chip in `#review-identity`: "Reviewing as **Israel H.**" (first name + last initial) with a small "switch" action that clears storage and reopens the gate. The chip is a `<button>`.
- A visit row is inserted once per browser per day (store the last visit date).

## Highlight to note

- Listen for `selectionchange` (debounced ~150 ms) and `pointerup`/`keyup` on the document. When the selection is non-collapsed and both ends are inside the same `[data-block]`, show a floating pill button "Leave a note" (with a small pen/pin glyph) above the selection's bounding rect, clamped to the viewport, offset for `env(safe-area-inset-*)`. On viewports under 640px wide, show the pill as a fixed bar at the bottom instead.
- If the selection spans more than one block, show a small hint pill "Highlight inside one paragraph" that disappears on the next selection change. If the selection is inside the review layer's own UI, ignore it.
- Clicking the pill opens the composer popover anchored to the selection (on phones: a bottom sheet): the quoted text in a styled quote (truncate display at 240 chars with an ellipsis, keep full quote in data up to 1500), a textarea with placeholder "What do you think about this part?", "Save note" and "Cancel". Escape and clicking outside cancel. The selection must stay visually indicated while the composer is open; capture the anchor data at pill-click time so losing the native selection does not matter.
- Anchor data: `block_id`, `start_offset`, `end_offset` (character offsets into the block's `textContent`, computed by walking text nodes), `quote` (the exact selected text), `prefix` (up to 32 chars before), `suffix` (up to 32 chars after).
- Save: POST to `notes` with `kind: "highlight"`, section_id, block_id, offsets, quote, prefix, suffix, body (trimmed, 1 to 4000), reviewer fields, client_id, site_version. Header `Prefer: return=representation`. On success: render the mark, add to the drawer, toast "Note saved". On failure: toast "Couldn't save your note. Check your connection and try again." and keep the composer open with the text intact.

## Re-anchoring on load

For each highlight note: find the block by id. If `block.textContent.slice(start, end) === quote`, use those offsets. Else search for `quote` in the text; if multiple matches, pick the one whose surrounding text best matches prefix/suffix. If not found, mark the note as orphaned (show it in the drawer with an "(text changed)" tag and no mark). Never throw; one bad note must not break rendering.

## Marks

- Wrap each text-node intersection of `[start, end)` in `<mark class="sc-mark" data-note="<id>">`. Works across inline elements (`<em>`, `<a>`) because it operates per text node. Overlapping notes nest marks; use `--mark` background with `mix-blend-mode: multiply` in light and plain alpha in dark so overlaps darken slightly.
- Marks are `cursor: pointer`, `tabindex="0"`, `role="button"`, `aria-label="Note by {name}"`. Click/Enter opens the thread popover for that note; if the click lands on nested marks, open the innermost and offer "N other notes here" links.
- The mark for the note that is open gets `--mark-hot`.

## Thread popover

- Shows the quote (short), the root note: name (first + last initial, DM Mono), relative time ("4 min ago", "yesterday", else date), body (preserve line breaks with `white-space: pre-wrap`), then replies in order, then a reply box ("Reply" button posts `kind: "reply"` with `parent_id` and the same block/section ids).
- "Remove" appears only on notes whose `reviewer_key` equals the current reviewer's. Clicking asks inline ("Remove this note? Remove / Keep"), then PATCH `{deleted_at: now}` on that id. Removing a root note hides its replies too.
- All user-provided strings are set via `textContent` or `createTextNode`. Never `innerHTML` with data.

## Section notes and general notes

- Each section gets, after its header, a small mono link "Add a note to this section" (inject it; the page leaves no mount for this). Opens the composer with no quote, `kind: "section"`.
- `#review-general` gets a box titled "Anything else?" with a textarea and "Save note" (`kind: "general"`), plus the list of general notes beneath it, newest first.

## Stances (votes)

- Each `[data-stance]` mount gets three toggle buttons: "Yes, build it", "Maybe", "Cut it", plus a tally line listing names per stance ("Yes: Israel H., Sam T. · Maybe: …"). Your current stance is filled in. Clicking the same one again clears it (insert `stance: "clear"`). Each click inserts a row; the latest row per (target_id, reviewer_key) wins when reading. Optimistic UI, revert and toast on failure.

## Drawer

- Floating button bottom-right "Notes · N" (N = visible notes including section and general, excluding replies). Offsets include `env(safe-area-inset-bottom/right)`. Opens a drawer: right side 380px on desktop, bottom sheet (85vh) on phones.
- Contents: filter chips by reviewer (built from the notes' names), then notes grouped by section in page order (General last). Each entry: name, time, quote (if any, truncated), body, reply count. Clicking an entry closes the drawer, scrolls the mark/section into view, and flashes it (`--mark-hot` for 1.5 s). Orphaned notes show the "(text changed)" tag.
- "Reviewed so far: names" from distinct visits (in the drawer header, and in `#review-reviewers` if present).

## Data loading

- On boot: GET notes (`select=*&deleted_at=is.null&order=created_at.asc`), stances (`select=*&order=created_at.desc`), visits (`select=reviewer_first,reviewer_last,reviewer_key,created_at&order=created_at.desc&limit=500`). Render after all three resolve (Promise.allSettled; render what succeeded).
- Refresh notes and stances on `visibilitychange` to visible and every 60 s while visible. Merge by id; never duplicate marks (clear and re-render marks from state).
- Requests: `fetch(url + "/rest/v1/" + table + query, { headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", Prefer: ... } })`. Timeout at 12 s with AbortController. Surface errors as toasts, never alerts.

## Tutorial component (`#review-tutorial` and gate step two)

A looping demo, about 7 s per cycle, built in HTML/CSS (no canvas): a mini paragraph of real copy from the plan; (1) a cursor/finger glyph sweeps across a sentence and a highlight grows under it; (2) the "Leave a note" pill pops in above; (3) a small note card slides in with "Israel H. · just now" and a one-line body, and the highlight settles into a saved mark. Three captioned steps next to it: "Highlight any words", "Tap Leave a note", "Write and save. Your name is stamped on it." Under `prefers-reduced-motion`, show the three steps as a static strip with the end state drawn. Also include one line: "Vote on each idea with Yes / Maybe / Cut it, and open Notes at the bottom right to see everyone's."

## Toasts and errors

A small stack bottom-center. Copy says what happened and what to do. No `alert`, `confirm`, or `prompt`.

## Accessibility

Gate traps focus; Escape does nothing on the gate (name is required) but closes popovers and the drawer. Popover and drawer have `role="dialog"` with labels. Buttons are buttons. Marks are focusable. Contrast meets AA in both themes using the tokens.

## Test page

Also write `dev/engine-test.html`: a plain page with three sections, ten `[data-block]` paragraphs (some with inline `<em>` and `<a>`), two stance mounts, and the mounts above, loading the same config and script. Use it to verify everything end to end against the real Supabase tables. Test rows must use `site_version: "test"` so they can be purged.
