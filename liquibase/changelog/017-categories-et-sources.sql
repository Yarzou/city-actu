-- liquibase formatted sql

-- changeset ville-actu:017-1-categories
-- comment: Trois catégories manquantes. Toutes les sources actives étaient rattachées à "agenda" (011 et 013 posent `WHERE cat.slug = 'agenda'`, y compris pour les actualités), et `persistItems` écrit `category_id: source.category_id` sans classifieur — la catégorie est donc une propriété de la source. Ajouter des catégories ne sert à rien sans découper les sources : c'est l'objet des changesets suivants.

-- `display_order` explicite et en dehors des valeurs déjà attribuées (le backfill de 014
-- a posé Agenda 10, Sorties enfants 20, Sports 30, Travaux 40) : aucune ligne existante
-- n'est touchée, donc la barre de filtres publique ne se réordonne pas dans le dos de
-- l'admin. Les flèches de l'onglet Catégories restent maîtresses ensuite.
--
-- `infos-pratiques` avait été supprimée par 005 faute de contenu à y mettre ; les brèves
-- et les actualités de la mairie (changesets 2 et 3) lui en donnent enfin.
--
-- La colonne `color` est renseignée par cohérence avec les lignes seedées, mais elle
-- n'est **pas** ce que l'interface lit : `CATEGORY_COLORS` (lib/types.ts) est indexé par
-- slug côté TypeScript. Les trois slugs y sont ajoutés dans le même lot de modifications,
-- sinon les pastilles tombent sur le gris de repli.
INSERT INTO categories (name, slug, icon, color, display_order) VALUES
  ('Infos pratiques',        'infos-pratiques',      '🏛️', 'bg-blue-100 text-blue-800',       5),
  ('Nature & environnement', 'nature-environnement', '🌿', 'bg-emerald-100 text-emerald-800', 25),
  ('Autour de chez nous',    'metropole',            '🌍', 'bg-sky-100 text-sky-800',         60)
ON CONFLICT (slug) DO NOTHING;

-- rollback UPDATE sources SET category_id = (SELECT id FROM categories WHERE slug = 'agenda') WHERE category_id IN (SELECT id FROM categories WHERE slug IN ('infos-pratiques','nature-environnement','metropole'));
-- rollback UPDATE articles SET category_id = (SELECT id FROM categories WHERE slug = 'agenda') WHERE category_id IN (SELECT id FROM categories WHERE slug IN ('infos-pratiques','nature-environnement','metropole'));
-- rollback DELETE FROM categories WHERE slug IN ('infos-pratiques','nature-environnement','metropole');


-- changeset ville-actu:017-2-source-breves
-- comment: Quatrième flux du site municipal, jamais collecté : /breves. Vérifié le 07/09/2026 en rejouant les sélecteurs cheerio contre le HTML réel — 5 items par page, 2 pages, titres et liens complets.

-- Les trois flux déjà connus (/agenda, /actualites, /rss.xml) sont disjoints — voir
-- memory/architecture.md. /breves est un quatrième, servi par une autre vue Drupal
-- (`.item-breves`, et non `.item` comme /agenda et /actualites) :
--
--   <div class="item-breves">
--     <p class="date"></p>
--     <h2>Menus de la restauration scolaire</h2>
--     <p class="bouton"><a href="/menus-de-la-restauration-scolaire">En savoir +</a></p>
--   </div>
--
-- Pas de `content_selector` ni d'`image_selector` : la vue n'expose ni description ni
-- image, les cartes n'auront qu'un titre. Pas de `detail_date_selector` non plus — les
-- pages de destination sont des pages de contenu sans div.date, suivre dix liens ne
-- rapporterait rien et pèserait sur le budget de 60 s du cron.
--
-- `<p class="date">` est **vide** sur les dix brèves : `published_at` restera NULL, donc
-- ces articles resteront visibles en permanence dans le feed par défaut (clause
-- `published_at.is.null` de queryArticles) et porteront un bouton calendrier barré.
-- C'est le comportement déjà assumé pour /actualites, et c'est ce qu'on veut pour des
-- infos pratiques sans échéance (menus scolaires, horaires tram-train, permanences).
--
-- Deux sources et non une : la vue est paginée et le scraper ne suit pas les pagers.
-- La page 2 porte cinq brèves qui n'ont rien d'anecdotique (restauration scolaire,
-- tram-train, Secours Populaire). Une brève qui glisse de la page 1 à la page 2 en
-- vieillissant sera vue par les deux sources : `articles.url` étant UNIQUE et la
-- première passée gagnant, elle reste rattachée à sa première collecte et compte
-- ensuite en « unchanged ». Rien à faire.
INSERT INTO sources (city_id, category_id, name, url, type, active, scraping_config)
SELECT c.id, cat.id, s.name, s.url, 'scraping', TRUE,
       '{"list_selector": ".item-breves",
         "title_selector": "h2",
         "link_selector": "p.bouton a",
         "base_url": "https://www.lachapellesurerdre.fr"}'::jsonb
