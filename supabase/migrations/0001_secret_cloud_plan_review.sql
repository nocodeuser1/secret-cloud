-- Secret Cloud plan-review tables (applied to the ad-labs Supabase project on 2026-10-26).
-- Written by anonymous reviewers from the plan site (GitHub Pages) using the
-- publishable key. Names are self-declared; there is no auth. Tables are
-- append-only except that a note may be soft-deleted (deleted_at set once).

create table public.secret_cloud_visits (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  reviewer_first text not null check (char_length(reviewer_first) between 1 and 60),
  reviewer_last text not null check (char_length(reviewer_last) between 1 and 60),
  reviewer_key text not null check (char_length(reviewer_key) between 1 and 130),
  client_id text check (char_length(client_id) <= 80),
  site_version text check (char_length(site_version) <= 40)
);
create index secret_cloud_visits_created_at_idx on public.secret_cloud_visits (created_at);

create table public.secret_cloud_notes (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  reviewer_first text not null check (char_length(reviewer_first) between 1 and 60),
  reviewer_last text not null check (char_length(reviewer_last) between 1 and 60),
  reviewer_key text not null check (char_length(reviewer_key) between 1 and 130),
  kind text not null check (kind in ('highlight', 'section', 'general', 'reply')),
  section_id text check (char_length(section_id) <= 80),
  block_id text check (char_length(block_id) <= 80),
  quote text check (char_length(quote) <= 1500),
  prefix text check (char_length(prefix) <= 80),
  suffix text check (char_length(suffix) <= 80),
  start_offset integer check (start_offset >= 0),
  end_offset integer check (end_offset >= 0),
  body text not null check (char_length(body) between 1 and 4000),
  parent_id bigint references public.secret_cloud_notes (id) on delete cascade,
  client_id text check (char_length(client_id) <= 80),
  site_version text check (char_length(site_version) <= 40)
);
create index secret_cloud_notes_created_at_idx on public.secret_cloud_notes (created_at);
create index secret_cloud_notes_parent_id_idx on public.secret_cloud_notes (parent_id);
create index secret_cloud_notes_block_id_idx on public.secret_cloud_notes (block_id);

create table public.secret_cloud_stances (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  reviewer_first text not null check (char_length(reviewer_first) between 1 and 60),
  reviewer_last text not null check (char_length(reviewer_last) between 1 and 60),
  reviewer_key text not null check (char_length(reviewer_key) between 1 and 130),
  target_id text not null check (char_length(target_id) <= 80),
  stance text not null check (stance in ('yes', 'maybe', 'cut', 'clear')),
  client_id text check (char_length(client_id) <= 80),
  site_version text check (char_length(site_version) <= 40)
);
create index secret_cloud_stances_target_idx
  on public.secret_cloud_stances (target_id, reviewer_key, created_at desc);

alter table public.secret_cloud_visits enable row level security;
alter table public.secret_cloud_notes enable row level security;
alter table public.secret_cloud_stances enable row level security;

create policy secret_cloud_visits_select on public.secret_cloud_visits
  for select to anon, authenticated using (true);
create policy secret_cloud_visits_insert on public.secret_cloud_visits
  for insert to anon, authenticated with check (true);

create policy secret_cloud_notes_select on public.secret_cloud_notes
  for select to anon, authenticated using (true);
create policy secret_cloud_notes_insert on public.secret_cloud_notes
  for insert to anon, authenticated with check (deleted_at is null);
create policy secret_cloud_notes_soft_delete on public.secret_cloud_notes
  for update to anon, authenticated
  using (deleted_at is null)
  with check (deleted_at is not null);

create policy secret_cloud_stances_select on public.secret_cloud_stances
  for select to anon, authenticated using (true);
create policy secret_cloud_stances_insert on public.secret_cloud_stances
  for insert to anon, authenticated with check (true);

-- An update may only set deleted_at; every other column must stay the same.
create or replace function public.secret_cloud_notes_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'deleted_at') is distinct from (to_jsonb(old) - 'deleted_at') then
    raise exception 'Only deleted_at may change on secret_cloud_notes';
  end if;
  return new;
end;
$$;

create trigger secret_cloud_notes_guard_update
  before update on public.secret_cloud_notes
  for each row execute function public.secret_cloud_notes_guard_update();
