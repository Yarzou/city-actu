-- liquibase formatted sql

-- changeset ville-actu:013-opendata-agenda
-- comment: Nouveau type de source "opendata" (API Opendatasoft) + agenda métropolitain et flux RSS retrouvé de la mairie

-- 1. Autoriser le troisième type de source.
--    Contexte : l'agenda métropolitain est exposé en JSON par data.nantesmetropole.fr,
--    ni RSS ni HTML à scraper. Voir lib/fetchers/opendata.ts.
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_type_check;
ALTER TABLE sources ADD CONSTRAINT sources_type_check
  CHECK (type IN ('rss', 'scraping', 'opendata'));

-- 2. Agenda des événements de Nantes Métropole, filtré sur La Chapelle-sur-Erdre.
--    Licence Ouverte Etalab, aucune clé d'API, mis à jour quotidiennement.
--
--    Toute la configuration tient dans l'URL, comme pour une source RSS :
--      - code_insee=44035        → La Chapelle-sur-Erdre
--      - date >= now(days=-7)    → fenêtre glissante évaluée par Opendatasoft à chaque appel,
--                                  donc rien à réécrire avec le temps ; les 7 jours de marge
--                                  rattrapent un événement publié en retard.
--      - order_by=date           → les plus proches d'abord, la pagination (limit=100 posée
--                                  par le fetcher) ne coupe donc jamais dans l'imminent.
INSERT INTO sources (city_id, category_id, name, url, type, active)
SELECT c.id, cat.id,
       'Nantes Métropole — Agenda (Open Data)',
       'https://data.nantesmetropole.fr/api/explore/v2.1/catalog/datasets/'
         || '244400404_agenda-evenements-nantes-metropole_v2/records'
         || '?where=code_insee%3D44035%20AND%20date%20%3E%3D%20now(days%3D-7)'
         || '&order_by=date',
       'opendata', TRUE
FROM cities c, categories cat
WHERE c.slug = 'la-chapelle-sur-erdre' AND cat.slug = 'agenda'
ON CONFLICT (city_id, url) DO UPDATE
  SET type   = 'opendata',
      active = TRUE;

-- 3. Le flux RSS du site municipal existe toujours — il a seulement changé d'adresse.
--    La migration 011 avait conclu à leur disparition depuis les URLs en /flux-rss (404)
--    et basculé sur du scraping. Or /rss.xml répond bien en application/rss+xml.
--    Intérêt par rapport au scraping de /actualites : le flux porte un <pubDate>,
--    là où la liste HTML des actualités n'expose aucune date (cf. commentaire de 011)
--    et laissait donc published_at à NULL.
INSERT INTO sources (city_id, category_id, name, url, type, active)
SELECT c.id, cat.id,
       'Mairie — Actualités (RSS)',
       'https://www.lachapellesurerdre.fr/rss.xml',
       'rss', TRUE
FROM cities c, categories cat
WHERE c.slug = 'la-chapelle-sur-erdre' AND cat.slug = 'agenda'
ON CONFLICT (city_id, url) DO UPDATE
  SET type   = 'rss',
      active = TRUE;

-- 4. Désactiver le scraping des actualités, désormais redondant.
--    Désactivation et non suppression : articles.source_id est ON DELETE CASCADE,
--    un DELETE emporterait les articles déjà collectés par cette source.
--    Les deux sources pointent sur les mêmes pages node : articles.url étant UNIQUE,
--    les garder actives toutes les deux ferait gagner celle qui passe en premier —
--    autant garder celle qui a les dates.
UPDATE sources
SET active = FALSE
WHERE url = 'https://www.lachapellesurerdre.fr/actualites';

-- rollback UPDATE sources SET active = TRUE WHERE url = 'https://www.lachapellesurerdre.fr/actualites';
-- rollback DELETE FROM sources WHERE url = 'https://www.lachapellesurerdre.fr/rss.xml';
-- rollback DELETE FROM sources WHERE type = 'opendata';
-- rollback ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_type_check;
-- rollback ALTER TABLE sources ADD CONSTRAINT sources_type_check CHECK (type IN ('rss', 'scraping'));