FROM cities c, categories cat,
     (VALUES ('Mairie — Brèves',          'https://www.lachapellesurerdre.fr/breves'),
             ('Mairie — Brèves (page 2)', 'https://www.lachapellesurerdre.fr/breves?page=1')
     ) AS s(name, url)
WHERE c.slug = 'la-chapelle-sur-erdre' AND cat.slug = 'infos-pratiques'
ON CONFLICT (city_id, url) DO UPDATE
  SET scraping_config = EXCLUDED.scraping_config,
      category_id     = EXCLUDED.category_id,
      type            = 'scraping',
      active          = TRUE;

-- Le rollback supprime ces deux sources, donc — articles.source_id étant ON DELETE
-- CASCADE — les brèves déjà collectées avec elles. 011 et 013 avaient préféré
-- désactiver plutôt que supprimer pour cette raison ; ici les sources sont **créées**
-- par le changeset, un retour arrière doit les faire disparaître, et le contenu perdu
-- est intégralement recollectable au cron suivant.
-- rollback DELETE FROM sources WHERE url IN ('https://www.lachapellesurerdre.fr/breves', 'https://www.lachapellesurerdre.fr/breves?page=1');


-- changeset ville-actu:017-3-actualites-infos-pratiques
-- comment: Réactivation de /actualites et passage en "infos-pratiques". Elle était inactive depuis 013, désactivée comme « redondante » avec /rss.xml — ce qui est faux et avait déjà coûté une régression : aucun lien de /actualites n'apparaît dans le flux RSS (vérifié le 03/09/2026, reconfirmé le 07/09/2026).

-- Sélecteurs de 011 revalidés le 07/09/2026 contre le HTML réel : `.view-actualites .item`
-- rend 2 items, titres et liens corrects.
--
-- Ces deux articles n'ont pas de date et c'est irrémédiable (ni <time>, ni
-- meta article:published_time, ni JSON-LD — voir memory/architecture.md, où la déduction
-- depuis le texte a été testée et écartée : jusqu'à 402 jours d'erreur). Ils resteront
-- donc visibles en permanence dans le feed. Acceptable pour deux infos pratiques, ça ne
-- l'était pas quand elles atterrissaient dans « Agenda ».
UPDATE sources
SET active      = TRUE,
    category_id = (SELECT id FROM categories WHERE slug = 'infos-pratiques')
WHERE url = 'https://www.lachapellesurerdre.fr/actualites';

-- La catégorie des articles déjà collectés par cette source n'est pas réécrite par le
-- cron : `category_id` est dans `IDENTITY` (lib/fetchers/index.ts) et recopié depuis la
-- ligne stockée, précisément pour qu'un refetch ne fasse pas basculer la propriété d'un
-- article quand deux sources exposent la même URL. On les reclasse donc ici, une fois.
UPDATE articles a
SET category_id = (SELECT id FROM categories WHERE slug = 'infos-pratiques')
FROM sources s
WHERE a.source_id = s.id
  AND s.url = 'https://www.lachapellesurerdre.fr/actualites';

-- rollback UPDATE articles a SET category_id = (SELECT id FROM categories WHERE slug = 'agenda') FROM sources s WHERE a.source_id = s.id AND s.url = 'https://www.lachapellesurerdre.fr/actualites';
-- rollback UPDATE sources SET active = FALSE, category_id = (SELECT id FROM categories WHERE slug = 'agenda') WHERE url = 'https://www.lachapellesurerdre.fr/actualites';


