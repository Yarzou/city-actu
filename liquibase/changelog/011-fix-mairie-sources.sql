-- liquibase formatted sql

-- changeset ville-actu:011-fix-mairie-sources
-- comment: Les flux RSS du site de la mairie ont disparu (refonte Drupal 7, 404) — remplacement par du scraping sur /agenda et /actualites

-- 1. Désactiver les flux RSS morts.
--    Désactivation et non suppression : articles.source_id est ON DELETE CASCADE,
--    un DELETE emporterait les articles historiques de ces sources.
UPDATE sources
SET active = FALSE
WHERE url LIKE '%/flux-rss';

-- 2. Agenda de la mairie (événements datés).
--    La liste ne porte aucune date : elle est sur la page détail, dans .contentpage .date
--    ("Mercredi 19 août", "Du 10 au 14 juin") → detail_date_selector + parseFrenchDateRange
--    remplissent published_at et event_end_date.
INSERT INTO sources (city_id, category_id, name, url, type, active, scraping_config)
SELECT c.id, cat.id,
       'Mairie — Agenda',
       'https://www.lachapellesurerdre.fr/agenda',
       'scraping', TRUE,
       '{"list_selector": ".view-agenda .item",
         "title_selector": "h2",
         "link_selector": "p.bouton a",
         "content_selector": ".description p:not(.bouton)",
         "image_selector": ".image img",
         "detail_date_selector": ".contentpage .date",
         "base_url": "https://www.lachapellesurerdre.fr"}'::jsonb
FROM cities c, categories cat
WHERE c.slug = 'la-chapelle-sur-erdre' AND cat.slug = 'agenda'
ON CONFLICT (city_id, url) DO UPDATE
  SET scraping_config = EXCLUDED.scraping_config,
      type            = 'scraping',
      active          = TRUE;

-- 3. Actualités de la mairie (même markup Drupal views).
--    Pas de detail_date_selector : les pages détail des actualités n'ont pas de div.date,
--    ça n'économiserait rien et coûterait une requête HTTP par item.
INSERT INTO sources (city_id, category_id, name, url, type, active, scraping_config)
SELECT c.id, cat.id,
       'Mairie — Actualités',
       'https://www.lachapellesurerdre.fr/actualites',
       'scraping', TRUE,
       '{"list_selector": ".view-actualites .item",
         "title_selector": "h2",
         "link_selector": "p.bouton a",
         "content_selector": ".description p:not(.bouton)",
         "image_selector": ".image img",
         "base_url": "https://www.lachapellesurerdre.fr"}'::jsonb
FROM cities c, categories cat
WHERE c.slug = 'la-chapelle-sur-erdre' AND cat.slug = 'agenda'
ON CONFLICT (city_id, url) DO UPDATE
  SET scraping_config = EXCLUDED.scraping_config,
      type            = 'scraping',
      active          = TRUE;

-- rollback DELETE FROM sources WHERE url IN ('https://www.lachapellesurerdre.fr/agenda', 'https://www.lachapellesurerdre.fr/actualites');
-- rollback UPDATE sources SET active = TRUE WHERE url LIKE '%/flux-rss';
