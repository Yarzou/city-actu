-- liquibase formatted sql

-- changeset ville-actu:016-city-publication
-- comment: Drapeau de publication et ordre d'affichage des villes. Le défaut est FALSE pour qu'une ville créée depuis l'administration naisse privée, le temps d'y brancher ses sources ; les villes déjà en base sont en production et doivent être publiées par le backfill, sinon le site se vide à la seconde où la migration passe. Même logique que 009, qui a promu tous les comptes existants pour la même raison.

ALTER TABLE cities ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE cities ADD COLUMN IF NOT EXISTS display_order INT NOT NULL DEFAULT 0;

UPDATE cities SET published = TRUE WHERE published = FALSE;

-- Pas d'index sur `published` : la table compte une poignée de lignes et est toujours
-- lue en entier (liste du menu) ou par slug, qui porte déjà son index unique.

-- rollback ALTER TABLE cities DROP COLUMN IF EXISTS display_order;
-- rollback ALTER TABLE cities DROP COLUMN IF EXISTS published;


-- changeset ville-actu:016-categories-per-city
-- comment: Les catégories deviennent propres à chaque ville : elles portent les pastilles de filtre du feed, et deux communes n'ont pas les mêmes rubriques. La colonne est ajoutée nullable, remplie, puis passée NOT NULL — l'ordre inverse échouerait sur les lignes existantes.

ALTER TABLE categories ADD COLUMN IF NOT EXISTS city_id INT REFERENCES cities(id) ON DELETE CASCADE;

-- Toutes les catégories existantes appartiennent à la ville seedée : c'est la seule
-- qui ait jamais eu des sources, donc des articles qui les référencent.
UPDATE categories SET city_id = (SELECT id FROM cities ORDER BY id LIMIT 1) WHERE city_id IS NULL;

ALTER TABLE categories ALTER COLUMN city_id SET NOT NULL;

-- Le point à ne pas rater : `slug` était UNIQUE globalement (001). Chaque ville devant
-- pouvoir avoir son « agenda », la contrainte devient composite. Conséquence heureuse :
-- CATEGORY_COLORS (lib/types.ts) est indexé par slug et continue de fonctionner sans
-- changement, précisément parce que les slugs se répètent d'une ville à l'autre.
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_slug_key;
ALTER TABLE categories ADD CONSTRAINT categories_city_slug_key UNIQUE (city_id, slug);

-- L'index sert les listes du feed et de l'administration, toujours filtrées par ville
-- puis triées par ordre d'affichage.
CREATE INDEX IF NOT EXISTS categories_city_order_idx ON categories(city_id, display_order, name);

-- rollback DROP INDEX IF EXISTS categories_city_order_idx;
-- rollback ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_city_slug_key;
-- rollback ALTER TABLE categories ADD CONSTRAINT categories_slug_key UNIQUE (slug);
-- rollback ALTER TABLE categories DROP COLUMN IF EXISTS city_id;


-- changeset ville-actu:016-city-spotlight
-- comment: Onglet mis en avant, paramétrable par ville. L'onglet « Guinguettes » était codé en dur (GUINGUETTES_SLUG) et n'avait de sens que pour La Chapelle-sur-Erdre. Une ville désigne désormais la catégorie qu'elle veut sortir du feed « Actus » pour lui donner son propre onglet ; laisser la colonne à NULL n'affiche aucun onglet thématique.

ALTER TABLE cities ADD COLUMN IF NOT EXISTS spotlight_category_id INT
  CONSTRAINT cities_spotlight_category_fkey REFERENCES categories(id) ON DELETE SET NULL;

-- SET NULL et non CASCADE : supprimer la catégorie mise en avant doit retirer l'onglet,
-- certainement pas la ville.
--
-- La contrainte est **nommée explicitement** parce qu'il existe désormais deux relations
-- entre `cities` et `categories` (celle-ci, et `categories.city_id`). PostgREST ne peut
-- pas deviner laquelle imbriquer et exige un indice : `listVisibleCities` écrit
-- `spotlight:categories!cities_spotlight_category_fkey(name)`. Laisser Postgres
-- générer le nom marcherait aussi, mais coderait en dur une convention de nommage
-- implicite dans le code TypeScript.

-- Reprise de l'existant à l'identique : la Chapelle garde son onglet Guinguettes.
-- Résolu par slug et non par identifiant en dur, contrairement à 003 — voir 011 et 013,
-- qui avaient déjà adopté cette forme.
UPDATE cities c
   SET spotlight_category_id = cat.id
  FROM categories cat
 WHERE cat.city_id = c.id
   AND cat.slug = 'guinguettes'
   AND c.spotlight_category_id IS NULL;

