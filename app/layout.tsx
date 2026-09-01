import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import Script from 'next/script'
import './globals.css'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
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
  icons: {
    icon: '/icons/icon.svg',
    apple: '/icons/icon-maskable.svg',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
          <Navbar />
          <main className="flex-1 pt-16">
            {children}
          </main>
          <Footer />
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

