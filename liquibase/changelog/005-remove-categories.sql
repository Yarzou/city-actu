-- liquibase formatted sql

-- changeset ville-actu:005-remove-categories
-- comment: Suppression des catégories emploi, infos-pratiques et sorties-adultes

-- Réassigner les sources qui utilisaient ces catégories vers "agenda"
UPDATE sources
SET category_id = (SELECT id FROM categories WHERE slug = 'agenda')
WHERE category_id IN (
  SELECT id FROM categories WHERE slug IN ('emploi', 'infos-pratiques', 'sorties-adultes')
);

-- Réassigner les articles qui utilisaient ces catégories vers "agenda"
UPDATE articles
SET category_id = (SELECT id FROM categories WHERE slug = 'agenda')
WHERE category_id IN (
  SELECT id FROM categories WHERE slug IN ('emploi', 'infos-pratiques', 'sorties-adultes')
);

-- Supprimer les catégories
DELETE FROM categories WHERE slug IN ('emploi', 'infos-pratiques', 'sorties-adultes');

-- rollback INSERT INTO categories (name, slug, icon, color) VALUES
-- rollback   ('Infos pratiques', 'infos-pratiques', '🏛️', 'bg-blue-100 text-blue-800'),
-- rollback   ('Sorties adultes', 'sorties-adultes', '🎭', 'bg-rose-100 text-rose-800'),
-- rollback   ('Emploi',          'emploi',          '💼', 'bg-green-100 text-green-800')
-- rollback ON CONFLICT (slug) DO NOTHING;
