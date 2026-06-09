# Architecture — Ville Actu

## Vue d'ensemble

**Ville Actu** est un agrégateur d'actualités locales pour La Chapelle-sur-Erdre (44). L'application récupère automatiquement des articles depuis des flux RSS et du scraping web, les stocke dans Supabase, et les expose via une interface Next.js 16 (App Router).

---

## Stack technique

| Couche | Technologie |
|---|---|
| Framework | Next.js 16.2.7 (App Router, React 19) |
| Base de données | Supabase (PostgreSQL + Auth + RLS) |
| Migrations DB | Liquibase (scripts SQL dans `/liquibase/changelog/`) |
| Styling | Tailwind CSS v4 + `tailwind-merge` + `clsx` |
| Fonts | Geist Sans / Geist Mono |
| État client | `useState` / `useCallback` (pas de Zustand utilisé activement) |
| PWA | `@ducanh2912/next-pwa` + service worker (`/sw.js`) |
| Déploiement | Vercel |
| Icons | `lucide-react` |
| Dates | `date-fns` (locale `fr`) |
| Parsing RSS | `rss-parser` |
| Scraping HTML | `cheerio` |

---

## Structure des dossiers

```
ville-actu/
├── app/                         # Next.js App Router
│   ├── layout.tsx               # Layout racine (Navbar + Footer + PWA SW)
│   ├── page.tsx                 # Redirect → /la-chapelle-sur-erdre
│   ├── [citySlug]/
│   │   ├── page.tsx             # Page ville (rendu <ArticleFeed>)
│   │   └── [categorySlug]/
│   │       └── page.tsx         # Page catégorie filtrée
│   ├── article/[id]/            # Page article (non encore implémentée ?)
│   ├── auth/
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── callback/            # OAuth callback Supabase
│   ├── profil/page.tsx          # Profil utilisateur + favoris + onglet admin
│   ├── admin/sources/page.tsx   # Page admin sources (probablement redirect vers /profil)
│   ├── offline/                 # Page fallback PWA
│   └── api/
│       ├── cron/
│       │   └── fetch-news/route.ts   # GET — déclenché par cron Vercel
│       └── admin/
│           ├── refresh/route.ts      # POST — relance le fetch (toutes sources ou une seule)
│           ├── delete/route.ts       # POST — supprime des enregistrements (articles/sources/categories)
│           ├── clear-articles/       # (route dédiée nettoyage articles)
│           └── detect-scraping/      # POST — détection automatique des sélecteurs CSS
│
├── components/
│   ├── layout/
│   │   ├── Navbar.tsx
│   │   └── Footer.tsx
│   ├── articles/
│   │   ├── ArticleFeed.tsx      # Feed principal (client component)
│   │   ├── ArticleCard.tsx      # Carte article
│   │   ├── FavoriteButton.tsx   # Bouton ❤️ (client)
│   │   ├── DateFilter.tsx       # Filtres rapides de date (pills)
│   │   ├── MiniCalendar.tsx     # Calendrier latéral desktop
│   │   └── SkeletonCard.tsx     # Loading skeleton
│   ├── admin/
│   │   └── AdminSourcesPanel.tsx   # Panel admin complet (client component, ~55KB)
│   └── ui/
│       └── ConfirmDialog.tsx
│
├── lib/
│   ├── types.ts                 # Tous les types TypeScript + constantes catégories
│   ├── utils.ts                 # Fonctions utilitaires (cn, formatDate, groupByDay…)
│   ├── supabase/
│   │   ├── client.ts            # createBrowserClient (côté client)
│   │   └── server.ts            # createServerClient avec cookies (côté serveur)
│   └── fetchers/
│       ├── index.ts             # Orchestrateur : fetchAllSources / fetchSourceById
│       ├── rss.ts               # Parsing RSS via rss-parser
│       ├── scraper.ts           # Scraping HTML via cheerio
│       └── classifier.ts        # Classification par mots-clés (→ catégorie)
│
├── liquibase/
│   ├── changelog/
│   │   ├── 001-initial-schema.sql   # Tables + RLS + trigger profil
│   │   ├── 002-seed-data.sql        # Ville + catégories initiales
│   │   ├── 003-seed-sources.sql     # Sources initiales
│   │   ├── 004-admin-rls.sql        # Politiques RLS admin
│   │   ├── 005-remove-categories.sql
│   │   └── 006-event-end-date.sql   # Ajout event_end_date sur articles
│   └── liquibase.properties
│
├── scripts/
│   └── db-migrate.js            # Script Node.js pour lancer Liquibase
│
├── public/
│   ├── manifest.json            # PWA manifest
│   └── icons/
│
├── CLAUDE.md                    # Règles pour agents IA
├── AGENTS.md                    # Règles projet (pas de commit auto)
└── next.config.ts               # Config Next.js (vide pour l'instant)
```

---

## Schéma de base de données

### Tables principales

```
profiles          — Profil utilisateur (id = auth.users.id)
cities            — Villes (slug unique, lat/lng)
categories        — Catégories d'articles (slug unique, icon emoji, color Tailwind)
sources           — Sources RSS ou scraping (city_id, category_id, url, scraping_config JSON)
articles          — Articles agrégés (url UNIQUE, is_duplicate, event_end_date)
user_favorites    — Favoris (user_id, article_id) PK composite
user_alerts       — Alertes utilisateur (user_id, city_id, category_id)
```

### Relations clés
- `sources` → `cities` (cascade delete)
- `sources` → `categories` (restrict delete)
- `articles` → `sources`, `cities`, `categories`
- `user_favorites` → `auth.users`, `articles`
- trigger `on_auth_user_created` → auto-création `profiles`

