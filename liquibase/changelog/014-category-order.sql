-- liquibase formatted sql

-- changeset ville-actu:014-category-order
-- comment: Ordre d'affichage manuel des catégories — le tri alphabétique n'a jamais été un choix, il tombait d'un .order('name') posé quand la liste ne servait qu'à remplir un select ; elle pilote aujourd'hui la barre de filtres publique.

ALTER TABLE categories ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

-- Backfill : on reprend l'ordre alphabétique actuel plutôt que de tout mettre à 0.
-- Rien ne doit bouger visuellement tant que personne n'a touché aux flèches — un
-- déploiement ne réordonne pas la barre de filtres publique dans le dos de l'admin.
--
-- Pas de 10 : marge pour insérer un jour une catégorie à une position arbitraire
-- (ou saisir un ordre à la main) sans réindexer toute la table. L'échange de voisins
-- implémenté aujourd'hui n'en a pas besoin, mais ça ne coûte rien.
-- Le garde `c.display_order = 0` rend le backfill rejouable à la main sans écraser
-- un ordre déjà choisi depuis l'admin (les valeurs attribuées ici commencent à 10).
UPDATE categories c
SET display_order = r.rn * 10
FROM (SELECT id, row_number() OVER (ORDER BY name) AS rn FROM categories) r
WHERE c.id = r.id
  AND c.display_order = 0;

-- Note : aucun index sur display_order — la table tient sur une main, Postgres fera
-- un seq scan de toute façon.

-- rollback ALTER TABLE categories DROP COLUMN IF EXISTS display_order;
