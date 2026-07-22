export interface Signal {
  id: string;
  created_at: string;
  coin: string;
  exchange: string;
  signal_type: 'buy' | 'sell';
  confidence: number;
  explanation_en: string;
  explanation_es: string;
  explanation_pt?: string;
  explanation_fr?: string;
  explanation_de?: string;
  explanation_it?: string;
  explanation_ar?: string;
  tier: 'free' | 'premium';
  entry_price: number | null;
  entry_price_min: number | null;
  entry_price_max: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  take_profit_1: number | null;
  take_profit_2: number | null;
  take_profit_3: number | null;
  risk_reward_ratio: number | null;
  risk_level: 'low' | 'medium' | 'high' | null;
  indicators_used: string[];
  fundamental_signals: string[];
  timeframe: string;
  slug: string | null;
  resolved_at: string | null;
  resolved_result: 'win' | 'loss' | 'pending' | null;
  resolved_price: number | null;
}

export interface UserProfile {
  id: string;
  email: string;
  plan: 'free' | 'premium';
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  idioma_preferido: string;
  created_at: string;
}

export interface SubscriptionEvent {
  id: string;
  created_at: string;
  event_type: string;
  stripe_event_id: string;
  data: Record<string, unknown>;
  processed: boolean;
}

export interface BlogPost {
  id: string;
  slug: string;
  title_en: string;
  title_es: string;
  content_en: string;
  content_es: string;
  excerpt_en: string;
  excerpt_es: string;
  category: string;
  published_at: string;
  tags: string[];
}
