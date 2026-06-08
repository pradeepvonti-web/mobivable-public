
-- Storage policies for app-assets bucket
CREATE POLICY "app_assets_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'app-assets');

CREATE POLICY "app_assets_auth_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'app-assets' AND owner = auth.uid());

CREATE POLICY "app_assets_owner_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'app-assets' AND owner = auth.uid())
WITH CHECK (bucket_id = 'app-assets' AND owner = auth.uid());

CREATE POLICY "app_assets_owner_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'app-assets' AND owner = auth.uid());

-- Realtime: restrict broadcast/presence to authenticated users
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_can_use_realtime"
ON realtime.messages FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "authenticated_can_send_realtime"
ON realtime.messages FOR INSERT
TO authenticated
WITH CHECK (true);
