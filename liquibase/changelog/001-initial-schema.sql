-- liquibase formatted sql

-- changeset ville-actu:001-tables
-- comment: Schéma initial : profiles, cities, categories, sources, articles, user_favorites, user_alerts

CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT,
  display_name  TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS cities (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  lat         DOUBLE PRECISION NOT NULL DEFAULT 0,
  lng         DOUBLE PRECISION NOT NULL DEFAULT 0,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,
  icon       TEXT NOT NULL DEFAULT '📰',
  color      TEXT NOT NULL DEFAULT 'bg-gray-100 text-gray-800',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS sources (
  id               SERIAL PRIMARY KEY,
  city_id          INTEGER NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  category_id      INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name             TEXT NOT NULL,
  url              TEXT NOT NULL,
  type             TEXT NOT NULL CHECK (type IN ('rss', 'scraping')),
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  scraping_config  JSONB,
  created_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (city_id, url)
);

CREATE TABLE IF NOT EXISTS articles (
  id               SERIAL PRIMARY KEY,
  source_id        INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  city_id          INTEGER NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  category_id      INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  title            TEXT NOT NULL,
  content_preview  TEXT,
  url              TEXT NOT NULL UNIQUE,
  image_url        TEXT,
  published_at     TIMESTAMPTZ,
  fetched_at       TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  is_duplicate     BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS articles_city_category_idx ON articles (city_id, category_id, published_at DESC);
CREATE INDEX IF NOT EXISTS articles_city_idx ON articles (city_id, published_at DESC);
CREATE INDEX IF NOT EXISTS articles_fetched_at_idx ON articles (fetched_at DESC);

CREATE TABLE IF NOT EXISTS user_favorites (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  article_id  INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  PRIMARY KEY (user_id, article_id)
);

CREATE TABLE IF NOT EXISTS user_alerts (
  id           SERIAL PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  city_id      INTEGER NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  category_id  INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE (user_id, city_id, category_id)
);

-- rollback DROP TABLE IF EXISTS user_alerts CASCADE;
-- rollback DROP TABLE IF EXISTS user_favorites CASCADE;
-- rollback DROP TABLE IF EXISTS articles CASCADE;
-- rollback DROP TABLE IF EXISTS sources CASCADE;
-- rollback DROP TABLE IF EXISTS categories CASCADE;
-- rollback DROP TABLE IF EXISTS cities CASCADE;
-- rollback DROP TABLE IF EXISTS profiles CASCADE;

-- changeset ville-actu:001-handle-new-user splitStatements:false
-- comment: Fonction trigger auto-création du profil à l'inscription
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
-- rollback DROP FUNCTION IF EXISTS handle_new_user();

-- changeset ville-actu:001-trigger-new-user
-- comment: Trigger sur auth.users pour appeler handle_new_user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
-- rollback DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- changeset ville-actu:001-rls
-- comment: Activation RLS et politiques de sécurité
ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE cities         ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources        ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_alerts    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read cities"      ON cities      FOR SELECT USING (true);
CREATE POLICY "Public read categories"  ON categories  FOR SELECT USING (true);
CREATE POLICY "Public read sources"     ON sources     FOR SELECT USING (true);
CREATE POLICY "Public read articles"    ON articles    FOR SELECT USING (NOT is_duplicate);

CREATE POLICY "Users can read own profile"   ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users manage own favorites"
  ON user_favorites FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own alerts"
  ON user_alerts FOR ALL USING (auth.uid() = user_id);

-- rollback DROP POLICY IF EXISTS "Users manage own alerts" ON user_alerts;
-- rollback DROP POLICY IF EXISTS "Users manage own favorites" ON user_favorites;
-- rollback DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
-- rollback DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
-- rollback DROP POLICY IF EXISTS "Public read articles" ON articles;
-- rollback DROP POLICY IF EXISTS "Public read sources" ON sources;
-- rollback DROP POLICY IF EXISTS "Public read categories" ON categories;
-- rollback DROP POLICY IF EXISTS "Public read cities" ON cities;
