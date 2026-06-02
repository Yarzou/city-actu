-- liquibase formatted sql

-- changeset ville-actu:004-admin-rls
-- comment: Policies admin — les utilisateurs connectés peuvent gérer sources, cities, categories et articles

-- Sources : les utilisateurs authentifiés peuvent créer, modifier, supprimer
CREATE POLICY "Auth users manage sources"
  ON sources FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Cities : les utilisateurs authentifiés peuvent créer, modifier, supprimer
CREATE POLICY "Auth users manage cities"
  ON cities FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Categories : les utilisateurs authentifiés peuvent créer, modifier, supprimer
CREATE POLICY "Auth users manage categories"
  ON categories FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Articles : le service role peut tout faire (pour le fetch automatique)
CREATE POLICY "Service role manage articles"
  ON articles FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- rollback DROP POLICY IF EXISTS "Service role manage articles" ON articles;
-- rollback DROP POLICY IF EXISTS "Auth users manage categories" ON categories;
-- rollback DROP POLICY IF EXISTS "Auth users manage cities" ON cities;
-- rollback DROP POLICY IF EXISTS "Auth users manage sources" ON sources;
