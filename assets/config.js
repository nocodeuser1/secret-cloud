// Public configuration for the Secret Cloud plan site.
// The key below is Supabase's publishable (anon) key: it is meant to ship to browsers.
// What it can do is limited by row-level security on the secret_cloud_* tables
// (read, insert, and soft-delete notes and images only) and by the storage policy on the
// design bucket (new files under uploads/ only, images up to 10 MB, no overwrites). See supabase/migrations.
window.SECRET_CLOUD_CONFIG = {
  supabaseUrl: "https://odcgntoecxmihaovxazf.supabase.co",
  supabaseKey: "sb_publishable_TlFC5WKJwO1qEpljbe6fKg_SuDixWA-",
  siteVersion: "2026.10.26",
  tables: {
    visits: "secret_cloud_visits",
    notes: "secret_cloud_notes",
    stances: "secret_cloud_stances",
    images: "secret_cloud_images",
  },
  storage: {
    images: "secret-cloud-design",
  },
};
