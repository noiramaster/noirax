import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import SignalDetailClient from './client';

interface Props {
  params: Promise<{ slug: string }>;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseUrl;
const baseUrl = 'https://noirax-plum.vercel.app';

async function getSignal(slug: string) {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data } = await supabase
    .from('signals')
    .select('*')
    .eq('slug', slug)
    .single();
  return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const signal = await getSignal(slug);
  if (!signal) return { title: 'Signal Not Found' };

  const coin = signal.coin || '';
  const type = (signal.signal_type || '').toUpperCase();
  const desc = signal.explanation_en?.slice(0, 160) || `Trading signal for ${coin}`;

  return {
    title: `${coin} ${type} - NOIRAX`,
    description: desc,
    alternates: { canonical: `${baseUrl}/senales/${slug}` },
    openGraph: {
      title: `${coin} ${type} Signal | NOIRAX`,
      description: desc,
      type: 'article',
      url: `${baseUrl}/senales/${slug}`,
      images: [{ url: `${baseUrl}/og.png`, width: 1200, height: 630 }],
    },
    other: {
      'script:ld+json': JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: `${coin} ${type} — Crypto Trading Signal`,
        description: desc,
        datePublished: signal.created_at,
        author: { '@type': 'Organization', name: 'NOIRAX' },
        isAccessibleForFree: signal.tier === 'free',
        educationalUse: 'Not Financial Advice. Educational content about technical analysis.',
      }),
    },
  };
}

export default async function SignalPage({ params }: Props) {
  const { slug } = await params;
  const signal = await getSignal(slug);

  if (!signal) {
    notFound();
  }

  return <SignalDetailClient signal={signal} />;
}
