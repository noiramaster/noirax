import { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = 'https://noirax-plum.vercel.app';

  const staticPages = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'hourly' as const, priority: 1.0 },
    { url: `${baseUrl}/free`, lastModified: new Date(), changeFrequency: 'hourly' as const, priority: 0.9 },
    { url: `${baseUrl}/premium`, lastModified: new Date(), changeFrequency: 'hourly' as const, priority: 0.8 },
    { url: `${baseUrl}/pricing`, lastModified: new Date(), changeFrequency: 'weekly' as const, priority: 0.8 },
    { url: `${baseUrl}/track-record`, lastModified: new Date(), changeFrequency: 'daily' as const, priority: 0.7 },
    { url: `${baseUrl}/legal`, lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.3 },
    { url: `${baseUrl}/blog`, lastModified: new Date(), changeFrequency: 'weekly' as const, priority: 0.6 },
  ];

  // Add blog posts
  const { blogPosts } = await import('@/data/blog-posts');
  const blogUrls = blogPosts.map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: new Date(post.published_at),
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }));

  // Add free signals
  let signalUrls: MetadataRoute.Sitemap = [];
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: signals } = await supabase
      .from('signals')
      .select('slug, updated_at')
      .eq('tier', 'free')
      .not('slug', 'is', null)
      .order('created_at', { ascending: false })
      .limit(500);

    if (signals) {
      signalUrls = signals.map((s: any) => ({
        url: `${baseUrl}/senales/${s.slug}`,
        lastModified: new Date(s.updated_at || Date.now()),
        changeFrequency: 'daily' as const,
        priority: 0.6,
      }));
    }
  } catch {
    // Supabase not configured, skip signal URLs
  }

  return [...staticPages, ...blogUrls, ...signalUrls];
}
