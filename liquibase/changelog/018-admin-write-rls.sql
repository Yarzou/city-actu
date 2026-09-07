-- liquibase formatted sql

-- Ferme un trou de sécurité présent depuis la migration 004.
--
-- `004-admin-rls.sql` accorde l'écriture sur `sources`, `cities` et `categories` à tout
-- utilisateur **authentifié** (`auth.role() = 'authenticated'`), et aucune politique ne
-- référence `profiles.is_admin` : le rôle « admin » n'existe qu'en TypeScript (gardes des
-- routes API, `isAdminUser`) et dans la colonne ajoutée par 008, que **rien n'utilise en
-- base**. N'importe quel compte connecté peut donc créer, modifier ou supprimer une
-- source ou une catégorie directement via PostgREST avec la clé anon, sans passer par
-- l'interface — les gardes applicatives ne protègent pas ce chemin.
--
-- Ce n'est pas théorique : `components/admin/AdminSourcesPanel.tsx` écrit **avec le
-- client navigateur** (`lib/supabase/client.ts`, clé anon + session), pas par une route
-- API. La RLS est la seule barrière sur ces tables, et c'est aussi le chemin par lequel
-- l'administrateur légitime écrit — d'où le garde-fou du premier changeset.


-- changeset ville-actu:018-1-verifier-un-admin splitStatements:false
-- comment: Refuse de resserrer la RLS s'il n'existe aucun profil admin — sans ce garde-fou, la migration pourrait rendre le panneau d'administration inutilisable pour tout le monde, sans recours depuis l'application.

-- La migration 009 a promu en admin tous les profils existants à sa date, mais un compte
-- créé **après** ne l'est pas : le trigger de 008 met `is_admin` à FALSE par défaut et
-- interdit de le changer autrement qu'avec le rôle `service_role`.
--
-- Si ce changeset échoue : promouvoir un compte depuis l'éditeur SQL Supabase (qui
-- exécute en tant que propriétaire, donc `auth.role()` vaut NULL et le trigger anti
-- élévation de 008 laisse passer) —
--   UPDATE profiles SET is_admin = TRUE WHERE id = '<uuid de auth.users>';
-- puis relancer `npm run db:migrate`.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE is_admin) THEN
    RAISE EXCEPTION
      'Aucun profil avec is_admin = TRUE : resserrer la RLS maintenant priverait tout le monde de l''écriture sur sources/cities/categories. Promouvoir un compte puis relancer.';
  END IF;
END $$;

-- rollback SELECT 1; -- vérification seule, rien à défaire


-- changeset ville-actu:018-2-is-admin-function splitStatements:false
-- comment: Fonction is_admin() — le rôle admin devient une notion de base de données, utilisable dans les politiques RLS.

-- `SECURITY DEFINER` : la fonction lit `profiles`, table elle-même sous RLS. En
-- `SECURITY INVOKER` elle dépendrait des politiques de `profiles` (« Users can read own
-- profile », `auth.uid() = id`) — ça fonctionnerait pour le profil de l'appelant, mais
-- lierait la sécurité de trois tables aux politiques d'une quatrième, et ouvrirait la
-- porte à une récursion le jour où une politique de `profiles` appellerait `is_admin()`.
--
-- `STABLE` : le résultat ne change pas dans une même instruction, le planificateur peut
-- donc n'évaluer la fonction qu'une fois par requête au lieu d'une fois par ligne.
--
-- `SET search_path` **figé** : obligatoire pour une fonction `SECURITY DEFINER`, sinon un
-- appelant peut détourner la résolution des noms (`profiles`) vers un objet à lui en
-- manipulant son `search_path`. `auth.uid()` est qualifiée, elle ne dépend pas du chemin.
--
-- `COALESCE(..., FALSE)` : un visiteur anonyme n'a pas de `auth.uid()`, la sous-requête
-- ne rend aucune ligne. Sans ce repli la fonction renverrait NULL, et une politique
-- `USING (is_admin())` sur un NULL se comporte comme FALSE — c'est le bon résultat, mais
-- par accident. Autant le dire explicitement.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT p.is_admin FROM profiles p WHERE p.id = auth.uid()), FALSE);
$$;

-- rollback DROP FUNCTION IF EXISTS public.is_admin();


-- changeset ville-actu:018-3-grant-is-admin
-- comment: Droit d'exécution de is_admin() aux rôles applicatifs. Changeset séparé du précédent : celui-ci porte un corps de fonction délimité par $$ et tourne en splitStatements:false, où enchaîner un second ordre dans le même bloc dépend du comportement du pilote JDBC.

