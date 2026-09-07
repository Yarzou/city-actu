import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
// Conservé : `font-mono` est réellement utilisé par le panneau d'administration
// (champs de sélecteurs CSS, slugs). Le sortir du layout racine pour ne le charger
// que sur /profil reste une optimisation possible, mais ce n'est pas du code mort.
import { GeistMono } from 'geist/font/mono'
import Script from 'next/script'
import './globals.css'
import { createClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/authz'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { BottomNav } from '@/components/layout/BottomNav'
import PWAInstallBanner from '@/components/layout/PWAInstallBanner'
import { ThemeProvider } from '@/components/theme/ThemeProvider'

export const viewport: Viewport = {
  themeColor: '#16a34a',
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Session résolue une fois ici plutôt que redemandée en parallèle par la Navbar,
  // la page ville et le feed.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // Conditionne le lien « Administration » du menu : /profil renvoie 404 aux
  // non-administrateurs, le proposer à tous mènerait à une impasse.
  const isAdmin = user ? await isAdminUser(supabase, user.id) : false

  return (
    <html lang="fr" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||((t==='system'||!t)&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="font-sans bg-gray-50 text-gray-900 antialiased min-h-full flex flex-col">
        <ThemeProvider>
          <Navbar initialUser={user ? { id: user.id } : null} isAdmin={isAdmin} />
          {/*
            `pt-[var(--header-h)]` : le décalage suivait l'en-tête à `pt-16` en dur,
            faux de la hauteur de l'encoche en PWA standalone.
            `pb-20` sur mobile : sans quoi la barre de navigation basse recouvre la
            fin du feed et le pied de page.
          */}
          <main className="flex-1 pt-[var(--header-h)] pb-20 sm:pb-0">
            {children}
          </main>
          <Footer />
          <BottomNav isAdmin={isAdmin} />
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
