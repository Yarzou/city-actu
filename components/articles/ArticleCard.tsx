'use client'

import { memo, useRef, useLayoutEffect, useState, type ReactNode } from 'react'
import Image from 'next/image'
import { CalendarPlus, CalendarX, Clock, EyeOff, MapPin, Share } from 'lucide-react'
import { cn, extractLocality, formatEventDateRange } from '@/lib/utils'
import { categoryInkStyle, categoryStyle, type CategoryStyle } from '@/lib/category-style'
import type { FeedArticle } from '@/lib/types'
import { FavoriteButton } from './FavoriteButton'

/** Retour d'une action de carte (favori, partage), affiché par le conteneur. */
export interface CardFeedback {
  ok: boolean
  msg: string
}

interface ArticleCardProps {
  article: FeedArticle
  userId?: string | null
  isFavorited?: boolean
  canDelete?: boolean
  deleting?: boolean
  onDelete?: (articleId: number) => void
  /**
   * Rend la commune du lieu cliquable : elle lance une recherche sur ce nom.
   * Absent = lieu affiché en simple texte (aucun feed pour porter la recherche).
   */
  onLocationSearch?: (locality: string) => void
  /** Favori ajouté ou retiré avec succès : le conteneur tient sa liste à jour. */
  onFavoriteToggled?: (articleId: number, favorited: boolean) => void
  /**
   * Messages à afficher hors de la carte : échec d'un favori, « Lien copié ». La carte
   * n'a pas de place pour un bandeau, c'est le conteneur qui l'a.
   */
  onFeedback?: (feedback: CardFeedback) => void
  scrollRestoreContext?: string
  scrollRestoreCount?: number
  /** Charge l'image sans attendre le lazy-loading : à réserver à la carte du LCP. */
  priority?: boolean
  /**
   * `compact` (défaut) : texte à gauche, vignette carrée à droite — la carte d'un fil
   * d'actualités, dense, qui laisse voir plusieurs événements par écran.
   * `hero` : photo en 16/9 en tête, catégorie, horaire et favori posés dessus en verre.
   * Réservée à la première carte illustrée d'une journée : elle donne le rythme du fil
   * sans en faire une galerie. Sans image (absente ou refusée), retombe en compacte.
   */
  variant?: 'compact' | 'hero'
}

const EXTERNAL_LINK_SCROLL_KEY = 'ville-actu:external-link-scroll'

/** Actions de pied de carte : 40 px de côté, en cercle. */
const ACTION_BUTTON =
  'inline-flex size-10 items-center justify-center rounded-full text-ink-muted transition-colors focus-ring'

/**
 * Largeur réelle de la photo d'une grande carte : une colonne sur mobile, puis la
 * grille desktop (deux, trois, quatre colonnes). Sans `sizes`, `fill` fait supposer
 * `100vw` à Next et le navigateur télécharge une image pour toute la largeur d'écran.
 */
const HERO_IMAGE_SIZES =
  '(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw'

/** Tuile de catégorie arrondie, icône blanche : le repère de couleur de la carte. */
function CategoryTile({ style, className }: { style: CategoryStyle; className?: string }) {
  const Icon = style.icon
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px] text-white', className)}
      style={{ backgroundColor: style.color }}
    >
      <Icon className="size-3" strokeWidth={2.4} />
    </span>
  )
}

