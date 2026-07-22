'use client';

import { use } from 'react';
import { getLang, t } from '@/lib/i18n';
import Link from 'next/link';
import { blogPosts } from '@/data/blog-posts';
import { notFound } from 'next/navigation';

export default function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const lang = getLang();

  const post = blogPosts.find(p => p.slug === slug);
  if (!post) notFound();

  const title = post.title[lang] || post.title.en;
  const content = post.content[lang] || post.content.en;

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Link href="/blog" className="text-xs text-muted hover:text-foreground font-mono transition-colors">
        &lt; {t('blog.title', lang)}
      </Link>

      <article className="mt-6">
        <h1 className="font-mono text-2xl text-accent-green mb-2">&gt; {title}</h1>
        <div className="flex gap-3 text-xs text-muted mb-6">
          <span>{post.category}</span>
          <span>·</span>
          <span>{new Date(post.published_at).toLocaleDateString()}</span>
        </div>

        <div className="prose prose-invert prose-sm max-w-none text-terminal-text font-sans leading-relaxed">
          {content.split('\n').map((line, i) => {
            if (line.startsWith('## ')) {
              return <h2 key={i} className="font-mono text-lg text-foreground mt-6 mb-2">{line.replace('## ', '')}</h2>;
            }
            if (line.startsWith('- **')) {
              return <li key={i} className="text-terminal-text ml-4">{line.replace('- ', '')}</li>;
            }
            if (line.startsWith('- ')) {
              return <li key={i} className="text-terminal-text ml-4">{line.replace('- ', '')}</li>;
            }
            if (line.trim() === '') return <br key={i} />;
            return <p key={i} className="mb-2">{line}</p>;
          })}
        </div>

        <div className="border-t border-border mt-8 pt-4">
          <p className="text-xs text-muted italic">
            {t('legal.disclaimer', lang)}
          </p>
        </div>
      </article>
    </div>
  );
}
