import Link from 'next/link'

/**
 * Pied de page discret, sur le fond de page : plus de bandeau blanc bordé. Il porte la
 * marge basse de la barre d'onglets flottante (`pb-tabbar`), qui sinon le recouvrirait.
 */
export function Footer() {
  return (
    <footer className="pb-tabbar">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-1 px-4 pt-10 text-center text-footnote text-ink-muted sm:px-6 lg:px-8">
        <p>
          <span className="font-semibold text-ink">Ville Actu</span> · Actualités de La Chapelle-sur-Erdre
        </p>
        <p>
          <Link href="/a-propos" className="inline-block py-2 font-medium text-accent focus-ring">
            À propos
          </Link>
          <span aria-hidden="true"> · </span>© {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  )
}
