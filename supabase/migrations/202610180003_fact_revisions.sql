CREATE TABLE fact_revisions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX fact_revisions_workspace_idx ON fact_revisions(workspace_id,created_at DESC);
ALTER TABLE fact_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_read ON fact_revisions FOR SELECT TO authenticated USING(is_workspace_member(workspace_id));
GRANT SELECT ON fact_revisions TO authenticated;
