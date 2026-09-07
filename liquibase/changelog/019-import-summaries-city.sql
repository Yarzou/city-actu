-- liquibase formatted sql

-- Rend `import_summaries.city_id` fiable, pour que les routes de résumé puissent filtrer
-- par ville **en une seule requête**.
--
-- Contexte : `001` a créé la colonne nullable, et les résumés générés avant son
-- introduction portent `city_id IS NULL`. Les deux routes de lecture compensaient par une
-- **seconde requête de repli** sur ces lignes héritées, ce qui coûte un aller-retour dans
-- le cas « aucun résumé » et interdit surtout de résoudre la ville par jointure : un
-- `cities!inner(slug)` exclurait précisément les lignes à NULL.
--
-- On corrige donc la donnée avant de simplifier le code — l'ordre inverse ferait
-- silencieusement disparaître ces résumés de l'historique.


-- changeset ville-actu:019-1-rattacher-les-resumes-orphelins splitStatements:false
-- comment: Rattache les résumés à city_id NULL à la seule ville existante. Refuse de deviner s'il y en a plusieurs.

DO $$
DECLARE
  orphans  INTEGER;
  cities_n INTEGER;
  target   INTEGER;
BEGIN
  SELECT count(*) INTO orphans FROM import_summaries WHERE city_id IS NULL;
  IF orphans = 0 THEN
    RAISE NOTICE 'Aucun résumé orphelin, rien à rattacher.';
    RETURN;
  END IF;

  SELECT count(*) INTO cities_n FROM cities;
  IF cities_n <> 1 THEN
    -- Avec plusieurs villes, rien ne permet de dire à laquelle appartient un résumé
    -- hérité : le rattacher au hasard afficherait le résumé d'une commune sur une autre,
    -- ce qui est exactement le bug que les routes corrigeaient déjà à la main.
    RAISE EXCEPTION
      '% résumé(s) à city_id NULL et % villes en base : rattachement ambigu. Les rattacher à la main avant de rejouer cette migration.',
      orphans, cities_n;
  END IF;

  SELECT id INTO target FROM cities;
  UPDATE import_summaries SET city_id = target WHERE city_id IS NULL;
  RAISE NOTICE '% résumé(s) rattaché(s) à la ville %.', orphans, target;
END $$;

-- Le rollback ne peut pas restaurer les NULL : rien ne distingue plus une ligne rattachée
-- ici d'une ligne qui portait déjà cette ville. Perte sans conséquence — la colonne
-- désigne la bonne ville dans les deux cas.
-- rollback SELECT 1; -- irréversible par nature, voir le commentaire ci-dessus


-- changeset ville-actu:019-2-fk-cascade
-- comment: import_summaries.city_id passe de ON DELETE SET NULL à ON DELETE CASCADE — sinon la suppression d'une ville recréerait des lignes orphelines, que le code ne saura plus lire.

-- `ON DELETE SET NULL` était la source **permanente** du problème traité au changeset 1 :
-- supprimer une ville aurait de nouveau produit des résumés à NULL, invisibles pour un
-- code qui filtre par jointure. Un résumé hebdomadaire d'une ville supprimée n'a par
-- ailleurs aucun lecteur : la cascade est le bon comportement, pas seulement le plus
-- commode.
ALTER TABLE import_summaries DROP CONSTRAINT IF EXISTS import_summaries_city_id_fkey;
ALTER TABLE import_summaries
  ADD CONSTRAINT import_summaries_city_id_fkey
  FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE CASCADE;

-- rollback ALTER TABLE import_summaries DROP CONSTRAINT IF EXISTS import_summaries_city_id_fkey;
-- rollback ALTER TABLE import_summaries ADD CONSTRAINT import_summaries_city_id_fkey FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE SET NULL;


-- changeset ville-actu:019-3-city-id-not-null
-- comment: city_id devient NOT NULL. C'est cette contrainte qui rend correct le filtrage par jointure dans les routes de résumé — sans elle, une insertion oublieuse recréerait un résumé illisible sans que rien ne le signale.

-- Les deux seuls chemins d'écriture fournissent bien la ville : `/api/digest/[citySlug]`
-- insère `city_id: city.id`, et `/api/admin/summarize-recent` — sans appelant, mais
-- toujours joignable à la main — a été corrigée dans le même lot pour ne plus pouvoir
-- insérer NULL.
ALTER TABLE import_summaries ALTER COLUMN city_id SET NOT NULL;

-- rollback ALTER TABLE import_summaries ALTER COLUMN city_id DROP NOT NULL;
