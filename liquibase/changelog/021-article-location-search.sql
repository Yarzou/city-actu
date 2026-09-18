-- liquibase formatted sql

-- changeset ville-actu:021-article-location-search splitStatements:false
-- comment: Colonne normalisée de recherche sur le lieu — sans elle, cliquer « Oudon » sur une carte ne remonterait que les articles dont le titre ou la description contient ce mot, pas ceux qui s'y déroulent.

-- Même recette que 010 (title_search / content_preview_search) : la colonne est
-- GENERATED, donc toujours synchrone avec `location`, y compris après un refresh du
-- cron — `location` fait partie de la liste blanche REFRESHABLE.
--
-- Une colonne générée et non un `ilike` direct sur `location` : le terme saisi est
-- désaccentué côté client par `normalizeSearchText`, alors que la valeur stockée ne
-- l'est pas (« Saint-Géréon », « Chaumes-en-Retz »). Comparer les deux raterait
-- toutes les communes accentuées.
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS location_search TEXT GENERATED ALWAYS AS (normalize_search_text(location)) STORED;

-- GIN trigram comme les deux autres : la recherche du feed est un `ilike %motif%`,
-- non ancré, qu'un index B-tree ne peut pas servir.
CREATE INDEX IF NOT EXISTS articles_location_search_trgm_idx
  ON articles USING GIN (location_search gin_trgm_ops);

-- rollback DROP INDEX IF EXISTS articles_location_search_trgm_idx;
-- rollback ALTER TABLE articles DROP COLUMN IF EXISTS location_search;
