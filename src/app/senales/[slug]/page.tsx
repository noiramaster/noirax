import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import SignalDetailClient from './client';

interface Props {
  params: Promise<{ slug: string }>;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

async function getSignal(slug: string) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
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

  return {
    title: `${signal.coin} ${signal.signal_type.toUpperCase()} - NOIRAX`,
    description: signal.explanation_en?.slice(0, 160) || `Trading signal for ${signal.coin}`,
    openGraph: {
      title: `${signal.coin} ${signal.signal_type.toUpperCase()} Signal | NOIRAX`,
      description: signal.explanation_en?.slice(0, 160) || '',
      type: 'article',
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
