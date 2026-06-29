-- liquibase formatted sql

-- changeset ville-actu:009-promote-existing-users-admin
-- comment: Promouvoir les utilisateurs existants en admin (one-shot migration)
UPDATE profiles
SET is_admin = TRUE
WHERE is_admin = FALSE;

-- rollback UPDATE profiles SET is_admin = FALSE WHERE is_admin = TRUE;
