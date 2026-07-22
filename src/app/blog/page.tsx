'use client';

import { getLang, t } from '@/lib/i18n';
import Link from 'next/link';
import { blogPosts } from '@/data/blog-posts';

export default function BlogListPage() {
  const lang = getLang();

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="font-mono text-3xl text-accent-green mb-2">&gt; {t('blog.title', lang)}</h1>
      <p className="text-sm text-muted mb-8">{t('blog.subtitle', lang)}</p>

      {blogPosts.length === 0 ? (
        <p className="font-mono text-sm text-muted">{t('blog.noPosts', lang)}</p>
      ) : (
        <div className="space-y-4">
          {blogPosts.map((post) => (
            <div key={post.slug} className="border border-border rounded p-4">
              <Link href={`/blog/${post.slug}`} className="font-mono text-sm text-foreground hover:text-accent-green transition-colors">
                &gt; {post.title[lang] || post.title.en}
              </Link>
              <p className="text-xs text-muted mt-1">
                {(post.excerpt[lang] || post.excerpt.en).slice(0, 120)}...
              </p>
              <div className="flex gap-2 mt-2 text-xs text-muted">
                <span>{post.category}</span>
                <span>·</span>
                <span>{new Date(post.published_at).toLocaleDateString()}</span>
                <span>·</span>
                <Link href={`/blog/${post.slug}`} className="text-accent-green hover:underline">
                  {t('blog.readMore', lang)}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
