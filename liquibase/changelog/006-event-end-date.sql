-- liquibase formatted sql

-- changeset ville-actu:006-event-end-date
-- comment: Ajout du champ event_end_date sur les articles (pour les événements multi-jours)
ALTER TABLE articles ADD COLUMN IF NOT EXISTS event_end_date TIMESTAMPTZ;

-- rollback ALTER TABLE articles DROP COLUMN IF EXISTS event_end_date;