-- rollback ALTER TABLE cities DROP COLUMN IF EXISTS spotlight_category_id;


-- changeset ville-actu:016-attach-orphan-summaries
-- comment: Rattache les résumés IA hérités à leur ville. Les routes digest retombaient sur les import_summaries dont city_id IS NULL quand une ville n'avait pas de résumé (« Backward compatibility »). Ces lignes ont été générées pour la ville seedée : dès la deuxième ville, la reprise affichait le résumé de La Chapelle comme étant le sien. Le backfill permet de supprimer la reprise côté code au lieu de la laisser fuiter.

UPDATE import_summaries
   SET city_id = (SELECT id FROM cities ORDER BY id LIMIT 1)
 WHERE city_id IS NULL;

-- rollback SELECT 'irréversible : la ville d''origine des résumés orphelins n''est pas conservée';


-- changeset ville-actu:016-is-admin-helper splitStatements:false
-- comment: Première fonction SQL d'administration du projet. Jusqu'ici « admin » n'existait qu'en TypeScript (lib/authz.ts) et aucune politique RLS ne référençait profiles.is_admin : les écritures sur cities, sources et categories étaient ouvertes à tout compte authentifié, contournables directement en PostgREST avec la clé anon. Un drapeau de publication contrôlé côté application seulement ne vaudrait donc rien.

CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT COALESCE((SELECT p.is_admin FROM profiles p WHERE p.id = auth.uid()), FALSE)
$$;

-- SECURITY DEFINER est ce qui évite la récursion : `profiles` porte sa propre RLS, et
-- une fonction INVOKER qui l'interroge depuis une politique boucle sur elle-même.
-- STABLE pour que le planificateur ne l'évalue qu'une fois par requête.
-- `SET search_path` ferme le détournement de résolution de nom, la fonction tournant
-- avec les droits de son propriétaire.

-- rollback DROP FUNCTION IF EXISTS is_admin();


-- changeset ville-actu:016-cities-rls
-- comment: C'est la RLS qui applique la dépublication, pas l'application. Le rendu serveur utilise la session de l'utilisateur (clé anon + cookies) : une ville dépubliée disparaît donc des listes ET resolveFeedContext retourne null, ce que la page transforme en notFound(). « Invisible et inaccessible » sans aucun code de garde. Un administrateur, lui, la voit et peut la préparer. Le cron et les digests passent par la clé service-role, qui contourne la RLS : les sources d'une ville dépubliée continuent d'être collectées, pour qu'elle soit prête le jour de sa publication.

DROP POLICY IF EXISTS "Public read cities" ON cities;
CREATE POLICY "Read published cities"
  ON cities FOR SELECT
  USING (published OR is_admin());

DROP POLICY IF EXISTS "Auth users manage cities" ON cities;
CREATE POLICY "Admins manage cities"
  ON cities FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- rollback DROP POLICY IF EXISTS "Admins manage cities" ON cities;
-- rollback CREATE POLICY "Auth users manage cities" ON cities FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
-- rollback DROP POLICY IF EXISTS "Read published cities" ON cities;
-- rollback CREATE POLICY "Public read cities" ON cities FOR SELECT USING (true);


-- changeset ville-actu:016-config-rls
-- comment: Écritures sur sources et categories réservées aux administrateurs. Changeset séparé parce qu'il dépasse la demande initiale : il ferme le même trou que 016-cities-rls, sur les deux autres tables de configuration. Laisser `categories` modifiable par tout compte authentifié devient bien plus grave dès qu'elle porte la configuration d'une ville. Retirable sans conséquence sur le reste de la migration.

DROP POLICY IF EXISTS "Auth users manage sources" ON sources;
CREATE POLICY "Admins manage sources"
  ON sources FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Auth users manage categories" ON categories;
CREATE POLICY "Admins manage categories"
  ON categories FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Les politiques de lecture publique de 001 restent en place : ces deux tables sont
-- lues par des visiteurs anonymes à chaque affichage du feed.

-- rollback DROP POLICY IF EXISTS "Admins manage categories" ON categories;
-- rollback CREATE POLICY "Auth users manage categories" ON categories FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
-- rollback DROP POLICY IF EXISTS "Admins manage sources" ON sources;
-- rollback CREATE POLICY "Auth users manage sources" ON sources FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
