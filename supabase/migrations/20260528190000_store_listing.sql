-- App Store / Play Console listing — per-project metadata + asset URLs.
--
-- Stored as a single jsonb column so we can extend without migration
-- churn (this listing schema will drift as Apple/Google change their
-- App Store Connect / Play Console requirements every six months).
--
-- Shape (informally — validated client-side):
--   {
--     "title": "Lemonade",
--     "subtitle": "Refresh your day.",
--     "description": "...",
--     "keywords": ["citrus", "summer", ...],
--     "primary_category": "Food & Drink",
--     "secondary_category": "Lifestyle",
--     "age_rating": "4+",
--     "support_url": "https://...",
--     "marketing_url": "https://...",
--     "privacy_policy_url": "https://...",
--     "whats_new": "Initial release.",
--     "icon_url": "https://...supabase.../project-attachments/.../icon.png",
--     "screenshots": [
--       { "device": "iphone_6_7", "url": "...", "ordinal": 0 },
--       { "device": "android_phone", "url": "...", "ordinal": 0 }
--     ]
--   }
--
-- The Expo exporter reads this column at zip time, downloads the icon
-- into `assets/icon.png`, sets `expo.icon` in app.json, and writes a
-- `store/listing.json` the user can paste into App Store Connect / Play
-- Console (and that a future eas-submit flow will consume directly).

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS store_listing jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_store_listing_is_object;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_store_listing_is_object
  CHECK (jsonb_typeof(store_listing) = 'object');