// Mémoïsé : sans ça toute la liste se re-rendait à chaque changement d'état du feed
// (frappe dans la recherche, bandeau de retour…), et chaque carte refait une mesure
// DOM synchrone dans son useLayoutEffect.
export const ArticleCard = memo(function ArticleCard({ article, userId, isFavorited = false, canDelete = false, deleting = false, onDelete, onLocationSearch, onFavoriteToggled, onFeedback, scrollRestoreContext, scrollRestoreCount, priority = false, variant = 'compact' }: ArticleCardProps) {
  const style = categoryStyle(article.category?.slug)
  const categoryName = article.category?.name ?? 'Actualité'

  const displayDate = article.published_at
    ? formatEventDateRange(article.published_at, article.event_end_date ?? null)
    : null
  const dateTimeAttr = article.event_end_date ?? article.published_at ?? undefined

  // Commune isolée du reste du lieu : c'est elle qui est cliquable, et elle seule qui
  // part en recherche — « Capellia, 1 boulevard…, La Chapelle-sur-Erdre » ne
  // correspondrait à rien. Le préfixe reste affiché, mais c'est lui qui est tronqué en
  // premier : l'information qui décide de l'intérêt est la commune.
  const locality = extractLocality(article.location)
  const localityPrefix = locality && article.location
    ? article.location.slice(0, article.location.lastIndexOf(locality)).replace(/[\s,]+$/, '')
    : ''

  const [expanded, setExpanded] = useState(false)
  const [isClamped, setIsClamped] = useState(false)
  // Une source qui refuse le hotlink laissait une bande grise à la place de la photo,
  // indiscernable d'une image qui n'a pas fini de charger.
  const [imageFailed, setImageFailed] = useState(false)
  const textRef = useRef<HTMLParagraphElement>(null)

  const hasImage = Boolean(article.image_url) && !imageFailed
  const isHero = variant === 'hero' && hasImage

  useLayoutEffect(() => {
    const el = textRef.current
    if (el) setIsClamped(el.scrollHeight > el.clientHeight + 2)
  }, [article.content_preview])

  function rememberScrollBeforeExternalOpen() {
    if (typeof window === 'undefined') return
    if (!scrollRestoreContext) return

    const payload = {
      context: scrollRestoreContext,
      y: window.scrollY,
      ts: Date.now(),
      expectedCount: Math.max(0, scrollRestoreCount ?? 0),
      pendingExternalReturn: true,
    }
    window.sessionStorage.setItem(EXTERNAL_LINK_SCROLL_KEY, JSON.stringify(payload))
  }

  /**
   * Partage natif quand le navigateur l'offre (feuille de partage du téléphone), copie
   * du lien sinon. C'est l'URL de la **source** qui part : c'est l'article que le
   * destinataire veut lire, et il n'a pas besoin de l'application pour l'ouvrir.
   */
  async function share() {
    const data = { title: article.title, url: article.url }
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share(data)
      } catch (err) {
        // Feuille de partage refermée sans choisir : ce n'est pas une erreur.
        if (err instanceof DOMException && err.name === 'AbortError') return
        onFeedback?.({ ok: false, msg: 'Partage impossible.' })
      }
      return
    }
    try {
      await navigator.clipboard.writeText(article.url)
      onFeedback?.({ ok: true, msg: 'Lien copié.' })
    } catch {
      onFeedback?.({ ok: false, msg: 'Impossible de copier le lien.' })
    }
  }

  /**
   * Lien vers la source. Le titre est le lien principal ; la photo en est un second,
   * hors tabulation et masqué aux lecteurs d'écran pour ne pas annoncer deux fois la
   * même cible. L'ancienne icône « lien externe » du pied de carte a disparu : le
   * titre, puis la photo, sont les gestes qu'on fait d'instinct.
   */
  function sourceLink(children: ReactNode, className: string, decorative = false) {
    return (
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={rememberScrollBeforeExternalOpen}
        className={className}
        {...(decorative ? { tabIndex: -1, 'aria-hidden': true } : {})}
      >
        {children}
      </a>
    )
  }

  const image = hasImage ? (
    <Image
      src={article.image_url!}
      // Vide, et non le titre : le `<h2>` porte déjà ce texte, un lecteur d'écran
      // l'annoncerait deux fois de suite.
      alt=""
      fill
      sizes={isHero ? HERO_IMAGE_SIZES : '84px'}
      className="object-cover"
      // `priority` est déprécié depuis Next 16 : `loading="eager"` et `fetchPriority`
      // portent la même intention, sans préchargement forcé dans le <head>.
      loading={priority ? 'eager' : undefined}
      fetchPriority={priority ? 'high' : undefined}
      onError={() => setImageFailed(true)}
    />
  ) : null

  const categoryLine = (
    <p className="cat-ink flex min-w-0 items-center gap-1.5 text-footnote font-semibold" style={categoryInkStyle(style)}>
      <CategoryTile style={style} />
      <span className="truncate">{categoryName}</span>
    </p>
  )

  const dateLine = displayDate ? (
    <p className="flex items-center gap-1.5 text-subhead text-ink-muted">
      <Clock className="size-[15px] shrink-0" aria-hidden="true" />
      <time dateTime={dateTimeAttr}>{displayDate}</time>
    </p>
  ) : null

  /*
    Lieu — rendu seulement quand il est renseigné, donc sans effet sur les cartes des
    sources qui ne le fournissent pas. Il compte surtout dans l'onglet « Autour de la
    Chap' », où les événements viennent des communes voisines.
  */
  const placeLine = article.location ? (
    <p className="flex min-w-0 items-center gap-1.5 text-subhead text-ink-muted" title={article.location}>
      <MapPin className="size-[15px] shrink-0" aria-hidden="true" />
      {localityPrefix && <span className="truncate">{localityPrefix},</span>}
      {locality && (onLocationSearch ? (
        // Un vrai <button> et non un lien : la recherche se fait sans quitter la page
        // (écriture d'URL par pushState). `py-1 -my-1` agrandit la cible au doigt sans
        // écarter la ligne.
        <button
          type="button"
          onClick={() => onLocationSearch(locality)}
          aria-label={`Rechercher les actualités à ${locality}`}
          className="-my-1 max-w-full shrink-0 truncate rounded py-1 text-accent focus-ring"
        >
          {locality}
        </button>
      ) : (
        <span className="max-w-full shrink-0 truncate">{locality}</span>
      ))}
    </p>
  ) : null

  return (
    <article className="flex flex-col overflow-hidden rounded-[20px] bg-card shadow-lift">
      {isHero && (
        <div className="relative aspect-[16/9] shrink-0 bg-fill-soft">
          {sourceLink(image, 'absolute inset-0 block', true)}
          {/* Pastilles de verre posées sur la photo : décoratives au toucher (le doigt
              traverse vers le lien), lues par les lecteurs d'écran. */}
          <span className="glass pointer-events-none absolute left-3 top-3 inline-flex h-8 max-w-[calc(100%-5rem)] items-center gap-1.5 rounded-full pl-1.5 pr-3 text-footnote font-semibold text-ink">
            <CategoryTile style={style} className="size-5 rounded-full" />
            <span className="truncate">{categoryName}</span>
          </span>
          {displayDate && (
            <span className="glass pointer-events-none absolute bottom-3 left-3 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-footnote font-semibold text-ink">
              <Clock className="size-[15px] shrink-0" aria-hidden="true" />
              <time dateTime={dateTimeAttr}>{displayDate}</time>
            </span>
          )}
          {userId && (
            <span className="absolute right-3 top-3">
              <FavoriteButton
                articleId={article.id}
                userId={userId}
                initialFavorited={isFavorited}
                onToggled={onFavoriteToggled}
                onError={onFeedback ? (msg) => onFeedback({ ok: false, msg }) : undefined}
                variant="glass"
              />
            </span>
          )}
        </div>
      )}

      <div className={cn('flex gap-3 px-4', isHero ? 'pt-3' : 'pt-3.5')}>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {!isHero && categoryLine}
          {/*
            Titre cliquable : c'est le premier geste d'un lecteur. Même destination que
            la photo, même mémorisation du scroll pour le retour.
          */}
          <h2 className="line-clamp-3 text-headline text-ink">
            {sourceLink(article.title, 'rounded transition-colors hover:text-accent focus-ring')}
          </h2>
          {!isHero && dateLine}
          {placeLine}
        </div>
        {!isHero && hasImage && sourceLink(
          image,
          'relative size-[84px] shrink-0 overflow-hidden rounded-[14px] bg-fill-soft',
          true
        )}
      </div>

      {/* Aperçu */}
      {article.content_preview && (
        <div className="px-4 pt-1">
          <p ref={textRef} className={cn('text-subhead text-ink-muted', !expanded && 'line-clamp-2')}>
            {article.content_preview}
          </p>
          {(isClamped || expanded) && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded(v => !v) }}
              aria-expanded={expanded}
              className="py-1 text-subhead font-medium text-accent focus-ring"
            >
              {expanded ? 'Voir moins' : 'Lire la suite'}
            </button>
          )}
        </div>
      )}

      {/* Source + actions */}
      <div className="mt-auto flex items-center gap-1 py-1.5 pl-4 pr-2">
        <span className="min-w-0 flex-1 truncate text-footnote text-ink-muted">{article.source?.name}</span>
        {/*
          Lien simple, sans target="_blank" : sur iOS la navigation déclenche le flux
          natif « Ajouter à Calendrier » sans réellement quitter la page, et sur Android
          le fichier est confié à Google Agenda ou à l'appli par défaut. Il n'arme pas la
          restauration de scroll : ce n'est pas un départ vers l'extérieur.
        */}
        {article.published_at ? (
          <a href={`/api/calendar/${article.id}.ics`} className={cn(ACTION_BUTTON, 'hover:text-accent')} aria-label="Ajouter à mon agenda">
            <CalendarPlus className="size-5" />
          </a>
        ) : (
          // Article sans date : le bouton reste en place, barré, plutôt que de
          // disparaître — l'absence laissait croire à un oubli. Un <span> et non un
          // <button disabled> : un élément désactivé ne reçoit pas les événements
          // souris, l'infobulle ne s'afficherait pas de façon fiable.
          <span
            role="img"
            aria-label="Pas d'agenda possible : la source ne donne pas de date pour cette actu"
            className={cn(ACTION_BUTTON, 'cursor-not-allowed text-ink-faint opacity-60')}
            title="Pas d'agenda possible : la source ne donne pas de date pour cette actu"
          >
            <CalendarX className="size-5" />
          </span>
        )}
        <button type="button" onClick={share} className={cn(ACTION_BUTTON, 'hover:text-accent')} aria-label="Partager">
          <Share className="size-5" />
        </button>
        {canDelete && onDelete && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(article.id) }}
            disabled={deleting}
            className={cn(ACTION_BUTTON, 'text-danger disabled:opacity-50')}
            aria-label="Masquer cette actu"
          >
            <EyeOff className={cn('size-5', deleting && 'animate-pulse')} />
          </button>
        )}
        {userId && !isHero && (
          <FavoriteButton
            articleId={article.id}
            userId={userId}
            initialFavorited={isFavorited}
            onToggled={onFavoriteToggled}
            onError={onFeedback ? (msg) => onFeedback({ ok: false, msg }) : undefined}
          />
        )}
      </div>
    </article>
  )
})
