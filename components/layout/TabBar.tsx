'use client'

import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type Ref } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Heart, MapPin, Newspaper, Sparkles, type LucideIcon } from 'lucide-react'
import { LIFT, MAGNIFY, magnifyOrigin, useLoupe, type Lens } from '@/components/ui/useLoupe'
import { pushTab, tabSearch, toHomeTab, type HomeTab } from '@/lib/feed/tabs'
import { cn } from '@/lib/utils'

const DEFAULT_CITY_SLUG = 'la-chapelle-sur-erdre'

/** Chemins où la barre gênerait plus qu'elle n'aiderait. */
const HIDDEN_PREFIXES = ['/auth']

/**
 * Routes de premier niveau qui ne sont pas des villes. Toute nouvelle route doit
 * figurer ici : sinon son segment est pris pour un slug de ville, `onCityRoot` devient
 * vrai et les onglets ne font plus que réécrire `?tab=` sur place — la barre ne
 * permettrait alors plus de quitter la page.
 */
const NON_CITY_SEGMENTS = ['profil', 'compte', 'admin', 'a-propos', 'offline', 'auth']

interface Tab {
  tab: HomeTab
  label: string
  icon: LucideIcon
}

/**
 * Quatre onglets pour tout le monde. L'administration n'a plus d'entrée ici : elle se
 * rejoint depuis la page « Compte » (bouton rond en haut à droite de chaque écran),
 * comme l'activation de Face ID — un seul point d'entrée par cible.
 *
 * « Autour » et « Résumé » sont les libellés courts des onglets « Autour de la Chap’ »
 * et « Résumé IA » : à 11 px dans une cellule de ~85 px, les longs passeraient à la
 * ligne.
 */
const TABS: Tab[] = [
  { tab: 'actus', label: 'Actus', icon: Newspaper },
  { tab: 'metropole', label: 'Autour', icon: MapPin },
  { tab: 'favoris', label: 'Favoris', icon: Heart },
  { tab: 'ia', label: 'Résumé', icon: Sparkles },
]

/** Marge intérieure de la barre (p-1), en px : la bulle ne la franchit pas. */
const INSET = 4
/** Marge de la bulle autour de l'icône et du libellé, de chaque côté. */
const PAD_X = 14

interface Slot {
  /** Bord gauche du contenu (icône + libellé), depuis le bord intérieur de la barre */
  left: number
  width: number
}

interface Bar {
  /** Largeur intérieure (sans la bordure) */
  width: number
  slots: Slot[]
}

/** Onglet sous un point de la barre (abscisse depuis son bord intérieur gauche). */
function tabAt(x: number, bar: Bar) {
  return Math.min(TABS.length - 1, Math.max(0, Math.floor(((x - INSET) / (bar.width - INSET * 2)) * TABS.length)))
}

/** Largeur de la bulle autour du contenu d'un onglet. */
function bubbleWidth(bar: Bar, i: number) {
  return Math.min(bar.slots[i].width + PAD_X * 2, bar.width - INSET * 2)
}

/** Bord gauche d'une bulle centrée sur `center`, sans sortir de la barre. */
function bubbleLeft(bar: Bar, center: number, width: number) {
  return Math.min(Math.max(center - width / 2, INSET), bar.width - INSET - width)
}

/** Icône et libellé d'un onglet : dans la barre, et agrandis dans la loupe. */
function TabContent({ tab, ref }: { tab: Tab; ref?: Ref<HTMLSpanElement> }) {
  const Icon = tab.icon
  return (
    <span ref={ref} className="relative flex flex-col items-center gap-0.5 text-caption font-semibold">
      <Icon size={24} strokeWidth={2} aria-hidden="true" />
      {tab.label}
    </span>
  )
}

/**
 * Barre d'onglets flottante en verre, façon « Liquid Glass » d'iOS 26, reprise de
 * Fridge. Elle remplace la barre basse à fond blanc et la rangée d'onglets desktop :
 * une seule navigation, sur tous les écrans, posée bas et centrée.
 *
 * Au repos, la barre est très transparente et peu floutée : on devine les cartes qui
 * défilent dessous. Elle devient presque opaque dès que le doigt s'y pose.
 *
 * L'onglet choisi est marqué par une bulle taillée sur mesure autour de son icône et
 * de son libellé (mesurés par un ResizeObserver).
 * - Doigt posé, la bulle se soulève en loupe : elle rejoint le doigt, le suit d'un
 *   onglet à l'autre et agrandit vraiment ce qu'elle couvre (une copie des onglets,
 *   agrandie autour de son centre).
 * - Au lâcher, elle se pose sur l'onglet touché, ou sur le plus proche après un
 *   glissé, en s'étirant comme une goutte d'eau, sans attendre la page.
 * Avec « Réduire les animations », elle se déplace sans effet.
 *
 * **Changer d'onglet ne navigue pas** sur la page ville déjà affichée : seul le
 * `?tab=` change, écrit par `pushTab` (pushState), comme avant la refonte. Une
 * navigation complète coûtait `loading.tsx` + requête RSC + `queryArticles` rejoué
 * côté serveur, soit ~1,5 s au doigt sur mobile. Ailleurs (`/compte`, `/a-propos`…),
 * l'onglet est un vrai lien vers la ville.
 */
