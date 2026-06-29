# Ville Actu 📰

Agrégateur d'actualités locales pour **La Chapelle-sur-Erdre** (extensible à d'autres villes).

Collecte automatiquement les actus via **RSS feeds** et **scraping web**, les catégorise, et les affiche dans un feed moderne. Les utilisateurs connectés peuvent sauvegarder des **favoris** et configurer des **alertes** par catégorie.

## Stack

- **Next.js 16** App Router (TypeScript)
- **Supabase** (Auth + PostgreSQL)
- **Tailwind CSS v4**
- **rss-parser** + **cheerio** pour l'agrégation
- **Liquibase** pour les migrations
- **Vercel Cron** pour le fetch automatique (toutes les heures)

## Installation

```bash
npm install

# Copier et remplir les variables d'environnement
cp .env.local.example .env.local

# Configurer Liquibase
cp liquibase/liquibase.properties.example liquibase/liquibase.properties
# Renseigner url, username, password (Supabase > Settings > Database)

# Appliquer les migrations
npm run db:migrate

# Démarrer le serveur de développement
npm run dev
```

## Scripts

```bash
npm run dev          # Serveur de développement (http://localhost:3000)
npm run build        # Build de production
npm run lint         # ESLint
npm run db:migrate   # Appliquer les migrations
npm run db:status    # État des changelogs
npm run db:rollback  # Rollback au dernier tag
npm run db:tag       # Poser un tag
npm run db:validate  # Valider les fichiers changelog
```

## Structure des dossiers

```
app/
  page.tsx                       # Homepage
  [citySlug]/page.tsx            # Feed d'une ville
  [citySlug]/[categorySlug]/     # Feed filtré par catégorie
  article/[id]/                  # Détail article
  auth/login|signup/             # Authentification Supabase
  profil/                        # Favoris + alertes utilisateur
  admin/sources/                 # CRUD sources (admin)
  api/cron/fetch-news/           # Endpoint cron Vercel

lib/
  fetchers/rss.ts                # Parser RSS
  fetchers/scraper.ts            # Scraping web (cheerio)
  fetchers/index.ts              # Orchestrateur + déduplication
  supabase/client.ts             # Client navigateur
  supabase/server.ts             # Client serveur
  types.ts                       # Types partagés
  utils.ts                       # Utilitaires

components/
  layout/                        # Navbar, Footer
  articles/                      # ArticleCard, ArticleFeed, FavoriteButton, SkeletonCard

liquibase/changelog/
  001-initial-schema.sql         # Tables + RLS
  002-seed-data.sql              # Ville + catégories
  003-seed-sources.sql           # Sources initiales
```

## Catégories

| Slug | Nom | Icône |
|------|-----|-------|
| `infos-pratiques` | Infos pratiques | 🏛️ |
| `sorties-enfants` | Sorties enfants | 🎠 |
| `agenda` | Agenda | 📅 |
| `sports` | Sports | ⚽ |
| `travaux` | Travaux | 🚧 |
| `emploi` | Emploi | 💼 |

## Ajouter une source

Via `/admin/sources` ou en SQL :
```sql
-- Source RSS
INSERT INTO sources (city_id, category_id, name, url, type, active)
VALUES (1, 1, 'Mairie — RSS', 'https://...', 'rss', true);

-- Source scraping
INSERT INTO sources (city_id, category_id, name, url, type, active, scraping_config)
VALUES (1, 2, 'Agenda local', 'https://...', 'scraping', true,
  '{"list_selector":"article","title_selector":"h2","link_selector":"a","base_url":"https://..."}'::jsonb);
```

## Variables d'environnement

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL du projet Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé anon publique |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé service role (cron) |
| `CRON_SECRET` | Secret pour sécuriser `/api/cron/fetch-news` |
| `GMAIL_USER` | Email Gmail expéditeur (SMTP) |
| `GMAIL_APP_PASSWORD` | Mot de passe d'application Gmail (SMTP) |
