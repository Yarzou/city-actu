import { CityHomePage } from '@/components/articles/CityHomePage'

interface PageProps {
  params: Promise<{ citySlug: string }>
}

export default async function CityPage({ params }: PageProps) {
  const { citySlug } = await params
  return <CityHomePage citySlug={citySlug} />
}
