-- liquibase formatted sql

-- changeset ville-actu:005-sorties-adultes
-- comment: Ajout catégorie "Sorties adultes"

INSERT INTO categories (name, slug, icon, color)
VALUES ('Sorties adultes', 'sorties-adultes', '🎭', 'bg-rose-100 text-rose-800')
ON CONFLICT (slug) DO NOTHING;

-- rollback DELETE FROM categories WHERE slug = 'sorties-adultes';
