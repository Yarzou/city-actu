-- liquibase formatted sql

-- changeset ville-actu:010-article-search-normalization splitStatements:false
-- comment: Colonnes normalisées pour recherche d'articles insensible aux accents/casse
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION normalize_search_text(input TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(
    regexp_replace(
      unaccent(lower(coalesce(input, ''))),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS title_search TEXT GENERATED ALWAYS AS (normalize_search_text(title)) STORED,
  ADD COLUMN IF NOT EXISTS content_preview_search TEXT GENERATED ALWAYS AS (normalize_search_text(content_preview)) STORED;

CREATE INDEX IF NOT EXISTS articles_title_search_trgm_idx
  ON articles USING GIN (title_search gin_trgm_ops);

CREATE INDEX IF NOT EXISTS articles_content_preview_search_trgm_idx
  ON articles USING GIN (content_preview_search gin_trgm_ops);

-- rollback DROP INDEX IF EXISTS articles_content_preview_search_trgm_idx;
-- rollback DROP INDEX IF EXISTS articles_title_search_trgm_idx;
-- rollback ALTER TABLE articles DROP COLUMN IF EXISTS content_preview_search;
-- rollback ALTER TABLE articles DROP COLUMN IF EXISTS title_search;
-- rollback DROP FUNCTION IF EXISTS normalize_search_text(TEXT);
