-- Applied to ad-labs (odcgntoecxmihaovxazf) as migration secret_cloud_design_images, 2026-10-28.
-- Public bucket for design-direction reference images (read by anyone with the URL, upload by the site's anon key).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('secret-cloud-design', 'secret-cloud-design', true, 10485760,
        array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Uploads only into this bucket, only under uploads/, never overwrite (no update/delete policies).
create policy secret_cloud_design_upload on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'secret-cloud-design' and (storage.foldername(name))[1] = 'uploads');

-- Metadata, append-only like the notes table, with soft delete.
create table public.secret_cloud_images (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  reviewer_first text not null check (char_length(reviewer_first) between 1 and 60),
  reviewer_last text not null check (char_length(reviewer_last) between 1 and 60),
  reviewer_key text not null check (char_length(reviewer_key) between 1 and 130),
  client_id text check (char_length(client_id) <= 64),
  site_version text check (char_length(site_version) <= 40),
  target_id text not null check (char_length(target_id) between 1 and 80),
  storage_path text not null check (storage_path ~ '^uploads/[A-Za-z0-9._/-]{1,200}$'),
  caption text check (char_length(caption) <= 500),
  width int check (width between 1 and 20000),
  height int check (height between 1 and 20000)
);
create index secret_cloud_images_target_idx on public.secret_cloud_images (target_id, created_at);
create index secret_cloud_images_created_idx on public.secret_cloud_images (created_at);

alter table public.secret_cloud_images enable row level security;
create policy secret_cloud_images_read on public.secret_cloud_images for select to anon, authenticated using (true);
create policy secret_cloud_images_insert on public.secret_cloud_images for insert to anon, authenticated with check (deleted_at is null);
create policy secret_cloud_images_soft_delete on public.secret_cloud_images for update to anon, authenticated
  using (deleted_at is null) with check (deleted_at is not null);

create or replace function public.secret_cloud_images_guard_update() returns trigger language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - 'deleted_at') is distinct from (to_jsonb(old) - 'deleted_at') then
    raise exception 'Only deleted_at may change on secret_cloud_images';
  end if;
  return new;
end; $$;
create trigger secret_cloud_images_guard_update before update on public.secret_cloud_images
  for each row execute function public.secret_cloud_images_guard_update();

grant select, insert, update on public.secret_cloud_images to anon, authenticated;
