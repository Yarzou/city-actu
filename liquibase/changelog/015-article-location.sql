-- liquibase formatted sql

-- changeset ville-actu:015-article-location
-- comment: Localisation des articles — nécessaire au champ LOCATION des exports .ics ("ajouter au calendrier"). La donnée existait déjà côté open data (lieu/adresse/ville) mais était fondue dans content_preview, et seulement en l'absence de description.

ALTER TABLE articles ADD COLUMN IF NOT EXISTS location TEXT;

-- Pas d'index : la colonne n'est jamais filtrée ni triée, seulement lue à l'unité
-- au moment de générer un fichier .ics.
--
-- Pas de backfill possible : la donnée n'a jamais été collectée. Les articles
-- existants restent à NULL et l'export retombe sur le nom de la ville ; ils se
-- rempliront au fil des prochaines collectes.

-- rollback ALTER TABLE articles DROP COLUMN IF EXISTS location;
