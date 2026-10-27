# Reading the notes back

Everything reviewers leave on the plan site lands in three tables in the Supabase project **ad-labs** (`odcgntoecxmihaovxazf`): `secret_cloud_notes`, `secret_cloud_stances`, `secret_cloud_visits`. Each row carries the reviewer's first and last name, a `reviewer_key` (lowercase "first last"), a timestamp, and `site_version`.

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

## Purging test rows

```sql
delete from public.secret_cloud_stances where site_version = 'test';
delete from public.secret_cloud_notes   where site_version = 'test';
delete from public.secret_cloud_visits  where site_version = 'test';
```

(Only the service role can delete; the site's publishable key cannot.)

## Running the site locally

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

Then open http://127.0.0.1:4173/. The page talks to the live tables, so use a name like "Test Reviewer" and expect your rows to show up for everyone until purged. `dev/engine-test.html` exercises the review layer on a plain page.

## How anchors work

A highlight note stores the block id, character offsets into that block's text, the quoted text, and a little context before and after. On load the site re-finds the quote by offsets first, then by searching for the quote with its context. If the copy of a block changes enough that the quote cannot be found, the note still appears in the Notes drawer tagged "(text changed)". So: editing copy is fine, but never change a `data-block` id.
