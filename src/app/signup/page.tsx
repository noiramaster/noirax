'use client';

import { useState } from 'react';
import { getLang, t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function SignupPage() {
  const lang = getLang();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
    });
    if (authError) {
      setError(authError.message);
    } else {
      setSuccess(t('auth.checkEmail', lang));
    }
    setLoading(false);
  };

  const handleGoogleSignup = async () => {
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
      <h1 className="font-mono text-3xl text-accent-green mb-6">&gt; {t('auth.signupTitle', lang)}</h1>
      {error && <p className="text-accent-red text-sm font-mono mb-4">&gt; {error}</p>}
      {success && <p className="text-accent-green text-sm font-mono mb-4">&gt; {success}</p>}

      <button
        onClick={handleGoogleSignup}
        disabled={loading}
        className="w-full border border-border text-foreground px-4 py-2 rounded font-mono text-sm hover:bg-white/10 transition-colors disabled:opacity-50 cursor-pointer mb-4"
      >
        {t('auth.googleSignup', lang)}
      </button>

      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border"></div></div>
        <div className="relative flex justify-center text-xs"><span className="bg-black px-2 text-muted font-mono">{t('auth.orContinue', lang)}</span></div>
      </div>

      <form onSubmit={handleSignup} className="space-y-4">
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
            required
            minLength={6}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full border border-accent-green text-accent-green px-4 py-2 rounded font-mono text-sm hover:bg-accent-green hover:text-black transition-colors disabled:opacity-50 cursor-pointer"
        >
          {t('auth.signupButton', lang)}
        </button>
      </form>
      <p className="mt-4 text-xs text-muted font-mono text-center">
        {t('auth.hasAccount', lang)}{' '}
        <Link href="/login" className="text-accent-green hover:underline">{t('auth.loginButton', lang)}</Link>
      </p>
    </div>
  );
}
