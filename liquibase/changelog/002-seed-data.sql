-- liquibase formatted sql

-- changeset ville-actu:002-seed-data
-- comment: Données initiales : ville La Chapelle-sur-Erdre + catégories

INSERT INTO cities (name, slug, lat, lng, description)
VALUES (
  'La Chapelle-sur-Erdre',
  'la-chapelle-sur-erdre',
  47.2859,
  -1.5521,
  'Commune de Loire-Atlantique, au nord de Nantes (44240).'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (name, slug, icon, color) VALUES
  ('Infos pratiques',  'infos-pratiques', '🏛️', 'bg-blue-100 text-blue-800'),
  ('Sorties enfants',  'sorties-enfants', '🎠', 'bg-pink-100 text-pink-800'),
  ('Agenda',           'agenda',          '📅', 'bg-purple-100 text-purple-800'),
  ('Sports',           'sports',          '⚽', 'bg-orange-100 text-orange-800'),
  ('Travaux',          'travaux',         '🚧', 'bg-yellow-100 text-yellow-800'),
  ('Emploi',           'emploi',          '💼', 'bg-green-100 text-green-800')
ON CONFLICT (slug) DO NOTHING;

-- rollback DELETE FROM categories WHERE slug IN ('infos-pratiques','sorties-enfants','agenda','sports','travaux','emploi');
-- rollback DELETE FROM cities WHERE slug = 'la-chapelle-sur-erdre';
