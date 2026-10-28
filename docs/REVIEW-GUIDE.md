# Reading the notes back

Everything reviewers leave on the plan site lands in the Supabase project **ad-labs** (`odcgntoecxmihaovxazf`): notes, votes and visits in `secret_cloud_notes`, `secret_cloud_stances`, `secret_cloud_visits`, and shared images in `secret_cloud_images` (files in the storage bucket `secret-cloud-design`). Each row carries the reviewer's first and last name, a `reviewer_key` (lowercase "first last"), a timestamp, and `site_version`.

Rows with `site_version = 'test'` are test data and can be ignored or purged.

## Who has reviewed

```sql
select reviewer_first, reviewer_last, min(created_at) as first_seen, count(*) as visits
from public.secret_cloud_visits
where site_version <> 'test'
group by 1, 2
order by first_seen;
```

## Notes, in page order, with the text they point at

```sql
select n.id, n.created_at, n.reviewer_first, n.reviewer_last, n.kind,
       n.section_id, n.block_id, left(n.quote, 120) as quote, n.body, n.parent_id
from public.secret_cloud_notes n
where n.deleted_at is null and coalesce(n.site_version, '') <> 'test'
order by n.section_id, n.block_id, n.created_at;
```

`kind` is `highlight` (anchored to a selection inside one block), `section` (a whole section), `general` (the box at the bottom), or `reply` (its `parent_id` points at the note it answers). When a reviewer removes a root note, only that row gets `deleted_at`; its replies stay as they are and the site hides them. Skip replies whose parent is deleted:

```sql
select r.* from public.secret_cloud_notes r
join public.secret_cloud_notes p on p.id = r.parent_id
where r.kind = 'reply' and r.deleted_at is null and p.deleted_at is null;
``` `block_id` matches the `data-block` attribute in `index.html` and the block `id` in `content/plan.json`.

## Votes (latest stance per person per idea)

```sql
select distinct on (target_id, reviewer_key)
       target_id, reviewer_first, reviewer_last, stance, created_at
from public.secret_cloud_stances
where coalesce(site_version, '') <> 'test'
order by target_id, reviewer_key, created_at desc;
```

Then tally, ignoring `clear`:

```sql
with latest as (
  select distinct on (target_id, reviewer_key) target_id, reviewer_key, stance
  from public.secret_cloud_stances
  where coalesce(site_version, '') <> 'test'
  order by target_id, reviewer_key, created_at desc
)
select target_id,
       count(*) filter (where stance = 'yes')   as yes,
       count(*) filter (where stance = 'maybe') as maybe,
       count(*) filter (where stance = 'cut')   as cut
from latest
group by target_id
order by target_id;
```

Stance ids: `pillar-1..5` (the vision pillars), `trail-a..l` (rabbit trails), `phase-0..3` (build phases), `q-1..10` (open questions).

Design stance ids: `design-<call>-<option>`, one per option on the five design calls. The buttons on those read Love it / Maybe / Not this, stored as `yes` / `maybe` / `cut` like every other vote.

| call | where on the page | stance ids |
|---|---|---|
| `look` | Vision, after the intro (block `vision-design-look`) | `design-look-riso`, `design-look-night-walk`, `design-look-field-kit`, `design-look-kingdom-glass` |
| `drop` | Vision, after the rings diagram (`vision-design-drop`) | `design-drop-rings`, `design-drop-glow`, `design-drop-hidden`, `design-drop-inked` |
| `invite` | Vision, end of the band account pillar (`vision-design-invite`) | `design-invite-stub`, `design-invite-note`, `design-invite-black`, `design-invite-photo` |
| `first` | Vision, after the walk (`vision-design-first`) | `design-first-ring`, `design-first-map`, `design-first-words`, `design-first-dark` |
| `mark` | Questions, after question 10 (`questions-design-mark`) | `design-mark-rings`, `design-mark-rabbit`, `design-mark-keyhole`, `design-mark-wordmark` |

Design votes by person (latest stance each, with the button words they saw):

