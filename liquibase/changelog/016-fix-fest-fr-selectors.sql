-- liquibase formatted sql

-- changeset ville-actu:016-fix-fest-fr-selectors
-- comment: Sélecteurs de scraping des sources fest.fr — les événements arrivaient sans date. Les libellés affichés sont relatifs ("Demain à 9h30"), mais l'instant exact est dans l'attribut content= des microdonnées schema.org, que le scraper préfère déjà au texte visible. Il ne manquait que la bonne configuration.

-- Constat vérifié le 04/09/2026 sur
-- https://www.fest.fr/agenda/loire-atlantique/fetes-et-animations/week-end,
-- en rejouant les sélecteurs cheerio contre le HTML réel (9 événements, 9 datés) :
--
--   <section class="item" itemscope itemtype="https://schema.org/Event">
--     <a itemprop="url" href="…" class="item">
--       <h2 class="titre" itemprop="name">Forum des associations</h2>
--       <div class="categorie">
--         <span itemprop="addressLocality">Chaumes-en-Retz</span> » …
--       </div>
--       <div itemprop="startDate" content="2026-09-05T07:30Z" class="startDate">Demain à 9h30</div>
--       <div class="ptDescription">…</div>
--     </a>
--   </section>
--
-- `section.item` et NON `.item` : la seconde forme matche aussi le <a class="item">
-- interne, soit 18 nœuds pour 9 événements. Le dédoublonnage par URL rattraperait le
-- coup, mais on paierait deux fois le travail à chaque collecte.
--
-- Pas d'`image_selector` : les cartes de la liste ne portent aucun <img>.
-- Pas d'`end_date_selector` : le site n'expose pas d'`itemprop="endDate"`.
-- Pas de `detail_date_selector` : la date de la liste suffit, et suivre 9 pages de
-- détail pèserait sur le budget de 60 s du cron pour rien.

-- L'opérateur `||` **fusionne** au lieu de remplacer : une clé posée à la main depuis le
-- panneau d'administration et sans rapport avec ce correctif (`title_filter`, `base_url`)
-- survit à la migration. Les six clés ci-dessous, elles, sont écrasées — c'est le but.
-- `COALESCE` couvre le cas d'une source dont la config serait restée NULL.
UPDATE sources
SET scraping_config = COALESCE(scraping_config, '{}'::jsonb) || jsonb_build_object(
      'list_selector',     'section.item',
      'title_selector',    'h2.titre',
      'link_selector',     'a[itemprop="url"]',
      'date_selector',     '[itemprop="startDate"]',
      'content_selector',  '.ptDescription',
      'location_selector', '[itemprop="addressLocality"]'
    )
WHERE type = 'scraping'
  AND url ILIKE '%fest.fr%';

-- Toutes les pages d'agenda de fest.fr sont générées par le même gabarit (département,
-- catégorie et période ne changent que le contenu de la liste), d'où un `ILIKE` sur le
-- domaine plutôt qu'une URL exacte : une source ajoutée depuis sur
-- /agenda/<departement>/<categorie>/<periode> est corrigée du même coup.

-- Le rollback retire les six clés posées ici, il ne **restaure** pas les précédentes :
-- il faudrait les avoir sauvegardées, et elles ne valent pas d'être conservées puisque
-- ce sont précisément celles qui ne remontaient aucune date. Après un retour arrière,
-- les sources fest.fr sont donc sans sélecteurs et à reconfigurer depuis le panneau
-- d'administration. Les clés hors de ce correctif (`title_filter`, `base_url`…) sont
-- laissées intactes, symétriquement à la fusion `||` de l'aller.
-- rollback UPDATE sources SET scraping_config = scraping_config - 'list_selector' - 'title_selector' - 'link_selector' - 'date_selector' - 'content_selector' - 'location_selector' WHERE type = 'scraping' AND url ILIKE '%fest.fr%';