-- changeset ville-actu:017-4-opendata-catchall
-- comment: L'agenda open data devient un fourre-tout **exclusif** : ses trois déclinaisons (changeset suivant) lui retirent ce qu'elles prennent. Sans cette restriction le découpage serait sans effet — fetchAllSources trie les sources par id, articles.url est UNIQUE, et la source la plus anciennement déclarée gagne : celle de 013 (id le plus bas) raflerait tout, les nouvelles ne compteraient que des doublons.

-- Les quatre filtres sont **disjoints et exhaustifs**, vérifiés contre l'API le
-- 07/09/2026 sur les 29 lignes de code_insee=44035 :
--   enfants 8 + sports 1 + nature 2 + reste 18 = 29.
-- Le découpage ne repose donc même pas sur l'ordre des id — ceinture et bretelles.
--
-- Deux pièges de l'ODSQL, tous deux constatés en interrogeant l'API :
--   * types_libelles="Théâtre - Humour" renvoie **0 ligne** (l'égalité sur une valeur
--     accentuée échoue) là où types_libelles LIKE "Humour" en renvoie 7. D'où le choix
--     de themes_libelles, dont les trois valeurs sont sans accent
--     ("Culture - Loisirs" 27, "Nature - Environnement" 2, "Sports" 1).
--   * l'égalité et le NOT fonctionnent sur ces champs pourtant **multivalués**
--     (tableaux de libellés) : NOT themes_libelles="Sports" exclut bien un événement
--     dont la liste de thèmes contient "Sports".
--
-- now(days=-7) reste évalué par Opendatasoft à chaque appel : la fenêtre glisse sans
-- qu'on réécrive l'URL, comme en 013.
--
-- Le ciblage évite l'URL littérale de 013 : la source est reconnue par son dataset et
-- par l'**absence** des filtres posés ici et au changeset suivant. Le changeset est
-- ainsi idempotent et insensible à l'ordre d'exécution.
UPDATE sources
SET name = 'Nantes Métropole — Agenda, hors enfants/sports/nature (Open Data)',
    url  = 'https://data.nantesmetropole.fr/api/explore/v2.1/catalog/datasets/'
             || '244400404_agenda-evenements-nantes-metropole_v2/records'
             || '?where=code_insee%3D44035'
             || '%20AND%20NOT%20accueil_enfant%3D%22oui%22'
             || '%20AND%20NOT%20themes_libelles%3D%22Sports%22'
             || '%20AND%20NOT%20themes_libelles%3D%22Nature%20-%20Environnement%22'
             || '%20AND%20date%20%3E%3D%20now(days%3D-7)'
             || '&order_by=date'
WHERE type = 'opendata'
  AND url LIKE '%agenda-evenements-nantes-metropole_v2%'
  AND url NOT LIKE '%accueil_enfant%'
  AND url NOT LIKE '%themes_libelles%';

-- rollback UPDATE sources SET name = 'Nantes Métropole — Agenda (Open Data)', url = 'https://data.nantesmetropole.fr/api/explore/v2.1/catalog/datasets/244400404_agenda-evenements-nantes-metropole_v2/records?where=code_insee%3D44035%20AND%20date%20%3E%3D%20now(days%3D-7)&order_by=date' WHERE type = 'opendata' AND url LIKE '%agenda-evenements-nantes-metropole_v2%' AND url LIKE '%NOT%20accueil_enfant%';


-- changeset ville-actu:017-5-opendata-declinaisons
-- comment: Trois déclinaisons filtrées de l'agenda métropolitain, une par catégorie. C'est le levier principal : les champs du dataset (accueil_enfant, themes_libelles) peuplent trois catégories sans une ligne de code, puisqu'une source = une URL = un filtre = une catégorie.

