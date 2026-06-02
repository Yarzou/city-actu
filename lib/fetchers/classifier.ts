import type { Category } from '@/lib/types'

// Keywords per category slug (French, lowercase, checked with includes())
const KEYWORDS: Record<string, string[]> = {
  'agenda': [
    'concert', 'spectacle', 'exposition', 'festival', 'fête', 'fete',
    'événement', 'evenement', 'soirée', 'soiree', 'animation', 'représentation',
    'representation', 'inauguration', 'conférence', 'conference', 'cérémonie',
    'ceremonie', 'commémoration', 'commemoration', 'célébration', 'celebration',
  ],
  'sorties-enfants': [
    'enfant', 'enfants', 'famille', 'familles', 'crèche', 'creche', 'école',
    'ecole', 'jeunesse', 'ados', 'adolescent', 'adolescents', 'périscolaire',
    'periscolaire', 'centre de loisirs', 'kermesse', 'atelier enfant',
    'atelier enfants', 'activité enfant', 'activités enfants', 'centre aéré',
    'centre aere',
  ],
  'sorties-adultes': [
    'sortie adulte', 'sorties adultes', 'balade', 'randonnée', 'randonnee',
    'visite guidée', 'visite guidee', 'marché', 'marche', 'brocante',
    'vide-grenier', 'vide grenier', 'dégustation', 'degustation', 'oenologie',
    'œnologie', 'excursion', 'promenade', 'découverte', 'decouverte',
  ],
  'sports': [
    'sport', 'sports', 'match', 'tournoi', 'championnat', 'compétition',
    'competition', 'football', 'tennis', 'natation', 'vélo', 'velo', 'course',
    'trail', 'marathon', 'gym', 'gymnase', 'rugby', 'basket', 'handball',
    'volley', 'athlétisme', 'athletisme', 'cyclisme', 'triathlon', 'fitness',
    'musculation', 'escalade', 'piscine',
  ],
  'travaux': [
    'travaux', 'chantier', 'voirie', 'circulation', 'déviation', 'deviation',
    'fermeture', 'stationnement', 'aménagement', 'amenagement', 'rénovation',
    'renovation', 'construction', 'perturbation', 'coupure', 'réseau', 'reseau',
    'route barrée', 'route barree', 'interdiction',
  ],
  'emploi': [
    'emploi', 'recrutement', "offre d'emploi", 'offres d\'emploi', 'candidature',
    'stage', 'alternance', 'apprentissage', 'forum emploi', 'job', 'poste',
    'embauche', 'contrat', 'cdi', 'cdd', 'mission locale',
  ],
}

/**
 * Classifies an article into a category based on keyword matching.
 * Returns the fallback category ID if no keyword matches.
 */
export function classifyArticle(
  title: string,
  contentPreview: string | null,
  fallbackCategoryId: number,
  categories: Category[],
): number {
  const text = `${title} ${contentPreview ?? ''}`.toLowerCase()

  for (const [slug, keywords] of Object.entries(KEYWORDS)) {
    for (const kw of keywords) {
      if (text.includes(kw)) {
        const cat = categories.find(c => c.slug === slug)
        if (cat) return cat.id
        break
      }
    }
  }

  return fallbackCategoryId
}
