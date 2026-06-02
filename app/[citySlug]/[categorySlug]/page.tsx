import { ArticleFeed } from '@/components/articles/ArticleFeed'

interface PageProps {
  params: Promise<{ citySlug: string; categorySlug: string }>
}

export default async function CategoryPage({ params }: PageProps) {
  const { citySlug, categorySlug } = await params
  return <ArticleFeed citySlug={citySlug} categorySlug={categorySlug} />
}
