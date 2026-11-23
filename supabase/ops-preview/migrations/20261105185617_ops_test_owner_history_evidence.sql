-- OliPoly ERP Test only. File uploads and document links are staged separately.
BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ops-history-pdfs', 'ops-history-pdfs', false, 10485760, ARRAY['application/pdf']);

CREATE TABLE ops_history.documents (
  owner_id uuid NOT NULL,
  source_key text NOT NULL,
  document_id uuid NOT NULL DEFAULT gen_random_uuid(),
  file_name text NOT NULL CHECK (length(btrim(file_name)) BETWEEN 1 AND 160),
  object_name text GENERATED ALWAYS AS (owner_id::text || '/' || document_id::text || '.pdf') STORED,
  PRIMARY KEY (owner_id, document_id),
  UNIQUE (object_name),
  FOREIGN KEY (owner_id, source_key) REFERENCES ops_history.records
);

CREATE INDEX ops_history_document_source ON ops_history.documents (owner_id, source_key);
ALTER TABLE ops_history.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY ops_history_documents_owner_read ON ops_history.documents
  FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));
REVOKE ALL ON ops_history.documents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON ops_history.documents TO authenticated;

CREATE POLICY ops_history_pdf_owner_download ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'ops-history-pdfs' AND EXISTS (
      SELECT 1 FROM ops_history.documents d
      WHERE d.owner_id = (SELECT auth.uid()) AND d.object_name = objects.name
    )
  );

CREATE FUNCTION public.ops_preview_history_with_documents(p_reference text)
RETURNS TABLE (
  source_key text,
  matched_reference text,
  record_type text,
  archived_status text,
  related_order text,
  evidence text[],
  open_issues text[],
  documents jsonb
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT r.*, COALESCE((
    SELECT jsonb_agg(jsonb_build_object('file_name', d.file_name, 'object_name', d.object_name)
      ORDER BY d.file_name, d.document_id)
    FROM ops_history.documents d
    WHERE d.owner_id = (SELECT auth.uid()) AND d.source_key = r.source_key
  ), '[]'::jsonb)
  FROM public.ops_preview_history_lookup(p_reference) r
$$;

REVOKE ALL ON FUNCTION public.ops_preview_history_with_documents(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_preview_history_with_documents(text) TO authenticated;

COMMIT;
