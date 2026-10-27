# The Secret Cloud

A plan and vision site for **The Secret Cloud**: a walk-in sound experience you find by following your ears through a real place, and secret live shows you find by scanning a sign. Written as a zine the group can read, highlight, and argue with.

**Live site:** https://nocodeuser1.github.io/secret-cloud/

Anyone who opens it enters a first and last name once. From then on every highlighted note, section note, and vote they leave is stamped with that name, so the build can start from what the group actually said.

## What's here

| path | what |
|---|---|
| `index.html` | the plan site (static, no build step) |
| `assets/site.css` | the design: tokens, type, grain, rings, both themes |
| `assets/review.js`, `assets/review.css` | the review layer: name gate, highlight-to-note, replies, votes, the Notes drawer, the how-to animation |
| `assets/config.js` | Supabase URL, publishable key, table names |
| `content/plan.json` | the copy, block by block, with stable ids (source of truth) |
| `content/PLAN.md` | the same plan as plain markdown |
| `content/drafts/` | the three angle drafts the plan was synthesized from |
| `docs/BRAINSTORM-DIGEST.md` | what was said on the call, condensed |
| `docs/DESIGN-BRIEF.md` | the visual direction |
| `docs/REVIEW-LAYER-SPEC.md` | how the review layer behaves and the page contract it relies on |
| `docs/REVIEW-GUIDE.md` | how to read the notes and votes back out of Supabase |
| `supabase/migrations/` | the schema and row-level security for the notes tables |
| `dev/` | `build-page.mjs` (renders `index.html` from `plan.json`), `render-check.mjs` (verifies they agree), and `engine-test.html` (a bare page for testing the review layer) |

## Where the notes live

Supabase project `ad-labs`, tables `secret_cloud_notes`, `secret_cloud_stances`, `secret_cloud_visits`. The key shipped in `assets/config.js` is a publishable key; row-level security limits it to reading, inserting, and soft-deleting notes. See `docs/REVIEW-GUIDE.md` for the queries.

## Editing the plan

`index.html` is generated. Edit copy in `content/plan.json`, then run:

```bash
node dev/build-page.mjs && node dev/render-check.mjs
```

Keep every block `id` as it is; notes are anchored to them. Add new paragraphs with new ids. Layout and microcopy (diagram labels, captions, stance titles) live in `dev/build-page.mjs`. Mirror copy changes in `content/PLAN.md`.

## Local preview

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```
