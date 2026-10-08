import { Suspense } from 'react'
import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'
import { Footer } from '@/components/layout/Footer'
import { TabBar } from '@/components/layout/TabBar'
import { ScrollToTop } from '@/components/layout/ScrollToTop'
import PWAInstallBanner from '@/components/layout/PWAInstallBanner'
import { ThemeProvider } from '@/components/theme/ThemeProvider'

export const viewport: Viewport = {
  // Couleur du fond de page : la barre d'état se fond dans l'écran, comme une appli
  // native, au lieu de la bande verte d'avant.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2f2f7' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: {
    default: 'Ville Actu — La Chapelle-sur-Erdre',
    template: '%s | Ville Actu',
  },
  description: "Actualités locales agrégées : infos pratiques, sorties enfants, agenda et plus encore pour La Chapelle-sur-Erdre.",
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Ville Actu',
  },
  // Plus de champ `icons` ici : les icônes passent par les conventions de fichiers,
  // `app/icon.svg` pour l'onglet et `app/apple-icon.tsx` pour l'écran d'accueil iOS.
  // Next injecte les balises correspondantes ; les déclarer aussi dans `metadata`
  // produirait des doublons.
}

/**
 * Layout racine de la refonte « Givre ».
 *
 * Plus de barre haute fixe : chaque écran porte son grand titre et, dans son coin, le
 * bouton rond du compte (`PageHeader`). La navigation tient dans la barre d'onglets
 * flottante en verre (`TabBar`), la même sur téléphone et sur ordinateur. Le layout ne
 * résout donc plus la session : elle ne servait qu'à la barre haute et à l'entrée
 * « Admin » de l'ancienne barre basse, et les pages la redemandent au cache par requête
 * (`lib/auth/session.ts`) quand elles en ont besoin.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||((t==='system'||!t)&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="font-sans bg-canvas text-ink antialiased min-h-full flex flex-col">
        <ThemeProvider>
          {/*
            Bande opaque sous la barre d'état. En PWA standalone (`viewportFit: cover`)
            la page défile sous l'heure et la batterie : sans elle, le texte des cartes
            passerait derrière. Hauteur nulle hors iPhone à encoche.
          */}
          <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-40 h-[var(--sat)] bg-canvas" />
          <main className="flex-1">{children}</main>
          {/* Le pied de page porte la marge de la barre flottante (`pb-tabbar`) : la
              dernière carte et le lien « À propos » restent atteignables au-dessus. */}
          <Footer />
          {/* `useSearchParams` impose une frontière : sans elle, les pages statiques
              (À propos, hors ligne, 404) sortiraient du pré-rendu. */}
          <Suspense fallback={null}>
            <TabBar />
          </Suspense>
          <ScrollToTop />
          <PWAInstallBanner />
        </ThemeProvider>
        <Script id="sw-register" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(() => {});
          }
        `}</Script>
      </body>
    </html>
  )
}
