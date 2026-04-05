-- Create vault_documents table
CREATE TABLE IF NOT EXISTS vault_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  trainer_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name        text NOT NULL,
  file_url    text NOT NULL,
  file_type   text,
  file_size   bigint,
  is_shared   boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE vault_documents ENABLE ROW LEVEL SECURITY;

-- Trainer full access
CREATE POLICY "Trainer manages vault documents"
  ON vault_documents
  USING (trainer_id = auth.uid())
  WITH CHECK (trainer_id = auth.uid());

-- Client reads shared documents only
CREATE POLICY "Client reads shared vault documents"
  ON vault_documents FOR SELECT
  USING (
    is_shared = true AND
    EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = vault_documents.client_id
        AND c.profile_id = auth.uid()
    )
  );

-- Create vault storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('vault', 'vault', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Trainer uploads vault files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'vault');

CREATE POLICY "Public reads vault files"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'vault');

CREATE POLICY "Trainer deletes vault files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'vault');
