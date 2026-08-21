'use client';

import { useLang } from '@/lib/useLang';
import { t } from '@/lib/i18n';

export default function LegalPage() {
  const lang = useLang();

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
          &gt; AVISO ESPECÃFICO â€” ESPAÃ‘A / CNMV<br /><br />
          {t('legal.spainWarning', lang)}
          {/* TODO: Este disclaimer debe ser revisado por un abogado especializado en fintech/CNMV 
              antes de facturaciÃ³n real a gran escala. NOIRAX no estÃ¡ registrado como asesor financiero
              ni como entidad de inversiÃ³n regulada por la CNMV. */}
        </div>

        {/* Arabic-specific warning */}
        {lang === 'ar' && (
          <div className="border border-accent-magenta rounded p-4 font-mono text-xs text-accent-magenta">
            &gt; ØªÙ†Ø¨ÙŠÙ‡ Ø®Ø§Øµ<br /><br />
            {t('legal.spainWarning', lang)}
          </div>
        )}

        <div className="border border-border rounded p-4 font-mono text-xs text-muted mt-6">
          <p className="mb-2">&gt; INFORMACIÃ“N LEGAL â€” LEGAL INFORMATION</p>
          <p>NOIRAX no estÃ¡ registrado como asesor financiero ni como brÃ³ker. No ofrecemos servicios de gestiÃ³n de carteras ni recomendaciones personalizadas. Toda la informaciÃ³n proporcionada es de carÃ¡cter educativo y se basa en anÃ¡lisis tÃ©cnico automatizado. Los resultados pasados no garantizan resultados futuros.</p>
          <p className="mt-2">NOIRAX is not a registered investment advisor or broker. We do not offer portfolio management or personalized recommendations. All information is educational and based on automated technical analysis. Past results do not guarantee future results.</p>
          {lang === 'ar' && (
            <p className="mt-2">ÙŠØ±Ø¬Ù‰ Ø§Ù„ØªØ­Ù‚Ù‚ Ù…Ù† Ù‚Ø§Ù†ÙˆÙ†ÙŠØ© ØªØ¯Ø§ÙˆÙ„ Ø§Ù„Ø¹Ù…Ù„Ø§Øª Ø§Ù„Ø±Ù‚Ù…ÙŠØ© ÙÙŠ Ø¨Ù„Ø¯Ùƒ Ù‚Ø¨Ù„ Ø§Ø³ØªØ®Ø¯Ø§Ù… Ù‡Ø°Ù‡ Ø§Ù„Ù…Ù†ØµØ©. Ù‡Ø°Ø§ Ø§Ù„Ù…Ø­ØªÙˆÙ‰ ØªØ¹Ù„ÙŠÙ…ÙŠ ÙÙ‚Ø· ÙˆÙ„Ø§ ÙŠØ´ÙƒÙ„ Ù†ØµÙŠØ­Ø© Ù…Ø§Ù„ÙŠØ©.</p>
          )}
          <p className="mt-2">Platform operated by NOIRAX Technologies. For legal inquiries: legal@noirax.com</p>
          <p className="mt-2">Â© {new Date().getFullYear()} NOIRAX. Todos los derechos reservados. All rights reserved.</p>
          {/* TODO: Legal review required before large-scale billing */}
        </div>
      </div>
    </div>
  );
}