```sql
with latest as (
  select distinct on (target_id, reviewer_key)
         target_id, reviewer_key, reviewer_first, reviewer_last, stance, created_at
  from public.secret_cloud_stances
  where target_id like 'design-%' and coalesce(site_version, '') <> 'test'
  order by target_id, reviewer_key, created_at desc
)
select reviewer_first, reviewer_last,
       split_part(target_id, '-', 2) as call,
       substring(target_id from '^design-[a-z]+-(.*)$') as option,
       case stance when 'yes' then 'Love it' when 'maybe' then 'Maybe' when 'cut' then 'Not this' end as vote,
       created_at
from latest
where stance <> 'clear'
order by reviewer_last, reviewer_first, call, option;
```

Notes on a design option anchor to its text block (`<call block id>-<option>`, for example `vision-design-look-night-walk`); notes on the call's intro anchor to the call block itself.

## Images (design references and the moodboard)

Images people share land in two places: the file in the public storage bucket **`secret-cloud-design`** (always under `uploads/YYYY-MM/<client id>-<random>.<ext>`), and a row in `public.secret_cloud_images` that says who shared it, for which call, and with what caption. `target_id` is the design card's id, or `moodboard` for the block at the bottom of Your turn:

| `target_id` | where on the page |
|---|---|
| `vision-design-look` | The look of the whole thing |
| `vision-design-drop` | How a drop shows on the map |
| `vision-design-invite` | The secret-show invite card |
| `vision-design-first` | The first screen |
| `questions-design-mark` | The mark on the home screen |
| `moodboard` | Moodboard, in Your turn |

Before upload the site downscales each image so its long edge is at most 2000 px and saves it as WebP (JPEG where the browser cannot write WebP); GIFs under 10 MB are kept as they are. `width` and `height` are the stored size.

Every image with its public URL, by call and person:

```sql
select i.target_id as call,
       i.reviewer_first, i.reviewer_last,
       i.created_at, i.caption, i.width, i.height,
       'https://odcgntoecxmihaovxazf.supabase.co/storage/v1/object/public/secret-cloud-design/' || i.storage_path as url
from public.secret_cloud_images i
where i.deleted_at is null and coalesce(i.site_version, '') <> 'test'
order by array_position(array['vision-design-look','vision-design-drop','vision-design-invite',
                              'vision-design-first','questions-design-mark','moodboard'], i.target_id),
         i.reviewer_last, i.reviewer_first, i.created_at;
```

How many each person shared, per call:

```sql
select reviewer_first, reviewer_last, target_id, count(*) as images
from public.secret_cloud_images
where deleted_at is null and coalesce(site_version, '') <> 'test'
group by 1, 2, 3
order by 2, 1, 3;
```

Removing an image on the site only sets `deleted_at` on its row; the file stays in the bucket. Removed images, if you want to see what was taken back:

```sql
select id, reviewer_first, reviewer_last, target_id, storage_path, deleted_at
from public.secret_cloud_images
where deleted_at is not null
order by deleted_at desc;
```

Test uploads made while checking the site use the name QA Tester. To purge them, delete the rows and then the files (the files go through the Storage page in the dashboard, or the storage API with the service role, since the site's key can only add files):

```sql
select storage_path from public.secret_cloud_images where reviewer_key = 'qa tester';
delete from public.secret_cloud_images where reviewer_key = 'qa tester' or site_version = 'test';
```

## Purging test rows

```sql
delete from public.secret_cloud_stances where site_version = 'test';
delete from public.secret_cloud_notes   where site_version = 'test';
delete from public.secret_cloud_visits  where site_version = 'test';
delete from public.secret_cloud_images  where site_version = 'test';
```

(Only the service role can delete; the site's publishable key cannot.)

## Running the site locally

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

Then open http://127.0.0.1:4173/. The page talks to the live tables, so use a name like "Test Reviewer" and expect your rows to show up for everyone until purged. `dev/engine-test.html` exercises the review layer on a plain page.

## How anchors work

A highlight note stores the block id, character offsets into that block's text, the quoted text, and a little context before and after. On load the site re-finds the quote by offsets first, then by searching for the quote with its context. If the copy of a block changes enough that the quote cannot be found, the note still appears in the Notes drawer tagged "(text changed)". So: editing copy is fine, but never change a `data-block` id.
