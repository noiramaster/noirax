'use client';

import { getLang, t } from '@/lib/i18n';

export default function LegalPage() {
  const lang = getLang();

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="font-mono text-3xl text-accent-green mb-2">&gt; {t('legal.title', lang)}</h1>
      <div className="mt-8 space-y-6 text-sm text-terminal-text leading-relaxed">
        <div className="border border-accent-red rounded p-4 font-mono text-xs text-accent-red">
          &gt; {t('legal.riskWarning', lang)}
        </div>
        <p>{t('legal.disclaimer', lang)}</p>

        {/* Spain-specific warning (always shown as it's the primary jurisdiction) */}
        <div className="border border-accent-magenta rounded p-4 font-mono text-xs text-accent-magenta">
          &gt; AVISO ESPECÍFICO — ESPAÑA / CNMV<br /><br />
          {t('legal.spainWarning', lang)}
          {/* TODO: Este disclaimer debe ser revisado por un abogado especializado en fintech/CNMV 
              antes de facturación real a gran escala. NOIRAX no está registrado como asesor financiero
              ni como entidad de inversión regulada por la CNMV. */}
        </div>

        <p>{t('legal.affiliateDisclaimer', lang)}</p>

        {/* Arabic-specific warning */}
        {lang === 'ar' && (
          <div className="border border-accent-magenta rounded p-4 font-mono text-xs text-accent-magenta">
            &gt; تنبيه خاص<br /><br />
            {t('legal.spainWarning', lang)}
          </div>
        )}

        <div className="border border-border rounded p-4 font-mono text-xs text-muted mt-6">
          <p className="mb-2">&gt; INFORMACIÓN LEGAL — LEGAL INFORMATION</p>
          <p>NOIRAX no está registrado como asesor financiero ni como bróker. No ofrecemos servicios de gestión de carteras ni recomendaciones personalizadas. Toda la información proporcionada es de carácter educativo y se basa en análisis técnico automatizado. Los resultados pasados no garantizan resultados futuros.</p>
          <p className="mt-2">NOIRAX is not a registered investment advisor or broker. We do not offer portfolio management or personalized recommendations. All information is educational and based on automated technical analysis. Past results do not guarantee future results.</p>
          {lang === 'ar' && (
            <p className="mt-2">يرجى التحقق من قانونية تداول العملات الرقمية في بلدك قبل استخدام هذه المنصة. هذا المحتوى تعليمي فقط ولا يشكل نصيحة مالية.</p>
          )}
          <p className="mt-2">Platform operated by NOIRAX Technologies. For legal inquiries: legal@noirax.com</p>
          <p className="mt-2">© {new Date().getFullYear()} NOIRAX. Todos los derechos reservados. All rights reserved.</p>
          {/* TODO: Legal review required before large-scale billing */}
        </div>
      </div>
    </div>
  );
}