### RLS (Row Level Security)
- **Public read** : cities, categories, sources, articles (`NOT is_duplicate`)
- **Authentifié** : CRUD sur `user_favorites`, `user_alerts`, read/update `profiles`
- **Service role** : bypass RLS pour les cron writes (via `SUPABASE_SERVICE_ROLE_KEY`)

### Index
```sql
articles_city_category_idx  ON articles(city_id, category_id, published_at DESC)
articles_city_idx           ON articles(city_id, published_at DESC)
articles_fetched_at_idx     ON articles(fetched_at DESC)
```

---

## Catégories

| Slug | Nom | Icon | Couleur |
|---|---|---|---|
| `infos-pratiques` | Infos pratiques | 🏛️ | blue |
| `sorties-enfants` | Sorties enfants | 🎠 | pink |
| `agenda` | Agenda | 📅 | purple |
| `sports` | Sports | ⚽ | orange |
| `travaux` | Travaux | 🚧 | yellow |
| `emploi` | Emploi | 💼 | green |

---

## Flux de données — Ingestion d'articles

```
Cron Vercel (GET /api/cron/fetch-news)
  └── fetchAllSources()           [lib/fetchers/index.ts]
        ├── Pour chaque source active :
        │     ├── type=rss     → fetchRssFeed()      [rss.ts]    — rss-parser, timeout 10s
        │     └── type=scraping → fetchScrapingSource() [scraper.ts] — cheerio, timeout 15s
        │
        ├── classifyArticle()    [classifier.ts]
        │     — mots-clés FR → catégorie (agenda/sorties-enfants/sports/travaux)
        │     — fallback : category_id de la source
        │
        └── INSERT INTO articles (url UNIQUE → skip si doublon, code 23505)
              — 500ms de délai entre chaque source
```

**Variables d'environnement requises :**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET` (valide la requête cron)

---

## Flux de données — Affichage

```
/[citySlug]  →  CityPage (Server Component)
                  └── <ArticleFeed citySlug={...} />  (Client Component)
                        ├── Requête Supabase client :
                        │     articles + source + category + city
                        │     filtres : city_id, is_duplicate=false, [category], [date range]
                        │     pagination : PAGE_SIZE=20, order published_at DESC
                        │
                        ├── Mini-calendrier (dates actives du mois)
                        ├── Filtres de date (pills : Aujourd'hui, Cette semaine, Ce mois)
                        └── Grille de <ArticleCard> (1→4 colonnes selon breakpoint)
```

---

## API Routes Admin

Toutes nécessitent un utilisateur authentifié (`supabase.auth.getUser()`).

| Route | Méthode | Description |
|---|---|---|
| `/api/admin/refresh` | POST | Relance le fetch (body : `{sourceId?}` — toutes si absent) |
| `/api/admin/delete` | POST | Supprime `{table, id?}` — tables autorisées : `categories`, `sources`, `articles` |
| `/api/admin/clear-articles` | POST | Nettoyage articles (probablement par city/source) |
| `/api/admin/detect-scraping` | POST | Détection auto des sélecteurs CSS pour une URL |
| `/api/cron/fetch-news` | GET | Cron Vercel — nécessite header `Authorization: Bearer {CRON_SECRET}` |

---

## Interface Admin (AdminSourcesPanel)

Accessible via `/profil` (onglet "Admin"), uniquement pour les utilisateurs connectés.

Fonctionnalités :
- **CRUD Sources** : ajout/édition/suppression de sources RSS ou scraping
- **Config scraping** : édition inline des sélecteurs CSS (`ScrapingConfig`)
- **Détection auto** : bouton "baguette magique" qui appelle `/api/admin/detect-scraping`
- **Refresh** : déclenche le fetch d'une source ou de toutes
- **Gestion catégories** : ajout/édition/suppression de catégories
- **Suppression articles** : vider tous les articles
- **ConfirmDialog** : dialogue de confirmation avant suppressions

---

## PWA

- Manifest : `/public/manifest.json`
- Service worker : `/sw.js` (géré par `@ducanh2912/next-pwa`)
- Enregistrement via `<Script>` inline dans le layout racine
- `themeColor: '#16a34a'` (vert brand)
- Page offline : `/app/offline`

---

## Conventions de code

- **Alias `@/`** → racine du projet (tsconfig paths)
- **`cn()`** : `clsx` + `tailwind-merge` pour les classes conditionnelles
- **Client Supabase** : `lib/supabase/client.ts` (browser), `lib/supabase/server.ts` (server/RSC/API routes)
- **Service role** : uniquement dans les fetchers (cron/admin), jamais côté client
- Composants client : déclarés `'use client'` en tête de fichier
- Locale FR partout : `date-fns/locale/fr`, labels en français
- Couleur brand : `brand-600` (vert, défini via Tailwind CSS v4 custom property)

---

## Migrations DB

```bash
npm run db:migrate   # Applique les changelogs Liquibase
npm run db:status    # Statut des migrations
npm run db:rollback  # Rollback
npm run db:validate  # Validation
npm run db:tag       # Pose un tag
```

Fichiers dans `/liquibase/changelog/` — format SQL Liquibase avec `-- changeset` et `-- rollback`.

---

## Ville actuelle

L'application est actuellement dédiée à **La Chapelle-sur-Erdre** (slug : `la-chapelle-sur-erdre`, 47.2859°N / 1.5521°W, 44240 Loire-Atlantique). La page `/` redirige directement vers `/la-chapelle-sur-erdre`. L'architecture est multi-villes (table `cities`), mais une seule ville est seedée.
