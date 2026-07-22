export interface BlogPostData {
  slug: string;
  category: string;
  tags: string[];
  published_at: string;
  title: Record<string, string>;
  excerpt: Record<string, string>;
  content: Record<string, string>;
}

export const blogPosts: BlogPostData[] = [
  {
    slug: 'que-es-el-rsi',
    category: 'indicators',
    tags: ['RSI', 'indicators', 'technical-analysis'],
    published_at: '2026-07-01',
    title: {
      en: 'What is RSI? A Beginner\'s Guide to the Relative Strength Index',
      es: '¿Qué es el RSI? Guía para principiantes del Índice de Fuerza Relativa',
      pt: 'O que é RSI? Guia para iniciantes do Índice de Força Relativa',
      fr: 'Qu\'est-ce que le RSI ? Guide du débutant sur l\'indice de force relative',
      de: 'Was ist der RSI? Ein Anfängerleitfaden zum Relative Strength Index',
      it: 'Cos\'è l\'RSI? Guida per principianti all\'indice di forza relativa',
      ar: 'ما هو مؤشر القوة النسبية RSI؟ دليل المبتدئين',
    },
    excerpt: {
      en: 'Learn how the Relative Strength Index (RSI) helps identify overbought and oversold conditions in crypto markets.',
      es: 'Aprende cómo el Índice de Fuerza Relativa (RSI) ayuda a identificar condiciones de sobrecompra y sobreventa.',
      pt: 'Aprenda como o RSI ajuda a identificar condições de sobrecompra e sobrevenda.',
      fr: 'Apprenez comment le RSI aide à identifier les conditions de surachat et survente.',
      de: 'Erfahren Sie, wie der RSI überkaufte und überverkaufte Bedingungen identifiziert.',
      it: 'Scopri come l\'RSI aiuta a identificare condizioni di ipercomprato e ipervenduto.',
      ar: 'تعلم كيف يساعد مؤشر القوة النسبية في تحديد حالات التشبع الشرائي والبيعي',
    },
    content: {
      en: `## What is RSI?
The Relative Strength Index (RSI) is a momentum oscillator that measures the speed and change of price movements. It oscillates between 0 and 100.

## How it works
RSI compares the magnitude of recent gains to recent losses to determine overbought and oversold conditions. Traditionally:
- **Above 70**: Overbought (potential sell signal)
- **Below 30**: Oversold (potential buy signal)

## Why traders use it
RSI helps identify potential reversals and confirms trend strength. When combined with other indicators like MACD and volume analysis, it provides a more complete picture of market conditions.

## Important Note
RSI should not be used in isolation. Always consider multiple timeframes and indicators before making trading decisions. This content is for educational purposes only.`,
      es: `## ¿Qué es el RSI?
El Índice de Fuerza Relativa (RSI) es un oscilador de momentum que mide la velocidad y el cambio de los movimientos de precio. Oscila entre 0 y 100.

## Cómo funciona
El RSI compara la magnitud de las ganancias recientes con las pérdidas recientes para determinar condiciones de sobrecompra y sobreventa:
- **Por encima de 70**: Sobrecompra (posible señal de venta)
- **Por debajo de 30**: Sobreventa (posible señal de compra)

## Por qué lo usan los traders
El RSI ayuda a identificar posibles reversiones y confirma la fuerza de la tendencia. Combinado con otros indicadores como MACD y análisis de volumen, proporciona una imagen más completa.

## Nota importante
El RSI no debe usarse de forma aislada. Considere siempre múltiples marcos temporales e indicadores. Este contenido es solo educativo.`,
      pt: `## O que é RSI?\nO Índice de Força Relativa (RSI) é um oscilador de momentum que mede a velocidade e mudança dos movimentos de preço.\n\n## Como funciona\nO RSI compara ganhos recentes com perdas recentes.\n\n## Nota importante\nEste conteúdo é apenas educacional.`,
      fr: `## Qu'est-ce que le RSI ?\nL'indice de force relative (RSI) est un oscillateur de momentum.\n\n## Note importante\nCe contenu est uniquement éducatif.`,
      de: `## Was ist der RSI?\nDer Relative Strength Index (RSI) ist ein Momentum-Oszillator.\n\n## Wichtiger Hinweis\nDieser Inhalt dient nur Bildungszwecken.`,
      it: `## Cos'è l'RSI?\nIl Relative Strength Index (RSI) è un oscillatore di momentum.\n\n## Nota importante\nQuesto contenuto è solo a scopo educativo.`,
      ar: `## ما هو مؤشر القوة النسبية؟\nمؤشر القوة النسبية (RSI) هو مذبذب الزخم الذي يقيس سرعة وتغير تحركات الأسعار.\n\n## ملاحظة مهمة\nهذا المحتوى تعليمي فقط.`,
    },
  },
  {
    slug: 'que-es-stop-loss',
    category: 'risk-management',
    tags: ['stop-loss', 'risk-management', 'trading-basics'],
    published_at: '2026-07-03',
    title: {
      en: 'Understanding Stop Loss: Your Safety Net in Crypto Trading',
      es: 'Entendiendo el Stop Loss: Tu red de seguridad en el trading cripto',
      pt: 'Entendendo o Stop Loss: Sua rede de segurança',
      fr: 'Comprendre le Stop Loss : Votre filet de sécurité',
      de: 'Stop Loss verstehen: Ihr Sicherheitsnetz',
      it: 'Capire lo Stop Loss: La tua rete di sicurezza',
      ar: 'فهم وقف الخسارة: شبكة الأمان الخاصة بك',
    },
    excerpt: {
      en: 'Stop loss is a crucial risk management tool. Learn how to set it properly to protect your capital.',
      es: 'El stop loss es una herramienta crucial de gestión de riesgo. Aprende a configurarlo correctamente.',
      pt: 'Stop loss é uma ferramenta crucial de gerenciamento de risco.',
      fr: 'Le stop loss est un outil de gestion des risques crucial.',
      de: 'Stop Loss ist ein wichtiges Risikomanagement-Tool.',
      it: 'Lo stop loss è uno strumento cruciale di gestione del rischio.',
      ar: 'وقف الخسارة هو أداة مهمة لإدارة المخاطر',
    },
    content: {
      en: `## What is a Stop Loss?
A stop loss is an order placed with an exchange to sell a cryptocurrency when it reaches a certain price. It's designed to limit an investor's loss on a position.

## Why It Matters
In crypto's volatile markets, a stop loss is essential. It:
- Prevents emotional decision-making
- Protects your capital from unexpected crashes
- Automates your exit strategy

## How to Set One
Consider your risk tolerance and market volatility. A common approach is setting your stop loss 5-10% below your entry for long positions.

## Note
Stop losses do not guarantee execution at the exact price due to market slippage. This content is educational only.`,
      es: `## ¿Qué es un Stop Loss?
Una orden para vender cuando el precio alcanza cierto nivel, limitando pérdidas.\n\n## Por qué es importante\nEn mercados volátiles, es esencial.\n\n## Cómo configurarlo\nConsidere su tolerancia al riesgo.`,
      pt: `## O que é Stop Loss?\nUma ordem para vender quando o preço atinge certo nível.`,
      fr: `## Qu'est-ce qu'un Stop Loss ?\nUn ordre de vente à un prix prédéfini.`,
      de: `## Was ist ein Stop Loss?\nEin Auftrag zum Verkauf bei einem bestimmten Preis.`,
      it: `## Cos'è uno Stop Loss?\nUn ordine per vendere a un prezzo prestabilito.`,
      ar: `## ما هو وقف الخسارة؟\nأمر لبيع العملة عند سعر معين للحد من الخسائر`,
    },
  },
  {
    slug: 'que-es-risk-reward-ratio',
    category: 'risk-management',
    tags: ['risk-reward', 'trading-strategy', 'risk-management'],
    published_at: '2026-07-05',
    title: {
      en: 'Risk/Reward Ratio: The Key to Profitable Trading',
      es: 'Ratio Riesgo/Recompensa: La clave del trading rentable',
      pt: 'Relação Risco/Recompensa: A chave para o trading lucrativo',
      fr: 'Ratio Risque/Rendement : La clé du trading rentable',
      de: 'Risiko/Ertrags-Verhältnis: Der Schlüssel zu profitablen Trading',
      it: 'Rapporto Rischio/Profitto: La chiave per il trading redditizio',
      ar: 'نسبة المخاطرة إلى العائد: مفتاح التداول الربحي',
    },
    excerpt: {
      en: 'Discover how the risk/reward ratio helps traders make better decisions and maintain profitability over time.',
      es: 'Descubre cómo el ratio riesgo/recompensa ayuda a tomar mejores decisiones.',
      pt: 'Descubra como a relação risco/recompensa ajuda nas decisões.',
      fr: 'Découvrez comment le ratio risque/rendement aide à prendre de meilleures décisions.',
      de: 'Entdecken Sie, wie das Risiko/Ertrags-Verhältnis bessere Entscheidungen ermöglicht.',
      it: 'Scopri come il rapporto rischio/profitto aiuta a prendere decisioni migliori.',
      ar: 'اكتشف كيف تساعد نسبة المخاطرة إلى العائد في اتخاذ قرارات أفضل',
    },
    content: {
      en: `## What is Risk/Reward Ratio?
The risk/reward ratio compares the potential loss (risk) to the potential gain (reward) of a trade. A ratio of 1:3 means you risk $1 to make $3.

## Why It's Important
Professional traders focus on risk/reward, not just win rate. You can be right only 40% of the time and still be profitable if your winners are larger than your losers.

## How to Calculate
Risk = Entry Price - Stop Loss
Reward = Take Profit - Entry Price
R/R Ratio = Reward / Risk

## Best Practices
- Aim for a minimum R/R ratio of 1:2 or higher
- Adjust position size based on your risk tolerance
- Never risk more than 1-2% of your capital per trade`,
      es: `## ¿Qué es el Ratio Riesgo/Recompensa?\nCompara pérdida potencial vs ganancia potencial.\n\n## Por qué es importante\nLos traders profesionales lo priorizan.\n\n## Cómo calcularlo\nRiesgo = Entrada - Stop Loss\nRecompensa = Take Profit - Entrada`,
      pt: `## O que é Relação Risco/Recompensa?\nCompara perda potencial vs ganho potencial.`,
      fr: `## Qu'est-ce que le Ratio Risque/Rendement ?\nCompare perte potentielle vs gain potentiel.`,
      de: `## Was ist das Risiko/Ertrags-Verhältnis?\nVergleicht potenziellen Verlust mit Gewinn.`,
      it: `## Cos'è il Rapporto Rischio/Profitto?\nConfronta perdita potenziale e guadagno potenziale.`,
      ar: `## ما هي نسبة المخاطرة إلى العائد؟\nتقارن الخسارة المحتملة بالربح المحتمل`,
    },
  },
  {
    slug: 'resumen-semanal-mercado',
    category: 'market-summary',
    tags: ['market-summary', 'weekly', 'bitcoin', 'ethereum'],
    published_at: '2026-07-07',
    title: {
      en: 'Weekly Market Summary: Bitcoin Consolidates Above Key Support',
      es: 'Resumen Semanal de Mercado: Bitcoin consolida sobre soporte clave',
      pt: 'Resumo Semanal do Mercado: Bitcoin consolida acima do suporte',
      fr: 'Résumé Hebdomadaire du Marché : Bitcoin consolide au-dessus du support',
      de: 'Wöchentliche Marktzusammenfassung: Bitcoin konsolidiert über Schlüsselunterstützung',
      it: 'Riepilogo Settimanale del Mercato: Bitcoin consolida sopra il supporto',
      ar: 'ملخص السوق الأسبوعي: البيتكوين يتماسك فوق الدعم الرئيسي',
    },
    excerpt: {
      en: 'Bitcoin holds above $60K as altcoins show mixed signals. Overview of the week\'s key market movements.',
      es: 'Bitcoin se mantiene sobre $60K mientras las altcoins muestran señales mixtas.',
      pt: 'Bitcoin mantém-se acima de $60K com sinais mistos nas altcoins.',
      fr: 'Bitcoin se maintient au-dessus de 60K$ avec des signaux mitigés.',
      de: 'Bitcoin hält sich über 60.000$ bei gemischten Signalen.',
      it: 'Bitcoin si mantiene sopra i 60K$ con segnali misti.',
      ar: 'البيتكوين يحافظ على مستوى 60 ألف دولار مع إشارات متباينة',
    },
    content: {
      en: `## Weekly Overview
Bitcoin continues to trade above the $60,000 support level, showing strength despite global economic uncertainty.

## Key Observations
- BTC dominance remains above 50%
- Ethereum shows potential breakout patterns
- Layer 2 solutions gaining traction

## Technical Outlook
Market structure suggests consolidation before the next major move. Key levels to watch:
- Support: $58,000 (BTC), $2,800 (ETH)
- Resistance: $65,000 (BTC), $3,200 (ETH)

## Disclaimer
This summary is for educational purposes only and does not constitute investment advice.`,
      es: `## Resumen Semanal\nBitcoin continúa operando sobre $60,000.\n\n## Observaciones\nEl mercado muestra consolidación.\n\n## Disclaimer\nContenido educativo.`,
      pt: `## Resumo Semanal\nBitcoin continua acima de $60.000.\n\n## Aviso\nConteúdo educativo.`,
      fr: `## Résumé Hebdomadaire\nBitcoin reste au-dessus de 60 000$.\n\n## Avertissement\nContenu éducatif.`,
      de: `## Wochenzusammenfassung\nBitcoin bleibt über 60.000$.\n\n## Hinweis\nBildungsinhalt.`,
      it: `## Riepilogo Settimanale\nBitcoin rimane sopra 60.000$.\n\n## Avviso\nContenuto educativo.`,
      ar: `## الملخص الأسبوعي\nالبيتكوين يحافظ على مستواه فوق 60,000 دولار\n\n## إخلاء مسؤولية\nمحتوى تعليمي`,
    },
  },
];

export function getBlogPost(slug: string): BlogPostData | undefined {
  return blogPosts.find(p => p.slug === slug);
}
