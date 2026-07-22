'use client';

import { useEffect, useState } from 'react';
import { getLang, t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import type { UserProfile } from '@/lib/types';
import { useRouter } from 'next/navigation';

export default function AccountPage() {
  const lang = getLang();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (!data.user) {
        router.push('/login');
        return;
      }
      supabase
        .from('users')
        .select('*')
        .eq('id', data.user.id)
        .single()
        .then(({ data: profile }) => {
          setProfile(profile);
          setLoading(false);
        });
    });
  }, [router]);

  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <p className="font-mono text-sm text-muted">{t('common.loading', lang)}</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <h1 className="font-mono text-3xl text-accent-green mb-6">&gt; {t('nav.account', lang)}</h1>
      {user && (
        <div className="space-y-4 font-mono text-sm">
          <div className="border border-border rounded p-3">
            <p className="text-muted text-xs">{t('auth.email', lang)}</p>
            <p className="text-foreground">{user.email}</p>
          </div>
          <div className="border border-border rounded p-3">
            <p className="text-muted text-xs">{t('nav.pricing', lang)}</p>
            <p className={profile?.plan === 'premium' ? 'text-accent-green' : 'text-muted'}>
              {profile?.plan?.toUpperCase() || 'FREE'}
            </p>
          </div>
          {profile?.plan === 'premium' && profile.stripe_customer_id && (
            <a
              href={`https://billing.stripe.com/p/login/${profile.stripe_customer_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block border border-accent-green text-accent-green px-4 py-2 rounded text-center hover:bg-accent-green hover:text-black transition-colors"
            >
              Manage Subscription
            </a>
          )}
        </div>
      )}
    </div>
  );
}
