import { ImageResponse } from 'next/og'

/**
 * Icône d'écran d'accueil iOS, générée en PNG.
 *
 * Pourquoi générer plutôt que déclarer un fichier : `apple-touch-icon` n'accepte que
 * du JPEG ou du PNG. Le projet ne fournissait qu'un SVG (`/icons/icon-maskable.svg`),
 * qu'iOS ignore — « Ajouter à l'écran d'accueil » posait donc une vignette générique
 * ou une capture de la page, alors que c'est la seule icône dont iOS tienne compte
 * (il n'utilise pas celles du manifeste).
 *
 * Le dessin reprend `public/icons/icon.svg` (journal de style Lucide sur fond
 * brand-50), redessiné en éléments que satori sait rendre : ni `stroke` sur des
 * `path`, ni `stroke-linecap`, que le moteur d'ImageResponse ne prend pas en charge.
 */

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

const BRAND = '#16a34a'
const BRAND_50 = '#f0fdf4'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          // Pas de coins arrondis : iOS applique lui-même son masque, et un rayon
          // ajouté ici laisserait apparaître des coins sombres autour.
          background: BRAND_50,
        }}
      >
        {/* Colonne latérale du journal */}
        <div
          style={{
            display: 'flex',
            width: 96,
            height: 84,
            marginRight: -12,
            borderTopLeftRadius: 10,
            borderBottomLeftRadius: 10,
            border: `9px solid ${BRAND}`,
            borderRight: 'none',
          }}
        />
        {/* Page principale, avec ses trois lignes de texte */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 13,
            width: 104,
            height: 112,
            padding: '0 17px',
            borderRadius: 14,
            border: `9px solid ${BRAND}`,
            background: BRAND_50,
          }}
        >
          <div style={{ height: 9, borderRadius: 5, background: BRAND }} />
          <div style={{ height: 9, borderRadius: 5, background: BRAND }} />
          <div style={{ height: 9, width: '55%', borderRadius: 5, background: BRAND }} />
        </div>
      </div>
    ),
    size
  )
}
