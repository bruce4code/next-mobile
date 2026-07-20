INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'knowledge-sources',
  'knowledge-sources',
  false,
  1048576,
  ARRAY['text/plain', 'text/markdown']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "knowledge source owners can read" ON storage.objects;
DROP POLICY IF EXISTS "knowledge source owners can create" ON storage.objects;
DROP POLICY IF EXISTS "knowledge source owners can update" ON storage.objects;
DROP POLICY IF EXISTS "knowledge source owners can delete" ON storage.objects;

CREATE POLICY "knowledge source owners can read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'knowledge-sources'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "knowledge source owners can create"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'knowledge-sources'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "knowledge source owners can update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'knowledge-sources'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'knowledge-sources'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "knowledge source owners can delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'knowledge-sources'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
