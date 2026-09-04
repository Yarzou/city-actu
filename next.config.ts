import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    /**
     * Sans bloc `images`, aucune URL distante ne peut passer par l'optimiseur : le
     * code contournait le problème avec `unoptimized`, et une photo de presse de
     * 1200px et plus était téléchargée en entier pour une vignette de 160px de haut,
     * sans conversion AVIF/WebP ni `srcset`.
     *
     * Joker sur le nom d'hôte, à dessein : les sources sont des lignes de la table
     * `sources`, éditables depuis l'administration, donc les domaines d'images ne
     * sont pas connus à la compilation. Contrepartie assumée : `/_next/image`
     * devient un redimensionneur d'images accessible pour toute URL https. Le
     * restreindre demanderait une liste blanche d'hôtes à maintenir à chaque
     * nouvelle source, avec repli `unoptimized` pour les autres.
     */
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
    formats: ['image/avif', 'image/webp'],
    // Un feed d'actualités n'a besoin ni des très grandes largeurs ni du 16px :
    // moins de variantes, c'est un `srcset` plus court et moins de transformations
    // facturées.
    deviceSizes: [384, 640, 750, 828, 1080, 1200],
    // 24h : les images des sources ne changent pas dans la journée (le défaut de
    // Next 16 est de 4h).
    minimumCacheTTL: 86400,
  },

  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns'],
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data: https:",
              "connect-src 'self' https://*.supabase.co https://api.groq.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; ')
          },
        ],
      },
    ]
  },
};

export default nextConfig;
