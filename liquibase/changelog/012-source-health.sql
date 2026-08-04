-- liquibase formatted sql

-- changeset ville-actu:012-source-health
-- comment: Santé des sources — une source cassée échouait en silence (log console uniquement)

ALTER TABLE sources ADD COLUMN IF NOT EXISTS last_fetch_at        TIMESTAMPTZ;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS last_fetch_status    TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS last_fetch_error     TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0;

-- Note : sources est en lecture publique (policy "Public read sources"), donc last_fetch_error
-- est lisible par tous — n'y stocker que le message d'erreur, jamais d'URL signée ni de token.

-- rollback ALTER TABLE sources DROP COLUMN IF EXISTS consecutive_failures;
-- rollback ALTER TABLE sources DROP COLUMN IF EXISTS last_fetch_error;
-- rollback ALTER TABLE sources DROP COLUMN IF EXISTS last_fetch_status;
-- rollback ALTER TABLE sources DROP COLUMN IF EXISTS last_fetch_at;
