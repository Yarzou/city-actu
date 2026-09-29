-- liquibase formatted sql

-- changeset ville-actu:023-exponantes
-- comment: Agenda du Parc des Expositions de Nantes (Exponantes, La Beaujoire) dans « Autour de chez nous », salons professionnels exclus.

-- Vérifié le 29/09/2026 en rejouant les sélecteurs sous cheerio contre le HTML
-- réellement servi par /agenda-des-evenements-du-parc/ :
--
--   .e-loop-item                                  → 58 items, tous titrés, liés, illustrés
--     dont .type-evenement-grand-public           → 54
--     dont .type-evenement-pro                    →  4 (Industrie Grand Ouest, Solutions CSE,
--                                                       Technotrans, Architect@Work)
--   aucun item ne porte les deux classes, aucun n'en porte aucune : la partition est
--   complète. Sur les 54 retenus : 54 datés, 12 avec une date de fin (toutes postérieures
--   au début), les 42 autres sur un seul jour.
--
-- **Le filtre « pas de salon pro » tient dans `list_selector`.** WordPress pose sur chaque
-- item la classe de sa taxonomie `type-evenement`. C'est elle qu'on filtre, et non le
-- libellé affiché (« Salon », « Salon professionnel ») : Solutions CSE et Technotrans sont
-- des événements pro affichés « Salon », un `title_filter` ne les verrait pas.
--
-- **Dates.** La liste affiche « Du 27/06/2026 » + « au 01/11/2026 », ou « Le 16/10/2026 »,
-- chacun dans son propre widget Elementor. Les sélecteurs évitent les identifiants
-- `elementor-element-xxxx`, qui diffèrent selon qu'il s'agit d'un jour unique ou d'une
-- plage : le **premier** widget de liste d'icônes est toujours le début, son **frère
-- adjacent** toujours la fin. `parseFrenchDate` lit le JJ/MM/AAAA ; aucune heure n'est
-- exposée, les événements sont donc ancrés à midi (« heure inconnue »).
--
-- **Lieu.** La liste ne le porte pas, tout se passe au même endroit : `location_default`
-- le pose sur chaque article. Forme « salle, ville » : la commune, dernier segment, est ce
-- que la carte rend cliquable (`extractLocality`), et la valeur alimente aussi LOCATION
-- dans l'export .ics et la recherche par lieu (`location_search`, migration 021).
--
-- Pas de `content_selector` : la liste n'a pas de résumé. Pas de `detail_date_selector` :
-- les dates sont déjà dans la liste, suivre 54 pages détail ne ferait que consommer le
-- budget de 60 s du cron.
--
-- **Ne pas y ajouter l'open data** (`lieu = "Parc des Expos de la Beaujoire / Exponantes
-- Le Parc"` ou `"Le LAPS - …"`) : les URLs diffèrent (`exponantes.com/evenement/…` contre
-- `metropole.nantes.fr/infonantes/agenda/…`), `articles.url` UNIQUE ne dédoublonnerait
-- rien et chaque concert du LAPS apparaîtrait deux fois. L'open data n'en couvre de toute
-- façon que la moitié (27 événements, dont 5 seulement hors LAPS).
INSERT INTO sources (city_id, category_id, name, url, type, active, scraping_config)
SELECT c.id, cat.id,
       'Exponantes — Parc des Expositions de Nantes',
       'https://www.exponantes.com/agenda-des-evenements-du-parc/',
       'scraping', TRUE,
       '{"list_selector": ".e-loop-item.type-evenement-grand-public",
         "title_selector": ".elementor-heading-title",
         "link_selector": "a[href*=\"/evenement/\"]",
         "date_selector": ".elementor-widget-icon-list .elementor-icon-list-text",
         "end_date_selector": ".elementor-widget-icon-list + .elementor-widget-icon-list .elementor-icon-list-text",
         "image_selector": "img",
         "location_default": "Parc des Expositions de la Beaujoire, Nantes"}'::jsonb
FROM cities c, categories cat
WHERE c.slug = 'la-chapelle-sur-erdre' AND cat.slug = 'metropole'
ON CONFLICT (city_id, url) DO UPDATE
  SET scraping_config = EXCLUDED.scraping_config,
      category_id     = EXCLUDED.category_id,
      type            = 'scraping',
      active          = TRUE;

-- Le rollback supprime la source, donc — `articles.source_id` étant ON DELETE CASCADE —
-- les événements collectés par elle. Tout est recollectable au cron suivant.
-- rollback DELETE FROM sources WHERE url = 'https://www.exponantes.com/agenda-des-evenements-du-parc/';
