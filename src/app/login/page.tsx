'use client';

import { useState } from 'react';
import { getLang, t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const lang = getLang();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError(authError.message);
    } else {
      router.push('/account');
    }
    setLoading(false);
  };

  const handleMagicLink = async () => {
    if (!email) return;
    setLoading(true);
    setError('');
    const { error: authError } = await supabase.auth.signInWithOtp({ email });
    if (authError) {
      setError(authError.message);
    } else {
      setSuccess(t('auth.checkEmail', lang));
    }
    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/api/auth/callback` },
    });
    if (authError) {
      setError(authError.message);
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <h1 className="font-mono text-3xl text-accent-green mb-6">&gt; {t('auth.loginTitle', lang)}</h1>
      {error && <p className="text-accent-red text-sm font-mono mb-4">&gt; {error}</p>}
      {success && <p className="text-accent-green text-sm font-mono mb-4">&gt; {success}</p>}

      <button
        onClick={handleGoogleLogin}
        disabled={loading}
        className="w-full border border-border text-foreground px-4 py-2 rounded font-mono text-sm hover:bg-white/10 transition-colors disabled:opacity-50 cursor-pointer mb-4"
      >
        {t('auth.googleLogin', lang)}
      </button>

      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border"></div></div>
        <div className="relative flex justify-center text-xs"><span className="bg-black px-2 text-muted font-mono">{t('auth.orContinue', lang)}</span></div>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="font-mono text-xs text-muted block mb-1">{t('auth.email', lang)}</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-black border border-border rounded px-3 py-2 text-sm text-foreground font-mono"
            required
          />
        </div>
        <div>
          <label className="font-mono text-xs text-muted block mb-1">{t('auth.password', lang)}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-black border border-border rounded px-3 py-2 text-sm text-foreground font-mono"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full border border-accent-green text-accent-green px-4 py-2 rounded font-mono text-sm hover:bg-accent-green hover:text-black transition-colors disabled:opacity-50 cursor-pointer"
        >
          {t('auth.loginButton', lang)}
        </button>
      </form>
      <button
        onClick={handleMagicLink}
        disabled={loading || !email}
        className="w-full mt-2 text-xs text-muted hover:text-foreground font-mono transition-colors cursor-pointer"
      >
        {t('auth.magicLink', lang)}
      </button>
      <p className="mt-4 text-xs text-muted font-mono text-center">
        {t('auth.noAccount', lang)}{' '}
        <Link href="/signup" className="text-accent-green hover:underline">{t('auth.signupButton', lang)}</Link>
      </p>
    </div>
  );
}
