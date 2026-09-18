-- liquibase formatted sql

-- « Database error saving new user » au POST /auth/v1/signup.
--
-- Le message vient de GoTrue, qui masque toujours de la même façon **n'importe quelle**
-- exception levée pendant l'INSERT dans `auth.users`. Or un seul objet de ce projet
-- s'exécute à ce moment-là : le trigger `on_auth_user_created` (001) et sa fonction
-- `handle_new_user()`. Si elle lève, l'inscription entière est annulée — le trigger est
-- `AFTER INSERT`, mais dans la même transaction.
--
-- Cette fonction est `SECURITY DEFINER` **sans `SET search_path`** — la seule du projet
-- dans ce cas, alors que 018 pose explicitement la règle inverse pour `is_admin()`. Deux
-- conséquences, l'une fonctionnelle et l'autre de sécurité :
--
--   * la connexion qui insère dans `auth.users` est celle du service Auth
--     (`supabase_auth_admin`), dont le `search_path` de rôle n'est pas celui de
--     l'application. `profiles`, non qualifié, se résout donc dans le chemin de
--     l'**appelant** : dès qu'il ne contient plus `public`, la fonction échoue sur
--     « relation "profiles" does not exist » et l'inscription remonte le message
--     générique ci-dessus ;
--   * c'est aussi la faille classique du `SECURITY DEFINER` : l'appelant choisit à quel
--     objet `profiles` la fonction écrit.
--
-- Le correctif fige le chemin **et** qualifie la table, ceinture et bretelles : avec
-- `search_path = ''`, tout nom non qualifié devient une erreur immédiate et visible,
-- plutôt qu'un objet résolu ailleurs.


-- changeset ville-actu:022-1-handle-new-user-search-path splitStatements:false
-- comment: handle_new_user() : search_path figé et table qualifiée. Corrige l'échec d'inscription et ferme le détournement de résolution de noms permis par un SECURITY DEFINER sans chemin.

-- Corps inchangé par ailleurs — `ON CONFLICT (id) DO NOTHING` reste nécessaire : la
-- confirmation d'email peut rejouer l'insertion, et une erreur ici annulerait le compte.
--
-- `pg_temp` en fin de chemin et non en tête : c'est la recommandation pour une fonction
-- `SECURITY DEFINER`, un schéma temporaire prioritaire étant contrôlable par l'appelant.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- rollback CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $BODY$ BEGIN INSERT INTO profiles (id, email) VALUES (NEW.id, NEW.email) ON CONFLICT (id) DO NOTHING; RETURN NEW; END; $BODY$;


-- changeset ville-actu:022-2-grant-handle-new-user
-- comment: Droit d'exécution au rôle du service Auth. Une fonction de trigger que le rôle appelant ne peut pas exécuter fait échouer l'INSERT — même symptôme, autre cause.

-- Le privilège EXECUTE est accordé à PUBLIC par défaut, donc ce GRANT est le plus souvent
-- redondant. Il ne l'est pas si un durcissement (`REVOKE ... FROM PUBLIC`) est passé
-- depuis, ce qui est le second scénario connu pour ce message : autant rendre la
-- dépendance explicite ici plutôt que de la laisser à un défaut global.
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

-- rollback REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM supabase_auth_admin;


-- changeset ville-actu:022-3-profiles-insert-grant splitStatements:false
-- comment: Droits de table pour le propriétaire de la fonction. Sans eux, le SECURITY DEFINER échoue sur `permission denied for table profiles` — troisième cause connue du même message générique.

-- La fonction s'exécute avec les droits de son **propriétaire** (le rôle qui applique les
-- migrations, `postgres`), qui est aussi propriétaire de `profiles` : il écrit donc sans
-- être soumis à la RLS, laquelle n'a d'ailleurs aucune politique INSERT sur cette table.
-- C'est voulu — la création d'un profil n'appartient qu'à ce trigger, jamais au client.
--
-- Rien à accorder dans ce cas nominal. Ce changeset ne fait que le constater et échouer
-- bruyamment si l'appartenance a divergé, plutôt que de laisser le problème se manifester
-- à la prochaine inscription d'un visiteur.
DO $$
DECLARE
  fn_owner   TEXT;
  tbl_owner  TEXT;
BEGIN
  SELECT pg_get_userbyid(p.proowner) INTO fn_owner
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'handle_new_user';

  SELECT tableowner INTO tbl_owner
    FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles';

  IF fn_owner IS DISTINCT FROM tbl_owner THEN
    RAISE EXCEPTION
      'handle_new_user() appartient à % alors que profiles appartient à % : le SECURITY DEFINER sera soumis à la RLS de profiles, qui n''a aucune politique INSERT, et toute inscription échouera. Réaligner les propriétaires (ALTER FUNCTION ... OWNER TO %).',
      fn_owner, tbl_owner, tbl_owner;
  END IF;
END $$;

-- rollback SELECT 1; -- vérification seule, rien à défaire
