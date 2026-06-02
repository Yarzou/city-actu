-- liquibase formatted sql

-- changeset ville-actu:003-seed-sources
-- comment: Premières sources RSS et scraping pour La Chapelle-sur-Erdre

-- Note: city_id=1 (La Chapelle-sur-Erdre), category_id selon catégorie

-- Infos pratiques (category_id=1)
INSERT INTO sources (city_id, category_id, name, url, type, active) VALUES
  (1, 1, 'Site de la Mairie — Actualités', 'https://www.lachapellesurerdre.fr/mairie/actualites/flux-rss', 'rss', true),
  (1, 1, 'Mairie — Vie pratique',           'https://www.lachapellesurerdre.fr/vie-pratique/flux-rss',       'rss', true)
ON CONFLICT (city_id, url) DO NOTHING;

-- Agenda / sorties enfants (category_id=2,3)
INSERT INTO sources (city_id, category_id, name, url, type, active) VALUES
  (1, 2, 'Espace jeunesse — Agenda jeunes', 'https://www.lachapellesurerdre.fr/jeunesse/agenda/flux-rss', 'rss', false),
  (1, 3, 'Agenda culturel de la ville',     'https://www.lachapellesurerdre.fr/culture/agenda/flux-rss',  'rss', false)
ON CONFLICT (city_id, url) DO NOTHING;

-- Presse locale (catégorie générique infos-pratiques en attendant)
INSERT INTO sources (city_id, category_id, name, url, type, active, scraping_config) VALUES
  (1, 1, 'Presse Océan — La Chapelle-sur-Erdre',
   'https://www.presseocean.fr/tag/la-chapelle-sur-erdre',
   'scraping', false,
   '{"list_selector": "article", "title_selector": "h2, h3", "link_selector": "a", "content_selector": "p", "base_url": "https://www.presseocean.fr"}'::jsonb)
ON CONFLICT (city_id, url) DO NOTHING;

-- rollback DELETE FROM sources WHERE city_id = 1;
