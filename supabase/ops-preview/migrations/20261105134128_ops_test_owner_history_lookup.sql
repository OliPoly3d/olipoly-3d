-- OliPoly ERP Test only. Archive summaries are loaded by a separate reviewed import.
BEGIN;

CREATE SCHEMA ops_history;
REVOKE ALL ON SCHEMA ops_history FROM PUBLIC, anon, authenticated;

CREATE TABLE ops_history.records (
  owner_id uuid NOT NULL,
  source_key text NOT NULL,
  record_type text NOT NULL,
  archived_status text NOT NULL,
  related_order text,
  evidence text[] NOT NULL DEFAULT '{}',
  open_issues text[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (owner_id, source_key)
);

CREATE TABLE ops_history.references (
  owner_id uuid NOT NULL,
  source_key text NOT NULL,
  literal_reference text NOT NULL CHECK (length(btrim(literal_reference)) BETWEEN 1 AND 128),
  reference_key text GENERATED ALWAYS AS (upper(btrim(literal_reference))) STORED,
  PRIMARY KEY (owner_id, source_key, reference_key),
  FOREIGN KEY (owner_id, source_key) REFERENCES ops_history.records
);

CREATE INDEX ops_history_exact_reference ON ops_history.references (owner_id, reference_key);

ALTER TABLE ops_history.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_history.references ENABLE ROW LEVEL SECURITY;
CREATE POLICY ops_history_owner_read ON ops_history.records
  FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));
CREATE POLICY ops_history_owner_read ON ops_history.references
  FOR SELECT TO authenticated USING (owner_id = (SELECT auth.uid()));

REVOKE ALL ON ALL TABLES IN SCHEMA ops_history FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA ops_history TO authenticated;
GRANT SELECT ON ops_history.records, ops_history.references TO authenticated;

CREATE FUNCTION public.ops_preview_history_lookup(p_reference text)
RETURNS TABLE (
  source_key text,
  matched_reference text,
  record_type text,
  archived_status text,
  related_order text,
  evidence text[],
  open_issues text[]
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT r.source_key, i.literal_reference, r.record_type, r.archived_status,
    r.related_order, r.evidence, r.open_issues
  FROM ops_history.references i
  JOIN ops_history.records r USING (owner_id, source_key)
  WHERE i.owner_id = (SELECT auth.uid())
    AND length(btrim(p_reference)) BETWEEN 1 AND 128
    AND i.reference_key = upper(btrim(p_reference))
  ORDER BY r.source_key
$$;

REVOKE ALL ON FUNCTION public.ops_preview_history_lookup(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_preview_history_lookup(text) TO authenticated;

COMMIT;