export function TabBar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()

  const barRef = useRef<HTMLDivElement>(null)
  const contentRefs = useRef<(HTMLSpanElement | null)[]>([])
  const gesture = useRef<{ startX: number; dragging: boolean } | null>(null)
  const swallowClick = useRef(false)
  // Onglet visé au toucher, valable tant que l'URL n'a pas changé
  const [pending, setPending] = useState<{ index: number; from: string } | null>(null)
  const { lens, grab, follow, drop } = useLoupe()
  // La goutte ne se déforme qu'après un premier geste, pas à l'ouverture de l'appli
  const [touched, setTouched] = useState(false)
  const [bar, setBar] = useState<Bar | null>(null)

  const hidden = HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))

  useEffect(() => {
    const el = barRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      const box = el.getBoundingClientRect()
      setBar({
        width: el.clientWidth,
        slots: contentRefs.current.map((content) => {
          const r = content?.getBoundingClientRect()
          return r ? { left: r.left - box.left - el.clientLeft, width: r.width } : { left: 0, width: 0 }
        }),
      })
    })
    observer.observe(el)
    contentRefs.current.forEach((content) => content && observer.observe(content))
    return () => observer.disconnect()
  }, [hidden])

  if (hidden) return null

  // Le slug de ville se lit dans l'URL : la barre vit dans le layout racine, elle n'a
  // pas accès aux props de la page. Repli sur la seule ville seedée ailleurs.
  const firstSegment = pathname.split('/').filter(Boolean)[0]
  const citySlug = firstSegment && !NON_CITY_SEGMENTS.includes(firstSegment) ? firstSegment : DEFAULT_CITY_SLUG
  const cityRoot = `/${citySlug}`
  const onCityRoot = pathname === cityRoot
  // Même relecture que la page et `CityHomePage` : un `?tab=` inconnu affiche Actus, et
  // `guinguettes` reste un alias de `metropole` (raccourcis des PWA déjà installées).
  const activeIndex = onCityRoot ? TABS.findIndex(({ tab }) => tab === toHomeTab(searchParams.get('tab'))) : -1
  const location = `${pathname}?${searchParams.toString()}`
  const index = pending && pending.from === location ? pending.index : activeIndex
  const lifted = lens !== null && bar !== null
  // Doigt posé : l'onglet sous la loupe prend la couleur de l'onglet choisi
  const highlighted = lifted ? tabAt(lens.center, bar) : index

  const localX = (clientX: number) => {
    const el = barRef.current!
    return clientX - el.getBoundingClientRect().left - el.clientLeft
  }

  /** La loupe vise le doigt, avec la largeur de l'onglet survolé. */
  const aim = (x: number): Lens => ({ center: x, width: bar ? bubbleWidth(bar, tabAt(x, bar)) : 0 })

  /** La bulle part tout de suite vers l'onglet, sans attendre la page. */
  const mark = (next: number) => {
    setTouched(true)
    setPending({ index: next, from: location })
  }

  /** Ouvre un onglet : réécriture de `?tab=` sur la page ville, navigation ailleurs. */
  const open = (next: number) => {
    if (!onCityRoot) {
      router.push(`${cityRoot}${tabSearch(TABS[next].tab)}`)
      return
    }
    // Onglet déjà actif : remontée en haut, le geste attendu d'une barre d'onglets.
    if (next === activeIndex) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    pushTab(TABS[next].tab)
    // `pushState` ne remonte pas en tête de page, et un onglet neuf ouvert au milieu du
    // feed précédent paraît cassé.
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (!bar) return
    gesture.current = { startX: e.clientX, dragging: false }
    swallowClick.current = false
    setTouched(true)
    // La loupe part de la bulle de l'onglet choisi pour rejoindre le doigt.
    const x = localX(e.clientX)
    const start = index >= 0 ? index : tabAt(x, bar)
    const width = bubbleWidth(bar, start)
    grab({ center: bubbleLeft(bar, bar.slots[start].left + bar.slots[start].width / 2, width) + width / 2, width }, aim(x))
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g) return
    if (!g.dragging && Math.abs(e.clientX - g.startX) >= 8) {
      g.dragging = true
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    follow(aim(localX(e.clientX)))
  }

  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    gesture.current = null
    drop()
    if (!g || !bar) return
    if (g.dragging) {
      swallowClick.current = true
      const next = tabAt(localX(e.clientX), bar)
      mark(next)
      open(next)
      return
    }
    // Simple toucher : la bulle se pose sur l'onglet touché dès le lâcher, le clic qui
    // suit ouvre l'onglet.
    const tab = e.type === 'pointerup' ? (e.target as Element).closest<HTMLElement>('[data-tab]') : null
    if (tab) mark(Number(tab.dataset.tab))
  }

  const onTabClick = (event: MouseEvent<HTMLAnchorElement>, i: number) => {
    // Le `href` reste vrai — ouverture dans un onglet, copie du lien, lecteurs d'écran.
    // Les clics modifiés le suivent tel quel.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    mark(i)
    if (!onCityRoot) return
    event.preventDefault()
    open(i)
  }

  // Bulle : autour du contenu de l'onglet choisi, ou loupe sous le doigt.
  let bubble: { left: number; width: number } | null = null
  if (lifted) {
    bubble = { left: bubbleLeft(bar, lens.center, lens.width), width: lens.width }
  } else if (bar && index >= 0) {
    const width = bubbleWidth(bar, index)
    bubble = { left: bubbleLeft(bar, bar.slots[index].left + bar.slots[index].width / 2, width), width }
  }

  return (
    <nav
      aria-label="Navigation principale"
      className="bottom-tabbar fixed inset-x-0 z-40 flex justify-center px-4"
      style={{ paddingLeft: 'calc(var(--sal) + 1rem)', paddingRight: 'calc(var(--sar) + 1rem)' }}
    >
      <div
        ref={barRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={(e) => {
          // Fin d'un glissé : l'onglet est déjà ouvert, pas de second clic. Le clic du
          // clavier (detail 0) n'est jamais celui d'un glissé.
          if (swallowClick.current && e.detail !== 0) {
            e.preventDefault()
            e.stopPropagation()
            swallowClick.current = false
          }
        }}
        className={cn(
          'glass-rim grid h-[62px] w-full max-w-md touch-none select-none grid-cols-4 rounded-full border border-tabbar-edge p-1 shadow-panel backdrop-blur-[10px] backdrop-saturate-[1.8] transition-colors duration-200',
          lifted ? 'bg-tabbar-pressed' : 'bg-tabbar'
        )}
      >
        {bubble && (
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-y-1 left-0',
              // Loupe : au-dessus des onglets, qu'elle cache et remplace par leur copie
              // agrandie. Elle suit le doigt image par image, sans transition.
              lifted
                ? 'z-20'
                : 'transition-[transform,width] duration-500 ease-[cubic-bezier(0.34,1.4,0.5,1)] motion-reduce:transition-none'
            )}
            style={{ transform: `translateX(${bubble.left}px)`, width: bubble.width }}
          >
            <span
              key={touched ? index : 'repos'}
              className={cn(
                'relative block h-full w-full overflow-hidden rounded-full transition-[transform,background-color,box-shadow] duration-200',
                lifted ? 'bg-loupe shadow-lens' : 'bg-bubble shadow-pill',
                touched && !lifted && 'motion-safe:animate-bubble'
              )}
              style={lifted ? { transform: `scale(${LIFT})` } : undefined}
            >
              {lifted && (
                // Copie des onglets, posée exactement sur l'originale puis agrandie autour
                // du centre de la loupe : elle grossit ce qui est dessous.
                <span
                  className="absolute inset-y-0 grid grid-cols-4"
                  style={{
                    left: INSET - bubble.left,
                    width: bar.width - INSET * 2,
                    transform: `scale(${MAGNIFY})`,
                    transformOrigin: `${magnifyOrigin(lens.center, bubble.left + bubble.width / 2) - INSET}px 50%`,
                  }}
                >
                  {TABS.map((tab, i) => (
                    <span key={tab.tab} className={cn('flex items-center justify-center', i === highlighted ? 'text-accent' : 'text-ink-muted')}>
                      <TabContent tab={tab} />
                    </span>
                  ))}
                </span>
              )}
            </span>
          </span>
        )}

        {TABS.map((tab, i) => (
          <Link
            key={tab.tab}
            href={`${cityRoot}${tabSearch(tab.tab)}`}
            draggable={false}
            data-tab={i}
            onClick={(event) => onTabClick(event, i)}
            aria-current={i === activeIndex ? 'page' : undefined}
            className={cn(
              'relative z-10 flex items-center justify-center rounded-full transition-colors duration-300 focus-ring',
              i === highlighted ? 'text-accent' : 'text-ink-muted'
            )}
          >
            <TabContent
              tab={tab}
              ref={(el) => {
                contentRefs.current[i] = el
              }}
            />
          </Link>
        ))}
      </div>
    </nav>
  )
}
