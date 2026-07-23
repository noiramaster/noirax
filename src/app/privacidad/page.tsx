import { getLang, t } from '@/lib/i18n';

export default function PrivacyPage() {
  const lang = getLang();

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="font-mono text-3xl text-accent-green mb-6">&gt; {t('privacy.title', lang)}</h1>

      <div className="space-y-6 text-sm text-foreground font-mono leading-relaxed">
        {/* TODO: This privacy policy is a template. A qualified lawyer must review it before scaling operations. 
            Same as the CNMV disclaimer in /legal — this is informative, not legally binding advice. */}
        <section>
          <h2 className="text-accent-green text-base mb-2">{t('privacy.dataController', lang)}</h2>
          <p className="text-muted">{t('privacy.dataControllerText', lang)}</p>
        </section>

        <section>
          <h2 className="text-accent-green text-base mb-2">{t('privacy.dataCollected', lang)}</h2>
          <ul className="list-disc list-inside text-muted space-y-1">
            <li>{t('privacy.dataEmail', lang)}</li>
            <li>{t('privacy.dataPayment', lang)} — <strong>{t('privacy.dataPaymentNote', lang)}</strong></li>
            <li>{t('privacy.dataLanguage', lang)}</li>
            <li>{t('privacy.dataCookies', lang)}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-accent-green text-base mb-2">{t('privacy.purpose', lang)}</h2>
          <p className="text-muted">{t('privacy.purposeText', lang)}</p>
        </section>

        <section>
          <h2 className="text-accent-green text-base mb-2">{t('privacy.retention', lang)}</h2>
          <p className="text-muted">{t('privacy.retentionText', lang)}</p>
        </section>

        <section>
          <h2 className="text-accent-green text-base mb-2">{t('privacy.rgpd', lang)}</h2>
          <p className="text-muted">{t('privacy.rgpdText', lang)}</p>
        </section>

        <section>
          <h2 className="text-accent-green text-base mb-2">{t('privacy.contact', lang)}</h2>
          <p className="text-muted">{t('privacy.contactText', lang)}</p>
        </section>
      </div>
    </div>
  );
}
