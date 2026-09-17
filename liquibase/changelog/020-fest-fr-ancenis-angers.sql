-- liquibase formatted sql

-- changeset ville-actu:020-fest-fr-ancenis-angers
-- comment: Deux sources fest.fr de plus dans « Autour de chez nous » : Ancenis-Saint-Géréon et Angers. L'onglet ne servait que les pages départementales de Loire-Atlantique, qui ne remontent ni l'une ni l'autre.

-- Vérifié le 17/09/2026 en rejouant les sélecteurs de 016 sous cheerio contre le HTML
-- réellement servi :
--
--   /agenda/loire-atlantique/ancenis-saint-gereon  → 20 items, 20 datés
--       Ancenis-Saint-Géréon 6, Orée-d'Anjou 6, Montrevault-sur-Èvre 4, Oudon 3, Liré 1
--   /agenda/maine-et-loire/angers                  → 19 items, 19 datés
--       Angers 13, Les Ponts-de-Cé 2, Saint-Jean-de-Linières 1, Verrières-en-Anjou 1,
--       Bouchemaine 1, Mantelon 1
--
-- Comme pour /agenda/loire-atlantique/la-chapelle-sur-erdre (constat de 017), une page
-- « commune » de fest.fr sert les événements **alentour** et non ceux de la seule
-- commune. C'est précisément ce qu'on veut ici : ces sources vont dans `metropole`,
-- l'onglet « Autour de la Chap' », qui assume le périmètre élargi. `location_selector`
-- étant déjà configuré, la commune réelle s'affiche sous le titre de chaque carte
-- (§ « Le lieu sur les cartes ») — c'est elle qui permet de distinguer un concert à
-- Ancenis d'un autre à Liré.
--
-- Aucun `?period=` ni `/week-end` dans l'URL : les pages communales rendent l'agenda
-- courant complet (20 et 19 items), là où /week-end le réduirait aux deux jours à venir.
--
-- Ancenis : les deux orthographes du site (`/ancenis` et `/ancenis-saint-gereon`)
-- répondent 200, chacune canonique d'elle-même, et servent **le même lot d'événements
-- aux mêmes URLs d'article**. Une seule source, donc — la seconde ne compterait que des
-- doublons (`articles.url` est UNIQUE, la première source passée gagne). Le nom officiel
-- de la commune depuis 2019 est retenu.
--
-- Les sélecteurs sont recopiés ici plutôt que laissés à 016 : ce changeset s'exécute
-- après lui, l'UPDATE `WHERE url ILIKE '%fest.fr%'` est déjà passé et ne rattrapera pas
-- ces lignes. Ils sont identiques au gabarit d'agenda de fest.fr, tous départements et
-- toutes communes confondus.
INSERT INTO sources (city_id, category_id, name, url, type, active, scraping_config)
SELECT c.id, cat.id, s.name, s.url, 'scraping', TRUE,
       '{"list_selector": "section.item",
         "title_selector": "h2.titre",
         "link_selector": "a[itemprop=\"url\"]",
         "date_selector": "[itemprop=\"startDate\"]",
         "content_selector": ".ptDescription",
         "location_selector": "[itemprop=\"addressLocality\"]"}'::jsonb
FROM cities c, categories cat,
     (VALUES ('Fest.fr — Ancenis-Saint-Géréon', 'https://www.fest.fr/agenda/loire-atlantique/ancenis-saint-gereon'),
             ('Fest.fr — Angers',               'https://www.fest.fr/agenda/maine-et-loire/angers')
     ) AS s(name, url)
WHERE c.slug = 'la-chapelle-sur-erdre' AND cat.slug = 'metropole'
ON CONFLICT (city_id, url) DO UPDATE
  SET scraping_config = EXCLUDED.scraping_config,
      category_id     = EXCLUDED.category_id,
      type            = 'scraping',
      active          = TRUE;

-- Le rollback supprime ces deux sources, donc — `articles.source_id` étant
-- ON DELETE CASCADE — les événements collectés par elles. Le contenu est intégralement
-- recollectable au cron suivant, comme pour les sources créées par 017.
-- rollback DELETE FROM sources WHERE url IN ('https://www.fest.fr/agenda/loire-atlantique/ancenis-saint-gereon', 'https://www.fest.fr/agenda/maine-et-loire/angers');
