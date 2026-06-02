import { ArticleFeed } from '@/components/articles/ArticleFeed'

interface PageProps {
  params: Promise<{ citySlug: string }>
}

export default async function CityPage({ params }: PageProps) {
  const { citySlug } = await params
  return <ArticleFeed citySlug={citySlug} />
}