-- Comptages vérifiés le 07/09/2026 sur code_insee=44035 :
--   accueil_enfant="oui"                      →  8 (Le Petit Prince, Loup y es-tu ?,
--                                                   Pierre & Plume…)
--   themes_libelles="Sports"                  →  1 (Septembre Bouge 2026, au CREPS)
--   themes_libelles="Nature - Environnement"  →  2 (atelier cuisine anti-gaspillage,
--                                                   broyage et compostage)
--
-- Un événement à la fois accueillant les enfants et sportif serait pris par deux filtres ;
-- l'arbitrage reviendrait à l'ordre des id, donc à l'ordre de ce VALUES (enfants
-- d'abord). Cas inexistant aujourd'hui, mais autant que l'ordre soit celui qu'on veut.
--
-- Rien d'autre à saisir : le type opendata ne lit aucune scraping_config, toute la
-- configuration tient dans l'URL (voir lib/fetchers/opendata.ts).
INSERT INTO sources (city_id, category_id, name, url, type, active)
SELECT c.id, cat.id, f.name,
       'https://data.nantesmetropole.fr/api/explore/v2.1/catalog/datasets/'
         || '244400404_agenda-evenements-nantes-metropole_v2/records'
         || '?where=code_insee%3D44035'
         || '%20AND%20' || f.predicate
         || '%20AND%20date%20%3E%3D%20now(days%3D-7)'
         || '&order_by=date',
       'opendata', TRUE
FROM cities c
CROSS JOIN (VALUES
       ('Nantes Métropole — Sorties enfants (Open Data)',
        'accueil_enfant%3D%22oui%22',
        'sorties-enfants'),
       ('Nantes Métropole — Sports (Open Data)',
        'themes_libelles%3D%22Sports%22',
        'sports'),
       ('Nantes Métropole — Nature & environnement (Open Data)',
        'themes_libelles%3D%22Nature%20-%20Environnement%22',
        'nature-environnement')
     ) AS f(name, predicate, cat_slug)
JOIN categories cat ON cat.slug = f.cat_slug
WHERE c.slug = 'la-chapelle-sur-erdre'
ON CONFLICT (city_id, url) DO UPDATE
  SET category_id = EXCLUDED.category_id,
      name        = EXCLUDED.name,
      type        = 'opendata',
      active      = TRUE;

-- rollback DELETE FROM sources WHERE type = 'opendata' AND url LIKE '%agenda-evenements-nantes-metropole_v2%' AND (url LIKE '%20AND%20accueil_enfant%' OR url LIKE '%20AND%20themes_libelles%');


-- changeset ville-actu:017-6-fest-metropole
-- comment: fest.fr passe dans "metropole" (« Autour de chez nous »), assumé comme flux métropolitain. Vérifié le 07/09/2026 : le site n'a **pas** de page communale — /agenda/loire-atlantique/la-chapelle-sur-erdre répond 200 mais sert les événements des alentours (19 items, addressLocality = Nantes, Saint-Herblain, Chaumes-en-Retz…). Le laisser dans "agenda" mélangeait du départemental au feed chapelain.

UPDATE sources
SET category_id = (SELECT id FROM categories WHERE slug = 'metropole')
WHERE url ILIKE '%fest.fr%';

-- Reclassement des articles déjà collectés, pour la même raison qu'au changeset 3 :
-- le cron ne réécrit jamais category_id (colonne dans IDENTITY).
UPDATE articles a
SET category_id = (SELECT id FROM categories WHERE slug = 'metropole')
FROM sources s
WHERE a.source_id = s.id
  AND s.url ILIKE '%fest.fr%';

-- rollback UPDATE articles a SET category_id = (SELECT id FROM categories WHERE slug = 'agenda') FROM sources s WHERE a.source_id = s.id AND s.url ILIKE '%fest.fr%';
-- rollback UPDATE sources SET category_id = (SELECT id FROM categories WHERE slug = 'agenda') WHERE url ILIKE '%fest.fr%';


-- changeset ville-actu:017-7-recollecte-opendata
-- comment: Les articles déjà collectés par l'agenda métropolitain gardent la catégorie "agenda" : category_id est dans IDENTITY et recopié depuis la ligne stockée, aucun refetch ne le corrige. Les supprimer les fait recollecter au prochain cron, cette fois par la bonne déclinaison.

