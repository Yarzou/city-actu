-- liquibase formatted sql

-- changeset ville-actu:007-import-summaries
-- comment: Table de stockage des résumés IA générés après chaque refresh ou à la demande
CREATE TABLE IF NOT EXISTS import_summaries (
  id            SERIAL PRIMARY KEY,
  city_id       INT REFERENCES cities(id) ON DELETE SET NULL,
  summary_text  TEXT        NOT NULL,
  articles_count INT        NOT NULL DEFAULT 0,
  source        TEXT        NOT NULL DEFAULT 'refresh',  -- 'refresh' | 'on_demand'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE import_summaries ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs authentifiés peuvent lire les résumés
CREATE POLICY "import_summaries_read_auth"
  ON import_summaries FOR SELECT
  TO authenticated
  USING (true);

-- rollback DROP POLICY IF EXISTS "import_summaries_read_auth" ON import_summaries;
-- rollback DROP TABLE IF EXISTS import_summaries;
