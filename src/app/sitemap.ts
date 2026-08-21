import { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseUrl;
const baseUrl = 'https://noiraxplum.vercel.app';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'hourly' as const, priority: 1.0 },
    { url: `${baseUrl}/free`, lastModified: new Date(), changeFrequency: 'hourly' as const, priority: 0.9 },
    { url: `${baseUrl}/premium`, lastModified: new Date(), changeFrequency: 'hourly' as const, priority: 0.8 },
    { url: `${baseUrl}/pricing`, lastModified: new Date(), changeFrequency: 'weekly' as const, priority: 0.8 },
    { url: `${baseUrl}/track-record`, lastModified: new Date(), changeFrequency: 'daily' as const, priority: 0.7 },
    { url: `${baseUrl}/legal`, lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.3 },
    { url: `${baseUrl}/privacidad`, lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.3 },
    { url: `${baseUrl}/blog`, lastModified: new Date(), changeFrequency: 'weekly' as const, priority: 0.6 },
    { url: `${baseUrl}/login`, lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.2 },
    { url: `${baseUrl}/signup`, lastModified: new Date(), changeFrequency: 'monthly' as const, priority: 0.2 },
  ];

  const urls: MetadataRoute.Sitemap = [...staticPages];

  // Add blog posts (static + Supabase auto-generated)
  try {
    const { blogPosts } = await import('@/data/blog-posts');
    for (const post of blogPosts) {
      urls.push({
        url: `${baseUrl}/blog/${post.slug}`,
        lastModified: new Date(post.published_at),
        changeFrequency: 'monthly' as const,
        priority: 0.5,
      });
    }
  } catch { /* ignore */ }

  // Add dynamic blog posts from Supabase
  if (supabaseUrl) {
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data: blogPosts } = await supabase
        .from('blog_posts')
        .select('slug, updated_at')
        .not('slug', 'is', null)
        .limit(100);
      if (blogPosts) {
        for (const post of blogPosts) {
          urls.push({
            url: `${baseUrl}/blog/${post.slug}`,
            lastModified: new Date(post.updated_at || Date.now()),
            changeFrequency: 'weekly' as const,
            priority: 0.5,
          });
        }
      }
    } catch { /* ignore */ }

    // Add free signal pages
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data: signals } = await supabase
        .from('signals')
        .select('slug, updated_at')
        .eq('tier', 'free')
        .not('slug', 'is', null)
        .order('created_at', { ascending: false })
        .limit(500);
      if (signals) {
        for (const s of signals) {
          urls.push({
            url: `${baseUrl}/senales/${s.slug}`,
            lastModified: new Date(s.updated_at || Date.now()),
            changeFrequency: 'daily' as const,
            priority: 0.6,
          });
        }
      }
    } catch { /* ignore */ }
  }

  return urls;
}
