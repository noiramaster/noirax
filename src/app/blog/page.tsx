'use client';

import { useState, useEffect } from 'react';
import { useLang } from '@/lib/useLang';
import { t } from '@/lib/i18n';
import Link from 'next/link';
import { blogPosts as staticPosts } from '@/data/blog-posts';
import { supabase } from '@/lib/supabase';

export default function BlogListPage() {
  const lang = useLang();
  const [supabasePosts, setSupabasePosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('blog_posts').select('*').order('published_at', { ascending: false }).limit(20).then(({ data }) => {
      if (data) setSupabasePosts(data);
      setLoading(false);
    });
  }, []);

  const allPosts = [...supabasePosts, ...staticPosts].slice(0, 30);

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="font-mono text-3xl text-accent-green mb-2">&gt; {t('blog.title', lang)}</h1>
      <p className="text-sm text-muted mb-8">{t('blog.subtitle', lang)}</p>

      {allPosts.length === 0 ? (
        <p className="font-mono text-sm text-muted">{t('blog.noPosts', lang)}</p>
      ) : (
        <div className="space-y-4">
          {allPosts.map((post: any) => {
            const title = post.title?.[lang] || post.title?.en || post.title || '';
            const excerpt = post.excerpt?.[lang] || post.excerpt?.en || post.excerpt || '';
            const slug = post.slug || '';
            const date = post.published_at || post.created_at || '';
            const category = post.category || (post.tags?.[0] || '');
            return (
            <div key={slug} className="border border-border rounded p-4">
              <Link href={`/blog/${slug}`} className="font-mono text-sm text-foreground hover:text-accent-green transition-colors">
                &gt; {title}
              </Link>
              <p className="text-xs text-muted mt-1">{(excerpt || '').slice(0, 120)}...</p>
              <div className="flex gap-2 mt-2 text-xs text-muted">
                <span>{category}</span>
                <span>Â·</span>
                <span>{new Date(date).toLocaleDateString()}</span>
                <span>Â·</span>
                <Link href={`/blog/${slug}`} className="text-accent-green hover:underline">
                  {t('blog.readMore', lang)}
                </Link>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
