
INSERT INTO storage.buckets (id, name, public)
VALUES ('app-assets', 'app-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public read for the bucket
CREATE POLICY "Public read app-assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'app-assets');