-- Un simple UPDATE ne peut pas faire ce travail : la catégorie se déduit de champs
-- (accueil_enfant, themes_libelles) qui vivent dans l'API et ne sont pas stockés en base.
-- Seule la recollecte peut trancher.
--
-- Suppression franche et non masquage (is_duplicate = true, ce que fait
-- /api/admin/delete sur un article) : le masquage est justement hors de la liste blanche
-- REFRESHABLE pour survivre au cron, il empêcherait donc la recollecte.
--
-- Deux garde-fous : on épargne les articles **masqués** (un admin a décidé de les cacher,
-- les recréer défairait sa décision) et ceux qui sont en **favori** chez quelqu'un
-- (user_favorites.article_id est ON DELETE CASCADE : le favori partirait avec l'article,
-- et l'article recréé aurait un nouvel id).
--
-- Effet de bord assumé : fetched_at — date de première vision, tri secondaire du feed —
-- est remis à la date du prochain cron pour ces articles. Sans conséquence ici, ils
-- portent tous une published_at réelle qui commande le tri.
DELETE FROM articles a
WHERE a.url LIKE 'https://metropole.nantes.fr/infonantes/agenda/%'
  AND a.is_duplicate = FALSE
  AND NOT EXISTS (SELECT 1 FROM user_favorites f WHERE f.article_id = a.id);

-- rollback SELECT 1; -- irréversible : les articles supprimés sont recollectés par le cron, avec de nouveaux id


-- changeset ville-actu:017-8-desactiver-rss
-- comment: Désactivation de /rss.xml, redondant avec l'agenda open data et mal daté. Constat vérifié le 07/09/2026 en comparant les deux flux item par item.

-- 9 de ses 10 items sont des spectacles de Capellia (Fatoumata Diawara, The Baby Tyler
-- Show, Le Premier Artifice, Plastic Monsters, Mon père avait 3 vaches, Sean Nós, L'art
-- d'avoir toujours raison, La critique de l'hétéronormativité…, et le 10e n'est pas un
-- spectacle) que l'agenda open data collecte déjà, avec la **vraie date d'événement**,
-- le lieu structuré et une image.
--
-- Le RSS, lui, ne porte que la date de **publication** — les neuf `<pubDate>` sont au
-- 07/08/2026 — ce qui est faux pour un agenda : le tri du feed est commandé par
-- `published_at`, donc ces spectacles se rangeaient tous à la date où la mairie a mis
-- la page en ligne, pas à la date où ils ont lieu.
--
-- Et les deux versions ne se dédoublonnent pas : `articles.url` est UNIQUE, mais les
-- URLs diffèrent (`lachapellesurerdre.fr/fatoumata-diawara` contre
-- `metropole.nantes.fr/infonantes/agenda/<id>`). Chaque spectacle apparaissait donc
-- deux fois, dont une mal datée.
--
-- Ses deux items non-spectacle sont couverts autrement : `/eau-potable-en-crise-…` est
-- servi à l'identique par /breves (même URL, donc la brève reprend simplement la place),
-- et /actualites redevient active au changeset 3. `/accueil-des-nouveaux-chapelains` est
-- le seul contenu réellement perdu — les brèves portent « Nouveaux habitants », qui n'est
-- pas la même page.
--
-- Désactivation et non suppression, comme en 011 et 013 : `articles.source_id` est
-- ON DELETE CASCADE, supprimer la source emporterait ses articles historiques.
-- Réactivable depuis l'onglet Admin sans migration.
UPDATE sources
SET active = FALSE
WHERE url = 'https://www.lachapellesurerdre.fr/rss.xml';

-- Les articles déjà collectés par ce flux resteraient sinon en base pour toujours : la
-- source inactive ne les rafraîchit plus, et rien ne corrige leur `published_at` (le
-- doublon open data vit sous une autre URL, il n'y a donc pas de conflit qui déclencherait
-- une mise à jour). On les supprime pour de bon.
--
-- Suppression franche et non masquage : `/eau-potable-en-crise-…` porte la **même URL**
-- que la brève, et `is_duplicate` est hors de la liste blanche REFRESHABLE — masquer
-- l'article rendrait cette brève invisible à jamais, y compris recollectée par /breves.
-- La supprimer, au contraire, laisse /breves la réinsérer proprement au prochain cron.
--
-- Mêmes garde-fous qu'au changeset 7 : on épargne les articles masqués (décision d'un
-- admin) et ceux qui sont en favori chez quelqu'un (`user_favorites` est ON DELETE
-- CASCADE, le favori partirait avec l'article).
DELETE FROM articles a
USING sources s
WHERE a.source_id = s.id
  AND s.url = 'https://www.lachapellesurerdre.fr/rss.xml'
  AND a.is_duplicate = FALSE
  AND NOT EXISTS (SELECT 1 FROM user_favorites f WHERE f.article_id = a.id);

-- rollback UPDATE sources SET active = TRUE WHERE url = 'https://www.lachapellesurerdre.fr/rss.xml';