-- La fonction ne révèle que le drapeau de l'appelant lui-même : la laisser exécutable par
-- les rôles applicatifs ne divulgue rien. `anon` en fait partie — non pour qu'un visiteur
-- anonyme écrive (il obtiendra FALSE), mais parce qu'une politique référençant une
-- fonction que le rôle ne peut pas exécuter fait **échouer la requête** au lieu de rendre
-- faux. Les GRANT sont explicites plutôt que laissés au privilège PUBLIC par défaut, pour
-- que la liste des rôles autorisés soit lisible ici.
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

-- rollback REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, authenticated, service_role;


-- changeset ville-actu:018-4-admin-write-policies
-- comment: Écriture sur sources, cities et categories réservée aux administrateurs. Politiques par commande (INSERT / UPDATE / DELETE) et non FOR ALL, pour que le chemin de lecture n'appelle jamais is_admin().

-- Pourquoi pas un simple `FOR ALL USING (is_admin())` comme le faisait 004 : `FOR ALL`
-- couvre aussi le SELECT. Les lectures resteraient autorisées — les politiques sont
-- permissives et « Public read … » (001) les accorde déjà à tous par un OR — mais
-- `is_admin()` serait évaluée sur le chemin de lecture **public**, celui du feed, qui lit
-- `sources` et `categories` à chaque rendu de page. Découper par commande garde ce chemin
-- exactement tel qu'il est aujourd'hui.
--
-- `WITH CHECK` autant que `USING` sur les UPDATE : sans lui, un non-admin ne pourrait pas
-- modifier une ligne existante mais rien n'encadrerait la valeur produite.

DROP POLICY IF EXISTS "Auth users manage sources"    ON sources;
DROP POLICY IF EXISTS "Auth users manage cities"     ON cities;
DROP POLICY IF EXISTS "Auth users manage categories" ON categories;

CREATE POLICY "Admins insert sources" ON sources FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "Admins update sources" ON sources FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins delete sources" ON sources FOR DELETE USING (is_admin());

CREATE POLICY "Admins insert cities" ON cities FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "Admins update cities" ON cities FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins delete cities" ON cities FOR DELETE USING (is_admin());

CREATE POLICY "Admins insert categories" ON categories FOR INSERT WITH CHECK (is_admin());
CREATE POLICY "Admins update categories" ON categories FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins delete categories" ON categories FOR DELETE USING (is_admin());

-- Ce que ce changeset ne change **pas**, volontairement :
--
--   * les lectures publiques (`Public read cities/categories/sources/articles` de 001)
--     restent intactes ;
--   * `articles` était déjà en écriture `service_role` seule (004), et le cron comme
--     `/api/admin/*` passent par la clé service-role, qui contourne la RLS — la
--     collecte, le masquage d'un article et la purge continuent de fonctionner ;
--   * `import_summaries` (007) garde sa lecture `authenticated` et n'a aucune politique
--     d'écriture : seule la clé service-role y écrit, ce qui est déjà le cas ;
--   * `user_favorites` / `user_alerts` (001) ne sont pas concernées.
--
-- Le rollback restaure les politiques de 004 **telles quelles**, donc réouvre le trou :
-- c'est le propre d'un retour arrière, mais ne pas s'y arrêter — sans ces politiques,
-- le panneau d'administration n'écrirait plus du tout, puisqu'il écrit avec la clé anon.
-- rollback DROP POLICY IF EXISTS "Admins delete categories" ON categories;
-- rollback DROP POLICY IF EXISTS "Admins update categories" ON categories;
-- rollback DROP POLICY IF EXISTS "Admins insert categories" ON categories;
-- rollback DROP POLICY IF EXISTS "Admins delete cities" ON cities;
-- rollback DROP POLICY IF EXISTS "Admins update cities" ON cities;
-- rollback DROP POLICY IF EXISTS "Admins insert cities" ON cities;
-- rollback DROP POLICY IF EXISTS "Admins delete sources" ON sources;
-- rollback DROP POLICY IF EXISTS "Admins update sources" ON sources;
-- rollback DROP POLICY IF EXISTS "Admins insert sources" ON sources;
-- rollback CREATE POLICY "Auth users manage sources" ON sources FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
-- rollback CREATE POLICY "Auth users manage cities" ON cities FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
-- rollback CREATE POLICY "Auth users manage categories" ON categories FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
